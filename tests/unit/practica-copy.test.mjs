// Tests de los copys de la práctica-chat (web/lib/practica-copy.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saludo, cierre, praise, encourage } from '../../web/lib/practica-copy.ts';

test('saludo: templatea materia y alumno; sin alumno cae a ¡Hola!', () => {
  const s = saludo('Lengua', 'Mateo');
  assert.match(s, /Mateo/);
  assert.match(s, /Lengua/);
  assert.match(saludo('', undefined), /¡Hola!/);
});

test('cierre: templatea alumno y tema', () => {
  const c = cierre('Lengua', 'Mateo', 'Vocales');
  assert.match(c, /Mateo/);
  assert.match(c, /Vocales/);
  // sin tema sigue siendo cálido
  assert.match(cierre('Lengua'), /genial/i);
});

test('praise / encourage: determinísticos por índice y envuelven', () => {
  assert.equal(praise(0), praise(0));
  assert.notEqual(praise(0), praise(1));
  assert.equal(praise(0), praise(4), 'cicla cada 4');
  assert.equal(encourage(0), encourage(0));
  assert.equal(encourage(0), encourage(3), 'cicla cada 3');
  // índice negativo no rompe
  assert.equal(typeof praise(-1), 'string');
  assert.equal(typeof encourage(-2), 'string');
});
