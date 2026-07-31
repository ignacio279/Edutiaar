// Unit de luna-boletin: system fijo (spec de prompts 2026-07-31), evidencia
// resumida (<datos_del_alumno>), evolución/racha/días hábiles, comparación con
// el período anterior y parseo del JSON crudo con retry.
// node --test, sin deps. Importa el .ts directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_BOLETIN, PROMPT_REINTENTO_JSON, periodoActual, periodoDesdeClave, claveAnterior,
  diasHabilesDelPeriodo, rachaMaxima, evolucionTema, observacionesTema, compararPeriodos,
  resumirActividad, serializarActividad, construirPromptBoletin,
  extraerJson, parseBoletin, esBoletinValido,
} from '../../supabase/functions/luna-boletin/boletin.ts';
import { periodoActual as periodoLib } from '../../web/lib/luna.ts';

const NOW = new Date(2026, 6, 28, 12, 0, 0);
const PERIODO = periodoActual(NOW);

const dia = (d, h = 10) => new Date(2026, 6, d, h, 0, 0).toISOString();

const NODOS = [
  { id: 'n1', nombre: 'Verbos', programa_id: 'p5' },
  { id: 'n2', nombre: 'Tildes', programa_id: 'p5' },
];
const MATERIAS = [{ nombre: 'Lengua', programa_id: 'p5' }];

const resp = (nodoId, d, correcta, tipo = 'reconocer', reintentos = 0) =>
  ({ nodoId, tipo, correcta, createdAt: dia(d), reintentos });

// --- SYSTEM_BOLETIN (fijo, verbatim del spec) ---

test('SYSTEM_BOLETIN: reglas de evidencia, tono, proceso y formato JSON', () => {
  assert.match(SYSTEM_BOLETIN, /EVIDENCIA OBLIGATORIA/);
  assert.match(SYSTEM_BOLETIN, /Prohibido inventar/);
  assert.match(SYSTEM_BOLETIN, /poca actividad registrada/);         // fallback honesto
  assert.match(SYSTEM_BOLETIN, /Nada de\s+jerga técnica ni porcentajes crudos/);
  assert.match(SYSTEM_BOLETIN, /No compares al alumno con sus compañeros/);
  assert.match(SYSTEM_BOLETIN, /nombre de pila/);
  assert.match(SYSTEM_BOLETIN, /entre 40 y 80 palabras/);
  assert.match(SYSTEM_BOLETIN, /ÚNICAMENTE con un JSON válido/);
  assert.match(SYSTEM_BOLETIN, /"secciones"/);
  assert.match(SYSTEM_BOLETIN, /"sugerencia_proximo_periodo"/);
  assert.match(PROMPT_REINTENTO_JSON, /JSON corregido/);
});

// --- período ---

test('periodoActual del boletín coincide con el del lib del front (duplicado controlado)', () => {
  for (const f of [NOW, new Date(2026, 0, 3), new Date(2026, 11, 31), new Date(2027, 2, 15)]) {
    assert.deepEqual(periodoActual(f), periodoLib(f));
  }
});

test('periodoDesdeClave y claveAnterior: parsean, rechazan basura y cruzan el año', () => {
  assert.equal(periodoDesdeClave('2026-07')?.label, 'julio 2026');
  assert.equal(periodoDesdeClave('2026-13'), null);
  assert.equal(periodoDesdeClave('julio'), null);
  assert.equal(claveAnterior('2026-07'), '2026-06');
  assert.equal(claveAnterior('2026-01'), '2025-12');
  assert.equal(claveAnterior('basura'), null);
});

// --- helpers de actividad ---

test('diasHabilesDelPeriodo: julio 2026 tiene 23 hábiles (lun-vie)', () => {
  assert.equal(diasHabilesDelPeriodo(PERIODO.desde, PERIODO.hasta), 23);
  assert.equal(diasHabilesDelPeriodo(dia(6, 0), dia(13, 0)), 5); // una semana justa (límites a medianoche)
});

test('rachaMaxima: días de calendario consecutivos con práctica', () => {
  assert.equal(rachaMaxima([]), 0);
  assert.equal(rachaMaxima([dia(10)]), 1);
  assert.equal(rachaMaxima([dia(10), dia(10, 15), dia(11), dia(12), dia(20), dia(21)]), 3);
});

