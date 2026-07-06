// Tests unitarios de la lógica pura de "Mis materias" (web/lib/materias.ts):
// view-model del listado y confirmación de borrado. Corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarListadoMaterias, confirmaBorrado, normalizarNombre, puedeBorrar } from '../../web/lib/materias.ts';

const sm = (id, programa_id, estado, nombre, grado = 3) => ({
  id, programa_id, estado,
  programa: { grado, materia: { nombre } },
});
const nodo = (id, programa_id, nombre, orden) => ({ id, programa_id, nombre, orden });

test('armarListadoMaterias: agrupa nodos por programa respetando orden', () => {
  const vistas = armarListadoMaterias(
    [sm('s1', 'p1', 'borrador', 'Lengua')],
    [nodo('n2', 'p1', 'Sílabas', 1), nodo('n1', 'p1', 'Vocales', 0), nodo('nx', 'otro', 'Ajeno', 0)],
  );
  assert.equal(vistas.length, 1);
  assert.deepEqual(vistas[0].nodos.map((n) => n.nombre), ['Vocales', 'Sílabas']);
});

test('armarListadoMaterias: borradores primero, después publicadas', () => {
  const vistas = armarListadoMaterias(
    [sm('s1', 'p1', 'publicado', 'Lengua'), sm('s2', 'p2', 'borrador', 'Matemática')],
    [],
  );
  assert.deepEqual(vistas.map((v) => v.estado), ['borrador', 'publicado']);
});

test('armarListadoMaterias: alfabético y por grado dentro del mismo estado', () => {
  const vistas = armarListadoMaterias(
    [
      sm('s1', 'p1', 'borrador', 'Matemática', 4),
      sm('s2', 'p2', 'borrador', 'Lengua', 3),
      sm('s3', 'p3', 'borrador', 'Matemática', 2),
    ],
    [],
  );
  assert.deepEqual(vistas.map((v) => `${v.nombre}-${v.grado}`), ['Lengua-3', 'Matemática-2', 'Matemática-4']);
});

test('armarListadoMaterias: materia sin nodos → nodos []', () => {
  const vistas = armarListadoMaterias([sm('s1', 'p1', 'borrador', 'Lengua')], []);
  assert.deepEqual(vistas[0].nodos, []);
});

test('armarListadoMaterias: descarta filas con join roto', () => {
  const rota = { id: 's1', programa_id: 'p1', estado: 'borrador', programa: null };
  const sinNombre = { id: 's2', programa_id: 'p2', estado: 'borrador', programa: { grado: 3, materia: {} } };
  const vistas = armarListadoMaterias([rota, sinNombre, sm('s3', 'p3', 'borrador', 'Lengua')], []);
  assert.deepEqual(vistas.map((v) => v.sol_materia_id), ['s3']);
});

test('normalizarNombre: trim, espacios colapsados, minúsculas, sin acentos', () => {
  assert.equal(normalizarNombre('  Prácticas  del   Lenguaje '), 'practicas del lenguaje');
});

test('confirmaBorrado: exacto confirma', () => {
  assert.equal(confirmaBorrado('Lengua', 'Lengua'), true);
});

test('confirmaBorrado: case-insensitive y acentos', () => {
  assert.equal(confirmaBorrado('Matemática', 'matematica'), true);
});

test('confirmaBorrado: espacios de más no molestan', () => {
  assert.equal(confirmaBorrado('Prácticas del Lenguaje', '  prácticas  del lenguaje '), true);
});

test('confirmaBorrado: vacío nunca confirma', () => {
  assert.equal(confirmaBorrado('Lengua', ''), false);
  assert.equal(confirmaBorrado('Lengua', '   '), false);
});

test('confirmaBorrado: parcial no confirma', () => {
  assert.equal(confirmaBorrado('Lengua', 'Leng'), false);
  assert.equal(confirmaBorrado('Lengua', 'Lengua y Literatura'), false);
});

test('puedeBorrar: solo borrador', () => {
  assert.equal(puedeBorrar('borrador'), true);
  assert.equal(puedeBorrar('publicado'), false);
});
