// Unit — lógica pura de la cola de revisión del mapeo NAP (Task 7).
// Correr: npm test (o node --test tests/unit/admin-nap-revision-logica.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  armarCatalogoGrado, armarNodosRevision, gradoCoincide, normalizarNapTemaId, partirPorBanda,
  soloNodosReales, SIN_COLEGIO,
} from '../../supabase/functions/admin-colegios/nap-revision-logica.ts';

// ── armarCatalogoGrado ───────────────────────────────────────────────────

test('armarCatalogoGrado: ordena por materia → eje → tema, no por el orden de llegada', () => {
  const filas = [
    { id: 't-mate-2', nombre: 'Fracciones', texto_oficial: 'NAP mate 2', orden: 1, nap_eje: { materia: 'Matemática', nombre: 'Número y operaciones', orden: 0 } },
    { id: 't-leng-1', nombre: 'Vocales', texto_oficial: 'NAP lengua 1', orden: 0, nap_eje: { materia: 'Lengua', nombre: 'Oralidad', orden: 0 } },
    { id: 't-mate-1', nombre: 'Suma', texto_oficial: 'NAP mate 1', orden: 0, nap_eje: { materia: 'Matemática', nombre: 'Número y operaciones', orden: 0 } },
  ];
  const out = armarCatalogoGrado(filas);
  assert.deepEqual(out.map((t) => t.id), ['t-leng-1', 't-mate-1', 't-mate-2']);
  assert.equal(out[0].materia, 'Lengua');
  assert.equal(out[0].eje, 'Oralidad');
  assert.equal(out[0].texto_oficial, 'NAP lengua 1');
});

test('armarCatalogoGrado: respeta el orden del eje antes que el alfabético de materia dentro de la misma materia', () => {
  const filas = [
    { id: 't-eje2', nombre: 'Z', texto_oficial: null, orden: 0, nap_eje: { materia: 'Lengua', nombre: 'Eje B', orden: 1 } },
    { id: 't-eje1', nombre: 'A', texto_oficial: null, orden: 0, nap_eje: { materia: 'Lengua', nombre: 'Eje A', orden: 0 } },
  ];
  const out = armarCatalogoGrado(filas);
  assert.deepEqual(out.map((t) => t.id), ['t-eje1', 't-eje2']);
});

test('armarCatalogoGrado: tolera nap_eje como array de 1 (otro shape posible de PostgREST)', () => {
  const filas = [
    { id: 't1', nombre: 'A', texto_oficial: null, orden: 0, nap_eje: [{ materia: 'Lengua', nombre: 'Eje', orden: 0 }] },
  ];
  const out = armarCatalogoGrado(filas);
  assert.equal(out[0].materia, 'Lengua');
  assert.equal(out[0].eje, 'Eje');
});

test('armarCatalogoGrado: nap_eje ausente no rompe, cae a strings vacíos', () => {
  const out = armarCatalogoGrado([{ id: 't1', nombre: 'A', texto_oficial: null, orden: 0, nap_eje: null }]);
  assert.equal(out[0].materia, '');
  assert.equal(out[0].eje, '');
});

// ── armarNodosRevision ───────────────────────────────────────────────────

const NODO_BASE = {
  id: 'n1', nombre: 'Vocales', nap_tema_id: null, nap_confianza: null, nap_intentos: 0,
  programa_id: 'p1', programa: { grado: 1, materia: { nombre: 'Lengua' } },
};
const CATALOGO_G1 = [{ id: 't1', nombre: 'Fonemas', eje: 'Oralidad', materia: 'Lengua', texto_oficial: 'texto' }];

