// Unit de luna-boletin: evidencia resumida, prompt anclado en datos y parseo de
// la tool. node --test, sin deps. Importa el .ts directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodoActual, periodoDesdeClave, resumirActividad, serializarActividad,
  construirPromptBoletin, parseBoletin, TOOL_ESCRIBIR_BOLETIN,
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

// --- período ---

test('periodoActual del boletín coincide con el del lib del front (duplicado controlado)', () => {
  for (const f of [NOW, new Date(2026, 0, 3), new Date(2026, 11, 31), new Date(2027, 2, 15)]) {
    assert.deepEqual(periodoActual(f), periodoLib(f));
  }
});

test('periodoDesdeClave: parsea la clave y rechaza basura', () => {
  const p = periodoDesdeClave('2026-07');
  assert.equal(p?.label, 'julio 2026');
  assert.equal(new Date(p.desde).getTime(), new Date(2026, 6, 1).getTime());
  assert.equal(periodoDesdeClave('2026-13'), null);
  assert.equal(periodoDesdeClave('julio'), null);
  assert.equal(periodoDesdeClave(''), null);
});

// --- resumirActividad ---

test('resumirActividad: agrupa por materia/tema con sesiones, precisión y estado', () => {
  const sesiones = [
    { nodo_id: 'n1', fecha: dia(5), aciertos: 5, total: 6 },
    { nodo_id: 'n1', fecha: dia(20), aciertos: 3, total: 6 },
    { nodo_id: 'n2', fecha: dia(20), aciertos: 2, total: 4 },
  ];
  const respuestas = [
    ...Array.from({ length: 6 }, (_, i) => ({ nodoId: 'n1', tipo: 'reconocer', correcta: i < 5, createdAt: dia(5) })),
    ...Array.from({ length: 6 }, (_, i) => ({ nodoId: 'n1', tipo: 'producir', correcta: i < 3, createdAt: dia(20) })),
    ...Array.from({ length: 4 }, (_, i) => ({ nodoId: 'n2', tipo: 'completar', correcta: i < 2, createdAt: dia(20) })),
  ];
  const estados = [{ nodo_id: 'n1', estado: 'en_construccion' }];
  const d = resumirActividad('Lucía', 5, PERIODO, sesiones, respuestas, NODOS, MATERIAS, estados);
  assert.equal(d.nombre, 'Lucía');
  assert.equal(d.materias.length, 1);
  const verbos = d.materias[0].temas.find((t) => t.nombre === 'Verbos');
  assert.equal(verbos.sesiones, 2);
  assert.equal(verbos.precision, 67); // 8 de 12
  assert.equal(verbos.estado, 'en_construccion');
  assert.equal(d.totalSesiones, 3);
  assert.equal(d.totalRespuestas, 16);
  assert.equal(d.diasPracticados, 2); // días 5 y 20
  assert.equal(d.tipos.producir, 6);
  // evolución: día 5 cae en la 1ª mitad, día 20 en la 2ª
  assert.equal(d.evolucion.mitad1.sesiones, 1);
  assert.equal(d.evolucion.mitad2.sesiones, 2);
});

test('resumirActividad: sin actividad → vacío honesto, sin inventar temas', () => {
  const d = resumirActividad('Benja', 1, PERIODO, [], [], NODOS, MATERIAS, []);
  assert.equal(d.totalSesiones, 0);
  assert.deepEqual(d.materias[0].temas, []);
  assert.equal(d.evolucion.mitad1.precision, null);
  assert.match(serializarActividad(d), /sin actividad registrada/);
});

// --- prompt ---

test('construirPromptBoletin: exige no inventar y anclar cada afirmación en datos', () => {
  const d = resumirActividad('Lucía', 5, PERIODO, [], [], NODOS, MATERIAS, []);
  const { system } = construirPromptBoletin(d);
  assert.match(system, /NO inventes/);
  assert.match(system, /dato concreto/);
  assert.match(system, /familia/);
  assert.match(system, /rioplatense/);
  assert.match(system, /escribir_boletin/);
  assert.match(system, /BORRADOR/);
});

test('construirPromptBoletin: el user lleva la evidencia serializada, no otra cosa', () => {
  const sesiones = [{ nodo_id: 'n1', fecha: dia(5), aciertos: 5, total: 6 }];
  const rs = Array.from({ length: 6 }, (_, i) => ({ nodoId: 'n1', tipo: 'reconocer', correcta: i < 5, createdAt: dia(5) }));
  const d = resumirActividad('Lucía', 5, PERIODO, sesiones, rs, NODOS, MATERIAS, []);
  const { user } = construirPromptBoletin(d);
  assert.match(user, /Lucía \(5° grado\)/);
  assert.match(user, /julio 2026/);
  assert.match(user, /Verbos: 1 sesiones, precisión 83%/);
});

// --- parseBoletin (nunca tira) ---

test('parseBoletin: entrada válida pasa entera', () => {
  const c = parseBoletin({
    materias: [{ materia: 'Lengua', texto: 'Trabajó muy bien los verbos.' }],
    actitud: 'Se lo ve constante.',
    sugerencia: 'Seguir con lecturas cortas.',
  });
  assert.equal(c.materias.length, 1);
  assert.equal(c.actitud, 'Se lo ve constante.');
});

test('parseBoletin: null, basura y parciales → defaults sin tirar', () => {
  assert.deepEqual(parseBoletin(null), { materias: [], actitud: '', sugerencia: '' });
  assert.deepEqual(parseBoletin('zzz'), { materias: [], actitud: '', sugerencia: '' });
  const c = parseBoletin({ materias: [{ materia: 'Lengua' }, { texto: 'suelto' }, { materia: 'Mate', texto: 'ok' }], actitud: 7 });
  assert.deepEqual(c.materias, [{ materia: 'Mate', texto: 'ok' }]); // descarta malformadas
  assert.equal(c.actitud, '7');
});

// --- tool ---

test('TOOL_ESCRIBIR_BOLETIN: schema con las tres secciones requeridas', () => {
  assert.equal(TOOL_ESCRIBIR_BOLETIN.name, 'escribir_boletin');
  assert.deepEqual(TOOL_ESCRIBIR_BOLETIN.input_schema.required, ['materias', 'actitud', 'sugerencia']);
});