test('evolucionTema: mejoró / bajó / estable / sin datos, con muestra mínima por quincena', () => {
  // 1ª quincena (días 1-15) vs 2ª (16-31): 4+ respuestas por mitad
  const mejora = [
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 5, i < 1)),   // 25%
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 25, i < 3)),  // 75%
  ];
  assert.equal(evolucionTema(mejora, PERIODO.desde, PERIODO.hasta), 'mejoró');
  const baja = [
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 5, i < 4)),   // 100%
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 25, i < 2)),  // 50%
  ];
  assert.equal(evolucionTema(baja, PERIODO.desde, PERIODO.hasta), 'bajó');
  const estable = [
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 5, i < 3)),
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 25, i < 3)),
  ];
  assert.equal(evolucionTema(estable, PERIODO.desde, PERIODO.hasta), 'estable');
  assert.equal(evolucionTema(mejora.slice(0, 7), PERIODO.desde, PERIODO.hasta), 'sin datos suficientes');
});

test('observacionesTema: evita producir y reintenta tras el error, solo con datos', () => {
  const evita = Array.from({ length: 8 }, () => resp('n1', 5, true, 'reconocer'));
  assert.deepEqual(observacionesTema(evita), ['evita los ejercicios de producir']);
  const reintenta = [
    resp('n1', 5, true, 'producir'),
    resp('n1', 5, false, 'reconocer', 1), resp('n1', 6, false, 'reconocer', 2), resp('n1', 7, false, 'reconocer', 1),
  ];
  assert.deepEqual(observacionesTema(reintenta), ['reintenta tras el error']);
  assert.deepEqual(observacionesTema([resp('n1', 5, true, 'producir')]), []);
});

test('compararPeriodos: intra-alumno, y honesto sin período anterior', () => {
  assert.match(compararPeriodos({ sesiones: 3, precision: 80 }, null, null), /Primer período con actividad/);
  assert.match(
    compararPeriodos({ sesiones: 5, precision: 82 }, { sesiones: 3, precision: 60 }, 'junio 2026'),
    /practicó más que en junio 2026 \(5 vs 3 sesiones\) y su precisión subió/,
  );
  assert.match(
    compararPeriodos({ sesiones: 2, precision: 50 }, { sesiones: 4, precision: 55 }, 'junio 2026'),
    /practicó menos.*se mantuvo estable/,
  );
});

// --- resumirActividad + serializarActividad ---

test('resumirActividad: temas por materia con evolución y observaciones; totales', () => {
  const sesiones = [
    { nodo_id: 'n1', fecha: dia(5), aciertos: 3, total: 4 },
    { nodo_id: 'n1', fecha: dia(6), aciertos: 3, total: 4 },
    { nodo_id: 'n2', fecha: dia(25), aciertos: 2, total: 4 },
  ];
  const respuestas = [
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 5, i < 1)),
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 25, i < 3)),
    ...Array.from({ length: 4 }, (_, i) => resp('n2', 25, i < 2)),
  ];
  const d = resumirActividad('Lucía', 5, PERIODO, sesiones, respuestas, NODOS, MATERIAS,
    { sesiones: [{ nodo_id: 'n1', fecha: '2026-06-10T10:00:00Z' }], respuestas: [resp('n1', 5, true)], label: 'junio 2026' });
  assert.equal(d.nombre, 'Lucía');
  assert.equal(d.diasActivos, 3);
  assert.equal(d.diasHabiles, 23);
  assert.equal(d.rachaMaxima, 2); // días 5 y 6
  assert.equal(d.totalEjercicios, 12);
  const verbos = d.temas.find((t) => t.tema === 'Verbos');
  assert.equal(verbos.cantidad, 8);
  assert.equal(verbos.evolucion, 'mejoró');
  assert.match(d.comparacionAnterior, /junio 2026/);
});

test('resumirActividad: tema que bajó y evita producir alimentan las alertas del período', () => {
  const sesiones = [{ nodo_id: 'n1', fecha: dia(5) }, { nodo_id: 'n1', fecha: dia(25) }];
  const respuestas = [
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 5, i < 4)),
    ...Array.from({ length: 4 }, (_, i) => resp('n1', 25, i < 1)),
  ];
  const d = resumirActividad('Benja', 1, PERIODO, sesiones, respuestas, NODOS, MATERIAS);
  assert.ok(d.alertasPeriodo.some((a) => /Bajó la precisión en Verbos/.test(a)));
  assert.ok(d.alertasPeriodo.some((a) => /Evitó los ejercicios de producir en Verbos/.test(a)));
});