test('armarNodosRevision: arma la fila con colegio, materia, grado y el catálogo de su grado', () => {
  const out = armarNodosRevision(
    [NODO_BASE],
    new Map([['p1', 'Escuela Rural N° 12']]),
    new Map([[1, CATALOGO_G1]]),
  );
  assert.deepEqual(out, [{
    id: 'n1', nombre: 'Vocales', descripcion: null, ejemplos: [],
    colegio: 'Escuela Rural N° 12', materia: 'Lengua', grado: 1,
    nap_tema_id: null, nap_confianza: null, nap_intentos: 0, temas_posibles: CATALOGO_G1,
  }]);
});

test('armarNodosRevision: sin sol_materia (programa huérfano) cae al colegio de fallback, no rompe', () => {
  const out = armarNodosRevision([NODO_BASE], new Map(), new Map([[1, CATALOGO_G1]]));
  assert.equal(out[0].colegio, SIN_COLEGIO);
});

test('armarNodosRevision: sin catálogo cargado para ese grado, temas_posibles queda vacío (no undefined)', () => {
  const out = armarNodosRevision([NODO_BASE], new Map([['p1', 'Escuela']]), new Map());
  assert.deepEqual(out[0].temas_posibles, []);
});

test('armarNodosRevision: propaga nap_intentos tal cual, incluido el tope (3)', () => {
  const nodoAlTope = { ...NODO_BASE, id: 'n2', nap_intentos: 3 };
  const out = armarNodosRevision([nodoAlTope], new Map(), new Map());
  assert.equal(out[0].nap_intentos, 3);
});

test('armarNodosRevision: programa null (defensivo) no revienta: materia y colegio caen a fallback, grado null', () => {
  const nodoSinPrograma = { ...NODO_BASE, id: 'n3', programa: null };
  const out = armarNodosRevision([nodoSinPrograma], new Map(), new Map());
  assert.equal(out[0].grado, null);
  assert.equal(out[0].materia, '(sin materia)');
  assert.deepEqual(out[0].temas_posibles, []);
});

// ── normalizarNapTemaId ──────────────────────────────────────────────────

test('normalizarNapTemaId: null o ausente = "Fuera del marco", no es error', () => {
  assert.deepEqual(normalizarNapTemaId(null), { ok: true, value: null });
  assert.deepEqual(normalizarNapTemaId(undefined), { ok: true, value: null });
});

test('normalizarNapTemaId: string no vacío se acepta y se recorta', () => {
  assert.deepEqual(normalizarNapTemaId('  abc-123  '), { ok: true, value: 'abc-123' });
});

test('normalizarNapTemaId: string vacío, número u objeto rebotan', () => {
  assert.deepEqual(normalizarNapTemaId(''), { ok: false });
  assert.deepEqual(normalizarNapTemaId('   '), { ok: false });
  assert.deepEqual(normalizarNapTemaId(42), { ok: false });
  assert.deepEqual(normalizarNapTemaId({}), { ok: false });
});

// ── gradoCoincide (Hallazgo 1, fix round 1) ───────────────────────────────

test('gradoCoincide: "Fuera del marco" (napTemaId null) siempre vale, no hay grado que comparar', () => {
  assert.equal(gradoCoincide(null, 1, 7), true);
  assert.equal(gradoCoincide(null, null, null), true);
});

test('gradoCoincide: con tema, los grados tienen que coincidir', () => {
  assert.equal(gradoCoincide('t1', 3, 3), true);
  assert.equal(gradoCoincide('t1', 1, 7), false);
  assert.equal(gradoCoincide('t1', 7, 1), false);
});

test('gradoCoincide: con tema pero sin alguno de los dos grados (programa u orfandad de datos), rebota', () => {
  assert.equal(gradoCoincide('t1', null, 3), false);
  assert.equal(gradoCoincide('t1', 3, null), false);
  assert.equal(gradoCoincide('t1', null, null), false);
});

// ── soloNodosReales (Hallazgo 2, review final) ────────────────────────────

const nodoDe = (id, nombreMateria) => ({
  id, nombre: id, nap_tema_id: null, nap_confianza: null, nap_intentos: 0,
  programa_id: `p-${id}`, programa: { grado: 1, materia: { nombre: nombreMateria } },
});

