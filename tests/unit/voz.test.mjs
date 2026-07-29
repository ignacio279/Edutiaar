// Unit del armado de texto para leer en voz alta (web/lib/voz.ts). `npm test`.
// Solo la parte pura (textoParaLeer); hablar/puedeHablar tocan el DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoParaLeer, textoEjercicio } from '../../web/lib/voz.ts';

test('textoParaLeer: consigna + opciones', () => {
  assert.equal(
    textoParaLeer('¿Cuántas manzanas hay?', ['1', '2', '3']),
    '¿Cuántas manzanas hay?. Opciones: 1, 2, 3.',
  );
});

test('textoParaLeer: sin opciones lee solo la consigna', () => {
  assert.equal(textoParaLeer('Mirá el dibujo', []), 'Mirá el dibujo');
});

test('textoParaLeer: recorta y descarta opciones vacías', () => {
  assert.equal(textoParaLeer('  Elegí  ', [' a ', '', 'b']), 'Elegí. Opciones: a, b.');
});

test('textoParaLeer: sin consigna pero con opciones no rompe', () => {
  assert.equal(textoParaLeer('', ['a', 'b']), 'Opciones: a, b.');
});

test('textoEjercicio: escribir lee SOLO la consigna (no la respuesta)', () => {
  assert.equal(
    textoEjercicio({ enunciado: '¿Cómo se llama la cría de la vaca?', formato: 'escribir', opciones: [] }),
    '¿Cómo se llama la cría de la vaca?',
  );
});

test('textoEjercicio: opciones = consigna + opciones (igual que textoParaLeer)', () => {
  assert.equal(textoEjercicio({ enunciado: '¿Cuántas?', formato: 'opciones', opciones: ['1', '2'] }), '¿Cuántas?. Opciones: 1, 2.');
});

test('textoEjercicio: ordenar lee las fichas pasadas (mezcladas), no una respuesta', () => {
  assert.equal(textoEjercicio({ enunciado: 'Ordená', formato: 'ordenar', fichas: ['perro', 'El', 'corre'] }), 'Ordená. Fichas: perro, El, corre.');
});