test('serializarActividad: bloque <datos_del_alumno> con las líneas del spec', () => {
  const sesiones = [{ nodo_id: 'n1', fecha: dia(5), aciertos: 3, total: 4 }];
  const rs = Array.from({ length: 4 }, (_, i) => resp('n1', 5, i < 3));
  const d = resumirActividad('Lucía', 5, PERIODO, sesiones, rs, NODOS, MATERIAS);
  const s = serializarActividad(d);
  assert.match(s, /^<datos_del_alumno>/);
  assert.match(s, /<\/datos_del_alumno>$/);
  assert.match(s, /Alumno: Lucía — 5° grado/);
  assert.match(s, /Período: julio 2026 \(del 1 de julio de 2026 al 31 de julio de 2026\)/);
  assert.match(s, /- Días activos: 1 de 23 hábiles — racha máxima: 1 día seguidos/);
  assert.match(s, /- Ejercicios resueltos: 4 \(en 1 sesiones\)/);
  assert.match(s, /- Lengua — Verbos: 4 ejercicios, precisión 75%, evolución: sin datos suficientes/);
  assert.match(s, /Primer período con actividad registrada/);
  assert.match(s, /Sin alertas en el período\./);
});

test('sin actividad → vacío honesto, sin inventar temas', () => {
  const d = resumirActividad('Benja', 1, PERIODO, [], [], NODOS, MATERIAS);
  assert.equal(d.totalSesiones, 0);
  assert.deepEqual(d.temas, []);
  assert.match(serializarActividad(d), /Sin actividad registrada por tema/);
});

test('construirPromptBoletin: system fijo + evidencia serializada', () => {
  const d = resumirActividad('Lucía', 5, PERIODO, [], [], NODOS, MATERIAS);
  const { system, user } = construirPromptBoletin(d);
  assert.equal(system, SYSTEM_BOLETIN);
  assert.match(user, /<datos_del_alumno>/);
});

// --- extraerJson / parseBoletin / esBoletinValido ---

test('extraerJson: saca el JSON aunque venga con texto alrededor; basura → null', () => {
  const j = extraerJson('Acá va:\n{"secciones":[{"titulo":"Lengua","texto":"ok"}],"actitud":"a","sugerencia_proximo_periodo":"s"}\nlisto');
  assert.equal(j.secciones[0].titulo, 'Lengua');
  assert.equal(extraerJson('sin json acá'), null);
  assert.equal(extraerJson('{roto'), null);
});

test('parseBoletin: entrada válida pasa entera; null/basura/parciales → defaults sin tirar', () => {
  const ok = parseBoletin({
    secciones: [{ titulo: 'Lengua', texto: 'Trabajó muy bien los verbos.' }],
    actitud: 'Se lo ve constante.',
    sugerencia_proximo_periodo: 'Seguir con lecturas cortas.',
  });
  assert.equal(ok.secciones.length, 1);
  assert.equal(ok.sugerencia_proximo_periodo, 'Seguir con lecturas cortas.');
  assert.deepEqual(parseBoletin(null), { secciones: [], actitud: '', sugerencia_proximo_periodo: '' });
  assert.deepEqual(parseBoletin('zzz'), { secciones: [], actitud: '', sugerencia_proximo_periodo: '' });
  const c = parseBoletin({ secciones: [{ titulo: 'Lengua' }, { texto: 'suelto' }, { titulo: 'Mate', texto: 'ok' }], actitud: 7 });
  assert.deepEqual(c.secciones, [{ titulo: 'Mate', texto: 'ok' }]); // descarta malformadas
  assert.equal(c.actitud, '7');
});

test('esBoletinValido: exige al menos una sección + actitud + sugerencia', () => {
  const base = { secciones: [{ titulo: 'L', texto: 't' }], actitud: 'a', sugerencia_proximo_periodo: 's' };
  assert.equal(esBoletinValido(base), true);
  assert.equal(esBoletinValido({ ...base, secciones: [] }), false);
  assert.equal(esBoletinValido({ ...base, actitud: '' }), false);
  assert.equal(esBoletinValido({ ...base, sugerencia_proximo_periodo: '' }), false);
});
