// Tests de la corrección pura (web/lib/correccion.ts). Es la ÚNICA puerta de corrección de
// la app (Regla 2: la app corrige, SOL no). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarTexto, corregirEscrito, corregirOrden, corregirUnir, serializarPares,
  respuestaComoTexto, formatoDe, esCorrecta, mezclarDeterminista,
} from '../../web/lib/correccion.ts';

test('normalizarTexto: minúsculas, tildes fuera, puntuación de borde fuera, espacios colapsados', () => {
  assert.equal(normalizarTexto('Camión.'), 'camion');
  assert.equal(normalizarTexto('  Hola   Mundo  '), 'hola mundo');
  assert.equal(normalizarTexto('¡Sí, claro!'), 'si claro');
  assert.equal(normalizarTexto('ÁÉÍÓÚ üÜ'), 'aeiou uu');
});

test('normalizarTexto: la ñ SE PRESERVA (año != ano)', () => {
  assert.equal(normalizarTexto('Niño'), 'niño');
  assert.notEqual(normalizarTexto('año'), normalizarTexto('ano'));
  assert.equal(normalizarTexto('año'), 'año');
});

test('corregirEscrito: tolerante por default (tilde/caso/puntuación no importan)', () => {
  assert.equal(corregirEscrito('Camión.', 'camion'), true);
  assert.equal(corregirEscrito('  la Vaca ', 'la vaca'), true);
  assert.equal(corregirEscrito('perro', 'gato'), false);
});

test('corregirEscrito: estricto exige la tilde/ortografía (solo trim+lower)', () => {
  assert.equal(corregirEscrito('camion', 'camión', true), false); // falta la tilde
  assert.equal(corregirEscrito('Camión', 'camión', true), true); // caso/trim sí toleran
});

test('corregirOrden: secuencia element-wise, normalizada, mismo largo', () => {
  assert.equal(corregirOrden(['El', 'perro', 'corre'], ['El', 'perro', 'corre']), true);
  assert.equal(corregirOrden(['perro', 'El', 'corre'], ['El', 'perro', 'corre']), false);
  assert.equal(corregirOrden(['el', 'perro'], ['El', 'perro', 'corre']), false); // distinto largo
  assert.equal(corregirOrden(['él', 'Perro', 'corré'], ['El', 'perro', 'corre']), true); // normaliza
});

test('corregirUnir: empareja izq→der sin importar el orden; detecta cruces y ambigüedad', () => {
  const esperados = [{ izq: 'vaca', der: 'ternero' }, { izq: 'oveja', der: 'cordero' }];
  assert.equal(corregirUnir([{ izq: 'oveja', der: 'cordero' }, { izq: 'vaca', der: 'ternero' }], esperados), true);
  assert.equal(corregirUnir([{ izq: 'vaca', der: 'cordero' }, { izq: 'oveja', der: 'ternero' }], esperados), false); // cruzado
  assert.equal(corregirUnir([{ izq: 'vaca', der: 'ternero' }], esperados), false); // falta uno
  // izq duplicada tras normalizar → no se puede validar
  assert.equal(corregirUnir([{ izq: 'Vaca', der: 'ternero' }, { izq: 'vaca', der: 'ternero' }],
    [{ izq: 'vaca', der: 'ternero' }, { izq: 'VACA', der: 'ternero' }]), false);
});

test('serializarPares: legible', () => {
  assert.equal(serializarPares([{ izq: 'vaca', der: 'ternero' }, { izq: 'oveja', der: 'cordero' }]),
    'vaca → ternero · oveja → cordero');
});

test('respuestaComoTexto: cada formato', () => {
  assert.equal(respuestaComoTexto({ formato: 'opciones', opcion: 'a' }), 'a');
  assert.equal(respuestaComoTexto({ formato: 'escribir', texto: 'la vaca' }), 'la vaca');
  assert.equal(respuestaComoTexto({ formato: 'ordenar', orden: ['El', 'perro'] }), 'El perro');
  assert.equal(respuestaComoTexto({ formato: 'unir', pares: [{ izq: 'a', der: 'b' }] }), 'a → b');
});

test('formatoDe: conocido, ausente (→opciones), desconocido (→null)', () => {
  assert.equal(formatoDe({ formato: 'escribir' }), 'escribir');
  assert.equal(formatoDe({}), 'opciones');
  assert.equal(formatoDe({ formato: null }), 'opciones');
  assert.equal(formatoDe({ formato: 'inventado' }), null);
});

test('esCorrecta: opciones sigue EXACTO (Vaca != vaca); escribir normaliza', () => {
  const opc = { formato: 'opciones', opciones: ['Vaca', 'Oveja'], correcta: 'Vaca' };
  assert.equal(esCorrecta(opc, { formato: 'opciones', opcion: 'Vaca' }), true);
  assert.equal(esCorrecta(opc, { formato: 'opciones', opcion: 'vaca' }), false); // exacto

  const esc = { formato: 'escribir', opciones: [], correcta: 'camión' };
  assert.equal(esCorrecta(esc, { formato: 'escribir', texto: 'Camion' }), true); // tolerante
  const escEstricto = { formato: 'escribir', opciones: [], correcta: 'camión', datos: { estricto: true } };
  assert.equal(esCorrecta(escEstricto, { formato: 'escribir', texto: 'camion' }), false);
});

test('esCorrecta: ordenar usa las opciones como orden correcto; unir usa datos.pares', () => {
  const ord = { formato: 'ordenar', opciones: ['El', 'sol', 'brilla'], correcta: 'El sol brilla' };
  assert.equal(esCorrecta(ord, { formato: 'ordenar', orden: ['El', 'sol', 'brilla'] }), true);
  assert.equal(esCorrecta(ord, { formato: 'ordenar', orden: ['sol', 'El', 'brilla'] }), false);

  const uni = { formato: 'unir', opciones: [], correcta: '', datos: { pares: [{ izq: 'a', der: '1' }, { izq: 'b', der: '2' }] } };
  assert.equal(esCorrecta(uni, { formato: 'unir', pares: [{ izq: 'b', der: '2' }, { izq: 'a', der: '1' }] }), true);
  assert.equal(esCorrecta(uni, { formato: 'unir', pares: [{ izq: 'a', der: '2' }, { izq: 'b', der: '1' }] }), false);
});

test('mezclarDeterminista: determinístico, es permutación y nunca deja el orden original (len>1)', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  const m1 = mezclarDeterminista(items, 'ej-123');
  const m2 = mezclarDeterminista(items, 'ej-123');
  assert.deepEqual(m1, m2); // misma semilla → misma permutación
  assert.deepEqual([...m1].sort(), [...items].sort()); // es una permutación (mismos elementos)
  assert.notDeepEqual(m1, items); // no deja el orden original
  // semillas distintas suelen dar órdenes distintos
  assert.notDeepEqual(mezclarDeterminista(items, 'otra'), m1);
  // no muta el input
  assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e']);
  // borde: 1 elemento se devuelve igual
  assert.deepEqual(mezclarDeterminista(['x'], 's'), ['x']);
});
