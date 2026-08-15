// Unit — backfill NAP (Task 6): lógica pura de
// supabase/functions/admin-jobs/nap-backfill-logica.ts. Sin red ni API key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esMateriaDeTest, construirPromptBackfill, emparejarResultado, agruparPorPrograma, sinExcluidos,
  armarUpdates,
} from '../../supabase/functions/admin-jobs/nap-backfill-logica.ts';

const TEMAS = [
  { id: 't1', nombre: 'Vocales', eje: 'Lectura', materia: 'Lengua', texto_oficial: 'El reconocimiento de las vocales en palabras de uso frecuente.' },
];

test('esMateriaDeTest excluye TestRep/TestGen/TEST-bor- por prefijo', () => {
  assert.equal(esMateriaDeTest('TestRep xf20n1m5y8fkcjec8en9n'), true);
  assert.equal(esMateriaDeTest('TestGen algo'), true);
  assert.equal(esMateriaDeTest('TEST-bor-123'), true);
  assert.equal(esMateriaDeTest('Lengua'), false);
  assert.equal(esMateriaDeTest('Matematicas'), false);
  assert.equal(esMateriaDeTest(null), false);
  assert.equal(esMateriaDeTest(undefined), false);
});

test('construirPromptBackfill incluye el catálogo, la instrucción NAP y lista los nodos en orden', () => {
  const nodos = [
    { id: 'n1', nombre: 'Las vocales', descripcion: 'Reconocer las vocales.' },
    { id: 'n2', nombre: 'Mi nombre', descripcion: null },
  ];
  const { system, user } = construirPromptBackfill('Lengua', 1, nodos, TEMAS);
  assert.ok(system.includes('t1'));
  assert.ok(system.includes('El reconocimiento de las vocales'));
  assert.match(system, /nap_tema_id: null/); // NAP_INSTRUCCION viajó tal cual
  assert.match(user, /1\. "Las vocales" — Reconocer las vocales\./);
  assert.match(user, /2\. "Mi nombre" \(sin descripción\)/);
});

test('emparejarResultado valida con parseDivision y empareja por posición', () => {
  const nodosDePrograma = [
    { id: 'n1', nombre: 'Las vocales', descripcion: '' },
    { id: 'n2', nombre: 'Mi nombre', descripcion: '' },
  ];
  const capturado = {
    nodos: [
      { nombre: 'Las vocales', orden: 0, nap_tema_id: 't1', nap_confianza: 0.9 },
      { nombre: 'Mi nombre', orden: 1, nap_tema_id: null },
    ],
  };
  const { resultados, avisos } = emparejarResultado(nodosDePrograma, capturado, 'Lengua', 1, TEMAS);
  assert.deepEqual(resultados, [
    { nodo_id: 'n1', nombre: 'Las vocales', nap_tema_id: 't1', nap_confianza: 0.9 },
    { nodo_id: 'n2', nombre: 'Mi nombre', nap_tema_id: null, nap_confianza: null },
  ]);
  assert.deepEqual(avisos, []);
});

test('emparejarResultado descarta un tema inventado (misma validación que publicar)', () => {
  const nodosDePrograma = [{ id: 'n1', nombre: 'Las vocales', descripcion: '' }];
  const capturado = { nodos: [{ nombre: 'Las vocales', orden: 0, nap_tema_id: 'inventado', nap_confianza: 1 }] };
  const { resultados } = emparejarResultado(nodosDePrograma, capturado, 'Lengua', 1, TEMAS);
  assert.equal(resultados[0].nap_tema_id, null, 'un id fuera del catálogo cae a null, igual que en dividir-nodos');
});

test('emparejarResultado lanza si Claude devuelve una cantidad distinta (guardarraíl anti-reorden)', () => {
  const nodosDePrograma = [
    { id: 'n1', nombre: 'A', descripcion: '' },
    { id: 'n2', nombre: 'B', descripcion: '' },
  ];
  const capturado = { nodos: [{ nombre: 'A', orden: 0, nap_tema_id: null }] };
  assert.throws(() => emparejarResultado(nodosDePrograma, capturado, 'Lengua', 1, TEMAS), /esperaba 2/);
});

