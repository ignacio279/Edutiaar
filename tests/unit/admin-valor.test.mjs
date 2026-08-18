// Tests de las MÉTRICAS DE VALOR del panel admin (web/lib/admin/valor.ts).
// Spec: docs/superpowers/specs/2026-08-17-metricas-de-valor-design.md
// Mismo contrato que admin-metricas.test.mjs: datasets sintéticos, `now` FIJO,
// funciones puras (la Edge Function admin-metricas devuelve filas crudas y el
// cálculo vive acá). Listas vacías → ceros/null, NUNCA NaN.
// Correr: npm test (o node --test tests/unit/admin-valor.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  temasDominados, esfuerzoParaDominar, chicosDestrabados, histogramaPuntaje,
  coberturaNap, napSinTocar, copilotoAlertas, serieBoletines, overrideDocente,
  horasAhorradas, MIN_MUESTRA, MINUTOS_POR_BOLETIN,
} from '../../web/lib/admin/valor.ts';

const AHORA = new Date('2026-08-17T12:00:00Z');
const MS = AHORA.getTime();
const DIA = 86_400_000;
const hace = (d) => new Date(MS - d * DIA).toISOString();
const RANGO = { desde: new Date(MS - 30 * DIA), hasta: AHORA };

const hito = (over = {}) => ({
  tipo: 'dominado', alumno_id: 'a1', nodo_id: 'n1', escuela_id: 'e1', grado: 3,
  ejercicios_hasta: 50, puntaje: 75, origen: 'vivo', created_at: hace(1), ...over,
});

// ── 1. Temas dominados ──────────────────────────────────────────────────────

test('temasDominados: cuenta solo hitos vivos del rango y compara con el período previo', () => {
  const r = temasDominados([
    hito({ created_at: hace(2) }),
    hito({ created_at: hace(10), alumno_id: 'a2' }),
    hito({ created_at: hace(40) }), // período previo
    hito({ created_at: hace(45) }), // período previo
    hito({ created_at: hace(120) }), // fuera de los dos
    hito({ tipo: 'trabado', created_at: hace(3) }), // otro tipo
  ], RANGO);
  assert.equal(r.total, 2);
  assert.equal(r.previo, 2);
  assert.equal(r.delta, 0);
  assert.equal(r.chicos, 2);
});

test('temasDominados: el backfill NO entra en el período (fecha aproximada) pero se informa aparte', () => {
  const r = temasDominados([
    hito({ created_at: hace(2) }),
    hito({ origen: 'backfill', created_at: hace(2) }),
    hito({ origen: 'backfill', created_at: hace(300) }),
  ], RANGO);
  assert.equal(r.total, 1);
  assert.equal(r.historicos, 2);
});

test('temasDominados: sin datos → ceros, nunca NaN', () => {
  const r = temasDominados([], RANGO);
  assert.deepEqual([r.total, r.previo, r.delta, r.chicos, r.historicos], [0, 0, 0, 0, 0]);
});

// ── 2. Esfuerzo para dominar ────────────────────────────────────────────────

test('esfuerzoParaDominar: mediana de ejercicios hasta el hito, y serie por mes', () => {
  const r = esfuerzoParaDominar([
    hito({ ejercicios_hasta: 50, created_at: '2026-07-05T10:00:00Z' }),
    hito({ ejercicios_hasta: 70, created_at: '2026-07-20T10:00:00Z' }),
    hito({ ejercicios_hasta: 90, created_at: '2026-07-25T10:00:00Z' }),
    hito({ ejercicios_hasta: 52, created_at: '2026-08-02T10:00:00Z' }),
    hito({ ejercicios_hasta: 58, created_at: '2026-08-09T10:00:00Z' }),
  ]);
  assert.equal(r.mediana, 58); // mediana de [50,52,58,70,90]
  assert.equal(r.serie.length, 2);
  assert.deepEqual(r.serie[0], { mes: '2026-07', mediana: 70, n: 3 });
  assert.deepEqual(r.serie[1], { mes: '2026-08', mediana: 55, n: 2 }); // par → promedio
  assert.equal(r.tendencia, -15); // bajó: SOL elige mejor
});

test('esfuerzoParaDominar: ignora el backfill y los tipos que no son dominado', () => {
  const r = esfuerzoParaDominar([
    hito({ ejercicios_hasta: 10, origen: 'backfill' }),
    hito({ ejercicios_hasta: 200, tipo: 'trabado' }),
    hito({ ejercicios_hasta: 60 }),
  ]);
  assert.equal(r.mediana, 60);
  assert.equal(r.n, 1);
});

