// Tests unitarios del layout puro del mapa (web/lib/mapa-layout.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mezclarColor, colorNodo, COLORES, estadoColor, LEGEND, saludoMateria, layoutCamino, ESCALAS_MAPA, nodoMasAvanzado } from '../../web/lib/mapa-layout.ts';

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

test('nodoMasAvanzado: primer no-dominado (frontera de avance)', () => {
  const nodos = [
    { id: 'a', estado: 'dominado' },
    { id: 'b', estado: 'a_reforzar' },
    { id: 'c', estado: 'no_empezado' },
  ];
  assert.equal(nodoMasAvanzado(nodos), 'b');
});

test('nodoMasAvanzado: todo dominado → primero; sin nodos → null', () => {
  assert.equal(nodoMasAvanzado([{ id: 'a', estado: 'dominado' }, { id: 'b', estado: 'dominado' }]), 'a');
  assert.equal(nodoMasAvanzado([]), null);
});

test('layoutCamino: 0 → [], hasta 6 = coords del diseño con aspecto fijo', () => {
  assert.deepEqual(layoutCamino(0), { coords: [], altoPx: null });
  const c3 = layoutCamino(3);
  assert.deepEqual(c3.coords, [[14, 22], [36, 40], [58, 25]]);
  assert.equal(c3.altoPx, null, 'hasta 6 nodos no fuerza altura');
  assert.equal(layoutCamino(6).altoPx, null);
});

// Helpers de la geometría serpentina (espejo de serpentinaAlta en mapa-layout.ts).
function geometria(escala, perRow = 3) {
  const { pitch, margen } = ESCALAS_MAPA[escala];
  const bajada = pitch / 5;
  const rowStep = pitch + (perRow - 1) * bajada;
  return { pitch, margen, bajada, rowStep };
}

test('layout N>6: N coords en rango, altura que crece con las filas y paso fijo en px', () => {
  const perRow = 3;
  const n = 16;
  const { coords, altoPx } = layoutCamino(n);
  assert.equal(coords.length, n);
  for (const [x, y] of coords) {
    assert.ok(x >= 0 && x <= 100, `x en rango: ${x}`);
    assert.ok(y >= 0 && y <= 100, `y en rango: ${y}`);
  }
  const { margen, rowStep, bajada } = geometria('alumno', perRow);
  const filas = Math.ceil(n / perRow);
  const lastCol = (n - 1) % perRow;
  assert.equal(altoPx, margen * 2 + (filas - 1) * rowStep + lastCol * bajada, 'la altura acompaña a las filas');
  // Misma columna, filas consecutivas → rowStep px (los círculos no se pisan).
  const gapPx = ((coords[perRow][1] - coords[0][1]) / 100) * altoPx;
  assert.ok(Math.abs(gapPx - rowStep) < 0.001, `paso ${gapPx} ≈ ${rowStep}`);
});

test('layout N>6: el camino baja de a poco dentro de la fila y la vuelta conserva pitch', () => {
  const perRow = 3;
  const { coords, altoPx } = layoutCamino(9);
  const { pitch, bajada } = geometria('alumno', perRow);
  const px = (i) => (coords[i][1] / 100) * altoPx;
  // Dentro de la fila 0, cada parada baja exactamente `bajada` px.
  assert.ok(Math.abs(px(1) - px(0) - bajada) < 0.001, 'parada 0→1 baja');
  assert.ok(Math.abs(px(2) - px(1) - bajada) < 0.001, 'parada 1→2 baja');
  // La vuelta de fila (última de fila 0 → primera de fila 1, misma x) deja `pitch` libre.
  assert.equal(coords[2][0], coords[3][0], 'la vuelta es en la misma columna');
  assert.ok(Math.abs(px(3) - px(2) - pitch) < 0.001, `vuelta ${px(3) - px(2)} ≈ ${pitch}`);
});

test('layout N>6: la escala docente usa paso más chico que la del alumno', () => {
  const alumno = layoutCamino(12, 'alumno');
  const docente = layoutCamino(12, 'docente');
  assert.ok(docente.altoPx < alumno.altoPx);
  const d = geometria('docente');
  assert.equal(docente.altoPx, d.margen * 2 + 3 * d.rowStep + 2 * d.bajada);
});