test('emparejarResultado avisa (sin bloquear) si un nombre echoed no calza en su posición', () => {
  const nodosDePrograma = [{ id: 'n1', nombre: 'Las vocales', descripcion: '' }];
  const capturado = { nodos: [{ nombre: 'Otra cosa', orden: 0, nap_tema_id: null }] };
  const { resultados, avisos } = emparejarResultado(nodosDePrograma, capturado, 'Lengua', 1, TEMAS);
  assert.equal(resultados[0].nodo_id, 'n1');
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Otra cosa/);
});

test('agruparPorPrograma agrupa y ordena de forma estable por programa_id (paginación determinística)', () => {
  const nodos = [
    { programa_id: 'p2', id: 'a' },
    { programa_id: 'p1', id: 'b' },
    { programa_id: 'p2', id: 'c' },
  ];
  const grupos = agruparPorPrograma(nodos);
  assert.deepEqual(grupos.map(([id]) => id), ['p1', 'p2']);
  assert.deepEqual(grupos.find(([id]) => id === 'p2')[1].map((n) => n.id), ['a', 'c']);
});

test('agruparPorPrograma con lista vacía devuelve lista vacía', () => {
  assert.deepEqual(agruparPorPrograma([]), []);
});

test('sinExcluidos saca los programas ya intentados (necesario porque un null se queda pendiente para siempre)', () => {
  const programas = [['p1', ['n1']], ['p2', ['n2']], ['p3', ['n3']]];
  assert.deepEqual(sinExcluidos(programas, ['p2']), [['p1', ['n1']], ['p3', ['n3']]]);
});

test('sinExcluidos con lista de exclusión vacía devuelve todo tal cual', () => {
  const programas = [['p1', ['n1']]];
  assert.deepEqual(sinExcluidos(programas, []), programas);
});

test('sinExcluidos excluyendo todos deja lista vacía', () => {
  const programas = [['p1', ['n1']], ['p2', ['n2']]];
  assert.deepEqual(sinExcluidos(programas, ['p1', 'p2']), []);
});

// --- armarUpdates (Hallazgo 1 de la review): el freno de "dry-run no toca
// la base" fijado con un test, no solo con la estructura de index.ts. ---

test('armarUpdates con dry_run en true SIEMPRE devuelve vacío, sea cual sea la entrada', () => {
  const resultados = [
    { nodo_id: 'n1', nap_tema_id: 't1', nap_confianza: 0.9 },
    { nodo_id: 'n2', nap_tema_id: null, nap_confianza: null },
  ];
  assert.deepEqual(armarUpdates(resultados, { n1: 0, n2: 2 }, true), []);
  // Ni con intentosPorNodo vacío, ni con resultados vacíos: dry_run manda.
  assert.deepEqual(armarUpdates(resultados, {}, true), []);
  assert.deepEqual(armarUpdates([], { n1: 0 }, true), []);
});

test('armarUpdates con dry_run en false arma las filas e incrementa nap_intentos desde el original', () => {
  const resultados = [
    { nodo_id: 'n1', nap_tema_id: 't1', nap_confianza: 0.9 },
    { nodo_id: 'n2', nap_tema_id: null, nap_confianza: null },
  ];
  const updates = armarUpdates(resultados, { n1: 0, n2: 2 }, false);
  assert.deepEqual(updates, [
    { id: 'n1', nap_tema_id: 't1', nap_confianza: 0.9, nap_intentos: 1 },
    { id: 'n2', nap_tema_id: null, nap_confianza: null, nap_intentos: 3 },
  ]);
});

test('armarUpdates: un nodo sin entrada en intentosPorNodo arranca de 0 (queda en 1)', () => {
  const updates = armarUpdates([{ nodo_id: 'n1', nap_tema_id: null, nap_confianza: null }], {}, false);
  assert.deepEqual(updates, [{ id: 'n1', nap_tema_id: null, nap_confianza: null, nap_intentos: 1 }]);
});

test('armarUpdates con lista de resultados vacía y dry_run false devuelve vacío (nada que escribir)', () => {
  assert.deepEqual(armarUpdates([], { n1: 1 }, false), []);
});
