// Tests de la lógica pura de /setup (web/lib/setup.ts).
// Correr: npm test (o node --test tests/unit/setup.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoVacio } from '../../web/lib/setup.ts';

test('textoVacio: cada estado dice algo distinto', () => {
  assert.equal(textoVacio('cargando', 'No hay colegios disponibles'), 'Cargando…');
  assert.equal(textoVacio('error', 'No hay colegios disponibles'), 'No se pudo cargar');
  assert.equal(textoVacio('listo', 'No hay colegios disponibles'), 'No hay colegios disponibles');
});

test('textoVacio: "listo" con lista vacía NUNCA dice "Cargando…"', () => {
  // El bug real: el front viejo pedía la tabla `escuela` (0018 le sacó el
  // listado a anon) → 200 con [] → "Cargando…" eterno, sin error a la vista.
  assert.notEqual(textoVacio('listo', 'Este colegio no tiene aulas'), 'Cargando…');
  assert.equal(textoVacio('listo', 'Este colegio no tiene aulas'), 'Este colegio no tiene aulas');
});