test('soloNodosReales: saca los nodos de materias de test (mismo prefijo que usa nap_backfill)', () => {
  const reales = [nodoDe('a', 'Lengua'), nodoDe('b', 'TestRep xf20n1m5y8fkcjec8en9n'), nodoDe('c', 'Matemática')];
  const out = soloNodosReales(reales);
  assert.deepEqual(out.map((n) => n.id), ['a', 'c']);
});

test('soloNodosReales: sin materias de test, no saca nada', () => {
  const reales = [nodoDe('a', 'Lengua'), nodoDe('b', 'Ciencias Naturales')];
  assert.deepEqual(soloNodosReales(reales), reales);
});

test('soloNodosReales: nodo sin programa (defensivo) no revienta y queda adentro', () => {
  const nodoSinPrograma = { ...nodoDe('x', 'Lengua'), programa: null };
  const out = soloNodosReales([nodoSinPrograma]);
  assert.equal(out.length, 1);
});

// ── partirPorBanda (auto-triage por banda, 2026-08-18) ────────────────────

const conBanda = (id, tema, conf) => ({ ...nodoDe(id, 'Lengua'), nap_tema_id: tema, nap_confianza: conf });

test('partirPorBanda: banda media y mapeo sin respaldo van a pendientes', () => {
  const out = partirPorBanda([
    conBanda('medio', 't1', 0.65),
    conBanda('sin-respaldo', 't1', null),
  ]);
  assert.deepEqual(out.pendientes.map((n) => n.id), ['medio', 'sin-respaldo']);
  assert.deepEqual(out.descartados, []);
});

test('partirPorBanda: sin propuesta o confianza baja van a descartados', () => {
  const out = partirPorBanda([
    conBanda('sin-tema', null, null),
    conBanda('bajo', 't1', 0.55),
  ]);
  assert.deepEqual(out.pendientes, []);
  assert.deepEqual(out.descartados.map((n) => n.id), ['sin-tema', 'bajo']);
});

test('partirPorBanda: un confiable que se coló en la consulta no aparece en ninguna vista', () => {
  const out = partirPorBanda([conBanda('alto', 't1', 0.9)]);
  assert.deepEqual(out.pendientes, []);
  assert.deepEqual(out.descartados, []);
});

test('partirPorBanda: preserva el orden de llegada dentro de cada vista', () => {
  const out = partirPorBanda([
    conBanda('b', 't1', 0.7), conBanda('x', null, null), conBanda('a', 't1', 0.6),
  ]);
  assert.deepEqual(out.pendientes.map((n) => n.id), ['b', 'a']);
  assert.deepEqual(out.descartados.map((n) => n.id), ['x']);
});

// ── contexto del nodo en la tarjeta (descripcion + ejercicios de muestra) ──

test('armarNodosRevision: propaga la descripcion y los ejercicios de muestra del nodo', () => {
  const nodoConDesc = { ...NODO_BASE, descripcion: 'Reconocer las vocales en palabras cortas' };
  const out = armarNodosRevision(
    [nodoConDesc],
    new Map([['p1', 'Escuela']]),
    new Map([[1, CATALOGO_G1]]),
    new Map([['n1', ['¿Cuál empieza con A?', '¿Cuántas vocales tiene "mate"?']]]),
  );
  assert.equal(out[0].descripcion, 'Reconocer las vocales en palabras cortas');
  assert.deepEqual(out[0].ejemplos, ['¿Cuál empieza con A?', '¿Cuántas vocales tiene "mate"?']);
});

test('armarNodosRevision: sin descripcion ni ejemplos cae a null y lista vacía (no undefined)', () => {
  const out = armarNodosRevision([NODO_BASE], new Map(), new Map());
  assert.equal(out[0].descripcion, null);
  assert.deepEqual(out[0].ejemplos, []);
});
