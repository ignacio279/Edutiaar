// Unit — lógica pura del front de la cola de revisión del mapeo NAP (Task 7).
// Correr: npm test (o node --test tests/unit/admin-revision-nap.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAP_INTENTOS_TOPE, agruparPorColegioMateria, agruparTemasPorMateria, alTope, temaPorId, textoConfianza,
} from '../../web/lib/admin/revision-nap.ts';

const nodo = (over = {}) => ({
  id: 'n1', nombre: 'Vocales', colegio: 'Escuela A', materia: 'Lengua', grado: 1,
  nap_tema_id: null, nap_confianza: null, nap_intentos: 0, temas_posibles: [],
  ...over,
});

test('NAP_INTENTOS_TOPE es 3 (espeja la migración 0030)', () => {
  assert.equal(NAP_INTENTOS_TOPE, 3);
});

test('alTope: por debajo del tope es false, en el tope y por encima es true', () => {
  assert.equal(alTope(nodo({ nap_intentos: 0 })), false);
  assert.equal(alTope(nodo({ nap_intentos: 2 })), false);
  assert.equal(alTope(nodo({ nap_intentos: 3 })), true);
  assert.equal(alTope(nodo({ nap_intentos: 4 })), true);
});

test('agruparPorColegioMateria: junta nodos con el mismo colegio y materia, preservando el orden de llegada', () => {
  const a1 = nodo({ id: 'a1', colegio: 'Escuela A', materia: 'Lengua' });
  const a2 = nodo({ id: 'a2', colegio: 'Escuela A', materia: 'Lengua' });
  const b1 = nodo({ id: 'b1', colegio: 'Escuela B', materia: 'Matemática' });
  const grupos = agruparPorColegioMateria([a1, b1, a2]);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos[0].nodos.map((n) => n.id), ['a1', 'a2']);
  assert.equal(grupos[0].colegio, 'Escuela A');
  assert.equal(grupos[0].materia, 'Lengua');
  assert.deepEqual(grupos[1].nodos.map((n) => n.id), ['b1']);
});

test('agruparPorColegioMateria: distintas materias del mismo colegio quedan en grupos separados', () => {
  const grupos = agruparPorColegioMateria([
    nodo({ id: 'x1', colegio: 'Escuela A', materia: 'Lengua' }),
    nodo({ id: 'x2', colegio: 'Escuela A', materia: 'Matemática' }),
  ]);
  assert.equal(grupos.length, 2);
});

test('agruparPorColegioMateria: la clave compuesta no colisiona entre nombres distintos que concatenan igual', () => {
  const grupos = agruparPorColegioMateria([
    nodo({ id: 'y1', colegio: 'A', materia: 'BC' }),
    nodo({ id: 'y2', colegio: 'AB', materia: 'C' }),
  ]);
  assert.equal(grupos.length, 2);
});

test('agruparPorColegioMateria: lista vacía da lista vacía', () => {
  assert.deepEqual(agruparPorColegioMateria([]), []);
});

test('textoConfianza: sin nap_tema_id es "Sin propuesta" aunque venga una confianza rara', () => {
  assert.equal(textoConfianza(nodo({ nap_tema_id: null, nap_confianza: null })), 'Sin propuesta');
  assert.equal(textoConfianza(nodo({ nap_tema_id: null, nap_confianza: 0.9 })), 'Sin propuesta');
});

test('textoConfianza: con tema y confianza, redondea a porcentaje', () => {
  assert.equal(textoConfianza(nodo({ nap_tema_id: 't1', nap_confianza: 0.55 })), '55% de confianza');
  assert.equal(textoConfianza(nodo({ nap_tema_id: 't1', nap_confianza: 0.666 })), '67% de confianza');
});

// ── agruparTemasPorMateria / temaPorId ────────────────────────────────────

const tema = (over = {}) => ({ id: 't1', nombre: 'Fonemas', eje: 'Oralidad', materia: 'Lengua', texto_oficial: 'texto', ...over });

test('agruparTemasPorMateria: agrupa preservando el orden de llegada por materia', () => {
  const temas = [
    tema({ id: 'l1', materia: 'Lengua' }),
    tema({ id: 'm1', materia: 'Matemática' }),
    tema({ id: 'l2', materia: 'Lengua' }),
  ];
  const grupos = agruparTemasPorMateria(temas);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].materia, 'Lengua');
  assert.deepEqual(grupos[0].temas.map((t) => t.id), ['l1', 'l2']);
  assert.equal(grupos[1].materia, 'Matemática');
});

test('agruparTemasPorMateria: lista vacía da lista vacía', () => {
  assert.deepEqual(agruparTemasPorMateria([]), []);
});

test('temaPorId: id null devuelve null ("Fuera del marco")', () => {
  assert.equal(temaPorId([tema({ id: 't1' })], null), null);
});

test('temaPorId: encuentra el tema por id, o null si no está en la lista', () => {
  const temas = [tema({ id: 't1' }), tema({ id: 't2', nombre: 'Otro' })];
  assert.equal(temaPorId(temas, 't2').nombre, 'Otro');
  assert.equal(temaPorId(temas, 't-inexistente'), null);
});