test('esfuerzoParaDominar: sin datos → mediana null y serie vacía', () => {
  const r = esfuerzoParaDominar([]);
  assert.equal(r.mediana, null);
  assert.equal(r.tendencia, null);
  assert.deepEqual(r.serie, []);
});

// ── 3. Chicos destrabados ───────────────────────────────────────────────────

test('chicosDestrabados: cuenta chicos distintos, no eventos', () => {
  const r = chicosDestrabados([
    hito({ tipo: 'destrabado', alumno_id: 'a1', nodo_id: 'n1', created_at: hace(2) }),
    hito({ tipo: 'destrabado', alumno_id: 'a1', nodo_id: 'n2', created_at: hace(3) }),
    hito({ tipo: 'destrabado', alumno_id: 'a2', created_at: hace(4) }),
    hito({ tipo: 'destrabado', alumno_id: 'a3', created_at: hace(60) }), // fuera de rango
    hito({ tipo: 'trabado', alumno_id: 'a9', created_at: hace(2) }),
  ], RANGO);
  assert.equal(r.chicos, 2);
  assert.equal(r.eventos, 3);
  assert.equal(r.trabados, 1);
});

// ── 4. Histograma de puntaje ────────────────────────────────────────────────

const snap = (fecha, bucket, nodos, escuela_id = 'e1') => ({ fecha, escuela_id, bucket, nodos });

test('histogramaPuntaje: suma colegios y compara la foto más reciente contra la de referencia', () => {
  const r = histogramaPuntaje([
    snap('2026-08-17', 0, 4), snap('2026-08-17', 7, 6),
    snap('2026-08-17', 7, 4, 'e2'),
    snap('2026-07-18', 0, 9), snap('2026-07-18', 7, 1),
  ], AHORA, 30);
  assert.equal(r.hoy.fecha, '2026-08-17');
  assert.equal(r.hoy.buckets[0], 4);
  assert.equal(r.hoy.buckets[7], 10);
  assert.equal(r.hoy.total, 14);
  assert.equal(r.antes.fecha, '2026-07-18');
  assert.equal(r.antes.total, 10);
  // La masa se corrió a la derecha: promedio de bucket sube.
  assert.ok(r.corrimiento > 0);
});

test('histogramaPuntaje: una sola foto → antes null y corrimiento null', () => {
  const r = histogramaPuntaje([snap('2026-08-17', 3, 5)], AHORA, 30);
  assert.equal(r.antes, null);
  assert.equal(r.corrimiento, null);
  assert.equal(r.hoy.buckets.length, 10);
});

test('histogramaPuntaje: sin snapshots → hoy en cero, sin NaN', () => {
  const r = histogramaPuntaje([], AHORA, 30);
  assert.equal(r.hoy.total, 0);
  assert.equal(r.hoy.fecha, null);
  assert.equal(r.antes, null);
});

// ── 5. Cobertura NAP ────────────────────────────────────────────────────────

const NAP = [
  { id: 't1', grado: 3, materia: 'Lengua', nombre: 'Leer' },
  { id: 't2', grado: 3, materia: 'Lengua', nombre: 'Escribir' },
  { id: 't3', grado: 3, materia: 'Matemática', nombre: 'Sumar' },
  { id: 't4', grado: 5, materia: 'Lengua', nombre: 'Argumentar' },
];

test('coberturaNap: cubierto y dominado por grado, contra el catálogo del grado', () => {
  const r = coberturaNap({
    napTemas: NAP,
    nodos: [
      { id: 'n1', nap_tema_id: 't1' },
      { id: 'n2', nap_tema_id: 't3' },
      { id: 'n3', nap_tema_id: null }, // fuera del marco (Ética, etc.)
      { id: 'n4', nap_tema_id: 't4' }, // tema de 5°
    ],
    alumnoNodo: [
      { alumno_id: 'a1', nodo_id: 'n1', estado: 'dominado' },
      { alumno_id: 'a1', nodo_id: 'n2', estado: 'en_construccion' },
      { alumno_id: 'a1', nodo_id: 'n3', estado: 'dominado' },
      { alumno_id: 'a1', nodo_id: 'n4', estado: 'dominado' }, // fuera de su grado
      { alumno_id: 'a2', nodo_id: 'n1', estado: 'no_empezado' }, // no cuenta
    ],
    alumnos: [{ id: 'a1', grado: 3 }, { id: 'a2', grado: 3 }],
  });
  const g3 = r.porGrado.find((x) => x.grado === 3);
  assert.equal(g3.temasTotal, 3);
  assert.equal(g3.cubiertos, 2); // t1 y t3
  assert.equal(g3.dominados, 1); // solo t1
  assert.equal(g3.fueraDeGrado, 1); // t4, de 5°
  assert.equal(g3.alumnos, 2);
  assert.equal(g3.pctCubierto, 67);
});

