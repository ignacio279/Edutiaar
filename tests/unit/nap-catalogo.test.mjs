import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO_NAP, MATERIAS_NAP } from '../../supabase/functions/_shared/nap.ts';
import { CATALOGO_NAP as ESPEJO, MATERIAS_NAP as ESPEJO_MATERIAS } from '../../web/lib/admin/nap.ts';

test('las materias son exactamente las cuatro del marco', () => {
  assert.deepEqual([...MATERIAS_NAP].sort(),
    ['Ciencias Naturales', 'Ciencias Sociales', 'Lengua', 'Matemática'].sort());
});

test('todo eje declara una materia del marco y al menos un tema', () => {
  // El catálogo arranca vacío (Task 2b lo llena desde las fuentes oficiales).
  // Este test NO exige que tenga contenido: valida la forma de lo que haya.
  for (const eje of CATALOGO_NAP) {
    assert.ok(MATERIAS_NAP.includes(eje.materia), `materia fuera del marco: ${eje.materia}`);
    assert.ok(eje.temas.length > 0, `eje sin temas: ${eje.nombre}`);
    assert.ok(typeof eje.orden === 'number', `eje sin orden: ${eje.nombre}`);
    for (const t of eje.temas) {
      assert.ok(t.grado >= 1 && t.grado <= 7, `grado inválido en ${t.nombre}`);
      assert.ok(t.nombre.trim().length > 0, 'tema sin nombre');
      assert.ok(typeof t.orden === 'number', `tema sin orden: ${t.nombre}`);
    }
  }
});

test('no hay ejes duplicados por materia+nombre', () => {
  const claves = CATALOGO_NAP.map((e) => `${e.materia}|${e.nombre}`);
  assert.equal(new Set(claves).size, claves.length, 'eje duplicado');
});

test('no hay temas duplicados dentro de un eje y grado', () => {
  for (const eje of CATALOGO_NAP) {
    const claves = eje.temas.map((t) => `${t.nombre}|${t.grado}`);
    assert.equal(new Set(claves).size, claves.length, `tema duplicado en ${eje.nombre}`);
  }
});

test('el espejo del front es idéntico al del server', () => {
  assert.deepEqual(ESPEJO, CATALOGO_NAP);
  assert.deepEqual([...ESPEJO_MATERIAS], [...MATERIAS_NAP]);
});
