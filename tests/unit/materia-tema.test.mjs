// Tests del tema visual por materia (web/lib/materia-tema.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temaMateria, iconoNodo } from '../../web/lib/materia-tema.ts';

test('temaMateria: materias conocidas matchean por nombre (case-insensitive)', () => {
  assert.equal(temaMateria('Lengua').color, '#F4A93B');
  assert.equal(temaMateria('lengua').color, '#F4A93B');
  assert.equal(temaMateria('Prácticas del Lenguaje').color, '#F4A93B');
  assert.equal(temaMateria('Matemática').color, '#6FB7D4');
  assert.equal(temaMateria('MATEMATICA').color, '#6FB7D4');
  assert.equal(temaMateria('Ciencias Naturales').color, '#7FB069');
});

test('temaMateria: devuelve claves de emblema/patrón usables por art', () => {
  const t = temaMateria('Matemática');
  assert.equal(t.emblem, 'mate');
  assert.equal(t.pattern, 'mate');
  assert.ok(/^#/.test(t.tint) && /^#/.test(t.tintBorder));
});

test('temaMateria: nombre desconocido → determinístico y dentro de los 3 temas', () => {
  const a = temaMateria('Música');
  const b = temaMateria('Música');
  assert.deepEqual(a, b, 'mismo nombre → mismo tema');
  const colores = ['#F4A93B', '#6FB7D4', '#7FB069'];
  assert.ok(colores.includes(a.color), 'cae a uno de los temas conocidos');
  // vacío no rompe
  assert.ok(colores.includes(temaMateria('').color));
});

test('iconoNodo: cicla las claves de ícono por posición', () => {
  assert.equal(iconoNodo(0), 'vocales');
  assert.equal(iconoNodo(6), 'numeros');
  assert.equal(iconoNodo(18), iconoNodo(0), 'cicla a las 18 claves');
  assert.equal(iconoNodo(-1), 'tierra', 'índice negativo no rompe (envuelve)');
});