test('coberturaNap: sin alumnos de un grado, ese grado no aparece', () => {
  const r = coberturaNap({ napTemas: NAP, nodos: [], alumnoNodo: [], alumnos: [{ id: 'a1', grado: 3 }] });
  assert.deepEqual(r.porGrado.map((g) => g.grado), [3]);
  assert.equal(r.porGrado[0].cubiertos, 0);
  assert.equal(r.porGrado[0].pctCubierto, 0);
});

test('coberturaNap: global pondera por alumno, no por grado', () => {
  const r = coberturaNap({
    napTemas: NAP,
    nodos: [{ id: 'n1', nap_tema_id: 't1' }],
    alumnoNodo: [{ alumno_id: 'a1', nodo_id: 'n1', estado: 'en_construccion' }],
    alumnos: [{ id: 'a1', grado: 3 }],
  });
  assert.equal(r.global.pctCubierto, 33); // 1 de 3 temas de 3°
  assert.equal(r.global.temasTotal, 3);
});

test('coberturaNap: sin datos → global en cero y sin NaN', () => {
  const r = coberturaNap({ napTemas: [], nodos: [], alumnoNodo: [], alumnos: [] });
  assert.equal(r.global.pctCubierto, 0);
  assert.deepEqual(r.porGrado, []);
});

// ── 6. NAP sin tocar ────────────────────────────────────────────────────────

test('napSinTocar: lista los temas del catálogo que ningún nodo mapea', () => {
  const r = napSinTocar(NAP, [{ id: 'n1', nap_tema_id: 't1' }, { id: 'n2', nap_tema_id: 't1' }]);
  assert.equal(r.total, 4);
  assert.equal(r.cubiertos, 1);
  assert.deepEqual(r.sinTocar.map((t) => t.id).sort(), ['t2', 't3', 't4']);
  const lengua = r.porMateria.find((m) => m.materia === 'Lengua');
  assert.equal(lengua.sinTocar, 2);
  assert.equal(lengua.total, 3);
});

test('napSinTocar: catálogo vacío → ceros', () => {
  const r = napSinTocar([], []);
  assert.deepEqual([r.total, r.cubiertos, r.sinTocar.length], [0, 0, 0]);
});

// ── 7. Alertas del copiloto ─────────────────────────────────────────────────

test('copilotoAlertas: tasa de atención y mediana de horas hasta atender', () => {
  const em = (clave, tipo, dias, prioridad = 'alta') => ({ docente_id: 'd1', clave, tipo, prioridad, primera_vez_at: hace(dias) });
  const r = copilotoAlertas(
    [
      em('inactividad:a1', 'inactividad', 10),
      em('inactividad:a2', 'inactividad', 9),
      em('caida_precision:a3', 'caida_precision', 8),
      em('evita_tipo:a4', 'evita_tipo', 7),
      em('adelantado:a5', 'adelantado', 6, 'info'),
      em('inactividad:a6', 'inactividad', 60), // fuera de rango
    ],
    [
      { docente_id: 'd1', clave: 'inactividad:a1', atendida_at: hace(9) }, // 1 día
      { docente_id: 'd1', clave: 'inactividad:a2', atendida_at: hace(6) }, // 3 días
      { docente_id: 'd1', clave: 'caida_precision:a3', atendida_at: hace(6) }, // 2 días
      { docente_id: 'd1', clave: 'no-emitida:aX', atendida_at: hace(1) }, // sin emisión: se ignora
    ],
    RANGO,
  );
  assert.equal(r.emitidas, 5);
  assert.equal(r.atendidas, 3);
  assert.equal(r.tasa, 60);
  assert.equal(r.medianaHoras, 48); // mediana de [24, 72, 48]
  const inact = r.porTipo.find((t) => t.tipo === 'inactividad');
  assert.deepEqual([inact.emitidas, inact.atendidas], [2, 2]);
});

