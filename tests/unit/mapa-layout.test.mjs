// Tests unitarios del layout puro del mapa (web/lib/mapa-layout.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mezclarColor, colorNodo, COLORES, estadoColor, LEGEND, saludoMateria, layoutCamino, layoutColinas, layoutVariante, ESCALAS_MAPA } from '../../web/lib/mapa-layout.ts';

test('mezclarColor: extremos y punto medio', () => {
  assert.equal(mezclarColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(mezclarColor('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mezclarColor('#000000', '#ffffff', 0.5), '#808080');
});

test('colorNodo: en_construccion se acerca al color de dominado según el puntaje', () => {
  assert.equal(colorNodo('en_construccion', 0), mezclarColor(COLORES.en_construccion, COLORES.dominado, 0));
  assert.equal(colorNodo('en_construccion', 100), mezclarColor(COLORES.en_construccion, COLORES.dominado, 1));
});

test('colorNodo: dominado, a_reforzar y no_empezado conservan su color pleno', () => {
  assert.equal(colorNodo('dominado', 40), COLORES.dominado);
  assert.equal(colorNodo('a_reforzar', 80), COLORES.a_reforzar);
  assert.equal(colorNodo('no_empezado', 0), COLORES.no_empezado);
  assert.equal(colorNodo(undefined, undefined), COLORES.no_empezado);
});

test('layout serpentina: zig-zag — la fila 0 va izq→der, la fila 1 der→izq', () => {
  const { coords: c } = layoutCamino(9); // 3 filas de 3
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

test('layoutCamino / layoutColinas: 0 → [], hasta 6 = coords del diseño con aspecto fijo', () => {
  assert.deepEqual(layoutCamino(0), { coords: [], altoPx: null });
  assert.deepEqual(layoutColinas(0), { coords: [], altoPx: null });
  const c3 = layoutCamino(3);
  assert.deepEqual(c3.coords, [[14, 22], [36, 40], [58, 25]]);
  assert.equal(c3.altoPx, null, 'hasta 6 nodos no fuerza altura');
  assert.deepEqual(layoutColinas(2).coords, [[10, 56], [27, 36]]);
  assert.equal(layoutCamino(6).altoPx, null);
});

test('layout N>6: N coords en rango, altura que crece con las filas y paso fijo en px', () => {
  for (const [fn, perRow] of [[layoutCamino, 3], [layoutColinas, 4]]) {
    const n = 16;
    const { coords, altoPx } = fn(n);
    assert.equal(coords.length, n);
    for (const [x, y] of coords) {
      assert.ok(x >= 0 && x <= 100, `x en rango: ${x}`);
      assert.ok(y >= 0 && y <= 100, `y en rango: ${y}`);
    }
    const { pitch, margen } = ESCALAS_MAPA.alumno;
    const filas = Math.ceil(n / perRow);
    assert.equal(altoPx, margen * 2 + (filas - 1) * pitch, 'la altura acompaña a las filas');
    // Paso vertical real entre filas consecutivas = pitch px (los círculos no se pisan).
    const gapPx = ((coords[perRow][1] - coords[0][1]) / 100) * altoPx;
    assert.ok(Math.abs(gapPx - pitch) < 0.001, `paso ${gapPx} ≈ ${pitch}`);
  }
});

test('layout N>6: la escala docente usa paso más chico que la del alumno', () => {
  const alumno = layoutCamino(12, 'alumno');
  const docente = layoutCamino(12, 'docente');
  assert.ok(docente.altoPx < alumno.altoPx);
  assert.equal(docente.altoPx, ESCALAS_MAPA.docente.margen * 2 + 3 * ESCALAS_MAPA.docente.pitch);
});

test('layoutVariante: B = Colinas, default = Camino', () => {
  assert.deepEqual(layoutVariante('B', 2), layoutColinas(2));
  assert.deepEqual(layoutVariante('A', 4), layoutCamino(4));
  assert.deepEqual(layoutVariante('x', 4), layoutCamino(4));
  assert.deepEqual(layoutVariante('B', 10, 'docente'), layoutColinas(10, 'docente'));
});
