// Tests unitarios del layout puro del mapa (web/lib/mapa-layout.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serpentine, estadoColor, LEGEND, saludoMateria, coordsCamino, coordsColinas, coordsVariante } from '../../web/lib/mapa-layout.ts';

test('serpentine: 0 → [], 1 → centro', () => {
  assert.deepEqual(serpentine(0), []);
  assert.deepEqual(serpentine(1), [[50, 50]]);
});

test('serpentine: N coords en rango 0..100 y todas distintas', () => {
  const n = 6;
  const c = serpentine(n);
  assert.equal(c.length, n);
  for (const [x, y] of c) {
    assert.ok(x >= 0 && x <= 100, `x en rango: ${x}`);
    assert.ok(y >= 0 && y <= 100, `y en rango: ${y}`);
  }
  const claves = new Set(c.map(([x, y]) => `${x},${y}`));
  assert.equal(claves.size, n, 'no hay coords repetidas');
});

test('serpentine: zig-zag — la fila 0 va izq→der, la fila 1 der→izq', () => {
  const c = serpentine(6, 3); // 2 filas de 3
  assert.ok(c[0][0] < c[2][0], 'fila 0 izquierda→derecha');
  assert.ok(c[3][0] > c[5][0], 'fila 1 derecha→izquierda');
  assert.ok(c[3][1] > c[0][1], 'fila 1 está más abajo que la fila 0');
});

test('estadoColor: cubre el enum y cae a no_empezado', () => {
  assert.equal(estadoColor('dominado'), '#7FB069');
  assert.equal(estadoColor('a_reforzar'), '#D46A5A');
  assert.equal(estadoColor('en_construccion'), '#E89B42');
  assert.equal(estadoColor('no_empezado'), '#C9BCA6');
  assert.equal(estadoColor(null), '#C9BCA6');
  assert.equal(estadoColor('cualquiera'), '#C9BCA6');
});

test('LEGEND: 4 estados con color', () => {
  assert.equal(LEGEND.length, 4);
  for (const l of LEGEND) assert.ok(l.label && /^#/.test(l.c));
});

test('saludoMateria: incluye nombre del alumno y la materia', () => {
  const s = saludoMateria('Lengua', 'Mateo');
  assert.match(s, /Mateo/);
  assert.match(s, /Lengua/);
  assert.match(saludoMateria('', undefined), /¡Hola!/);
});

test('coordsCamino / coordsColinas: 0 → [], hasta 6 = coords del diseño', () => {
  assert.deepEqual(coordsCamino(0), []);
  assert.deepEqual(coordsColinas(0), []);
  assert.deepEqual(coordsCamino(3), [[14, 22], [36, 40], [58, 25]]);
  assert.deepEqual(coordsColinas(2), [[10, 56], [27, 36]]);
  assert.equal(coordsCamino(6).length, 6);
  assert.equal(coordsColinas(6).length, 6);
});

test('coordsCamino / coordsColinas: N>6 generan N coords en rango 0..100', () => {
  for (const fn of [coordsCamino, coordsColinas]) {
    const c = fn(10);
    assert.equal(c.length, 10);
    for (const [x, y] of c) {
      assert.ok(x >= 0 && x <= 100, `x en rango: ${x}`);
      assert.ok(y >= 0 && y <= 100, `y en rango: ${y}`);
    }
  }
});

test('coordsVariante: B = Colinas, default = Camino', () => {
  assert.deepEqual(coordsVariante('B', 2), coordsColinas(2));
  assert.deepEqual(coordsVariante('A', 4), coordsCamino(4));
  assert.deepEqual(coordsVariante('x', 4), coordsCamino(4));
});