test('copilotoAlertas: muestra chica → tasa null (no se pinta un porcentaje mentiroso)', () => {
  const r = copilotoAlertas(
    [{ docente_id: 'd1', clave: 'inactividad:a1', tipo: 'inactividad', prioridad: 'alta', primera_vez_at: hace(2) }],
    [],
    RANGO,
  );
  assert.equal(r.emitidas, 1);
  assert.ok(r.emitidas < MIN_MUESTRA);
  assert.equal(r.tasa, null);
});

test('copilotoAlertas: sin nada → ceros y null, sin NaN', () => {
  const r = copilotoAlertas([], [], RANGO);
  assert.deepEqual([r.emitidas, r.atendidas], [0, 0]);
  assert.equal(r.tasa, null);
  assert.equal(r.medianaHoras, null);
});

// ── 8. Serie de boletines ───────────────────────────────────────────────────

const bol = (mes, dia, estado, version) => ({ estado, version, created_at: `2026-${mes}-${dia}T10:00:00Z` });

test('serieBoletines: tasa de "aprobado sin editar" por mes, como tendencia', () => {
  const r = serieBoletines([
    ...Array.from({ length: 4 }, () => bol('07', '05', 'aprobado', 1)),
    bol('07', '06', 'aprobado', 3),
    bol('07', '07', 'borrador', 1),
    ...Array.from({ length: 5 }, () => bol('08', '05', 'aprobado', 1)),
    ...Array.from({ length: 5 }, () => bol('08', '06', 'aprobado', 2)),
  ]);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { mes: '2026-07', generados: 6, aprobados: 5, sinEditar: 4, tasa: 67 });
  assert.deepEqual(r[1], { mes: '2026-08', generados: 10, aprobados: 10, sinEditar: 5, tasa: 50 });
});

test('serieBoletines: mes con menos de MIN_MUESTRA → tasa null', () => {
  const r = serieBoletines([bol('08', '05', 'aprobado', 1), bol('08', '06', 'aprobado', 2)]);
  assert.equal(r[0].tasa, null);
  assert.equal(r[0].generados, 2);
});

test('serieBoletines: vacío → []', () => {
  assert.deepEqual(serieBoletines([]), []);
});

// ── 9. Override docente ─────────────────────────────────────────────────────

test('overrideDocente: eventos del rango + stock actual sobre el total de nodos', () => {
  const r = overrideDocente(
    [
      hito({ tipo: 'override', created_at: hace(3) }),
      hito({ tipo: 'override', created_at: hace(5), alumno_id: 'a2' }),
      hito({ tipo: 'override', created_at: hace(90) }),
      hito({ tipo: 'override', origen: 'backfill', created_at: hace(3) }),
      hito({ tipo: 'dominado', created_at: hace(3) }),
    ],
    { conOverride: 12, total: 200 },
    RANGO,
  );
  assert.equal(r.eventos, 2);
  assert.equal(r.chicos, 2);
  assert.equal(r.stock, 12);
  assert.equal(r.pctStock, 6);
});

test('overrideDocente: sin nodos → pct 0, nunca división por cero', () => {
  const r = overrideDocente([], { conOverride: 0, total: 0 }, RANGO);
  assert.equal(r.pctStock, 0);
  assert.equal(r.eventos, 0);
});

// ── 10. Horas ahorradas ─────────────────────────────────────────────────────

test('horasAhorradas: solo boletines aprobados del rango, con el supuesto explícito', () => {
  const r = horasAhorradas([
    { estado: 'aprobado', version: 1, created_at: hace(2) },
    { estado: 'aprobado', version: 4, created_at: hace(3) },
    { estado: 'borrador', version: 1, created_at: hace(4) },
    { estado: 'aprobado', version: 1, created_at: hace(90) },
  ], RANGO);
  assert.equal(r.boletines, 2);
  assert.equal(r.minutosPorBoletin, MINUTOS_POR_BOLETIN);
  assert.equal(r.horas, Math.round((2 * MINUTOS_POR_BOLETIN) / 60 * 10) / 10);
  assert.equal(r.estimado, true);
});

test('horasAhorradas: vacío → 0 horas', () => {
  const r = horasAhorradas([], RANGO);
  assert.deepEqual([r.boletines, r.horas], [0, 0]);
});
