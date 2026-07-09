// Unit del armado de texto para leer en voz alta (web/lib/voz.ts). `npm test`.
// Solo la parte pura (textoParaLeer); hablar/puedeHablar tocan el DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoParaLeer } from '../../web/lib/voz.ts';

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
