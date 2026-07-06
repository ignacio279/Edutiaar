// Tests unitarios del generador de ejercicios puro
// (supabase/functions/generador-ejercicios/generar.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandaDeGrado, ESTILO_BANDA, CELDAS, celdasIniciales, celdasParaLote, claveCelda,
  construirPromptEjercicios, parseEjercicios, cubreDominio,
  POR_CELDA_INICIAL, LOTE_REPOSICION,
} from '../../supabase/functions/generador-ejercicios/generar.ts';

test('construirPromptEjercicios: incluye materia/grado, producir y el shape JSON', () => {
  const { system, user } = construirPromptEjercicios('Lengua', 3, 'Vocales', 'las vocales', 5);
  assert.match(system, /Lengua/);
  assert.match(system, /3°/);
  assert.match(system, /producir/);
  assert.match(system, /opciones/);
  assert.match(user, /Vocales/);
  assert.match(user, /5/);
});

const ej = (t, dif, correcta = 'a', opciones = ['a', 'b', 'c', 'd']) => ({ enunciado: 'x', opciones, correcta, dificultad: dif, tipo: t });

test('parseEjercicios: normaliza y agrega nodo_id', () => {
  const rows = parseEjercicios([ej('producir', 2)], 'N1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nodo_id, 'N1');
  assert.equal(rows[0].correcta, 'a');
  assert.equal(rows[0].tipo, 'producir');
});

test('parseEjercicios: descarta si la correcta no está entre las opciones', () => {
  const rows = parseEjercicios([ej('reconocer', 1, 'z'), ej('reconocer', 1, 'a')], 'N1');
  assert.equal(rows.length, 1, 'solo el válido');
});

test('parseEjercicios: clampa dificultad y cae a reconocer si el tipo es raro', () => {
  const rows = parseEjercicios([{ enunciado: 'x', opciones: ['a', 'b'], correcta: 'a', dificultad: 9, tipo: 'xxx' }], 'N1');
  assert.equal(rows[0].dificultad, 3);
  assert.equal(rows[0].tipo, 'reconocer');
});

test('parseEjercicios: acepta {ejercicios:[...]} además del array pelado', () => {
  const rows = parseEjercicios({ ejercicios: [ej('completar', 2)] }, 'N1');
  assert.equal(rows.length, 1);
});

test('parseEjercicios: tira si no es array o si no queda ninguno válido', () => {
  assert.throws(() => parseEjercicios('nope', 'N1'), /no_es_array/);
  assert.throws(() => parseEjercicios([{ enunciado: '', opciones: [] }], 'N1'), /sin_ejercicios_validos/);
});

test('cubreDominio: exige >=2 producir y >=1 difícil', () => {
  assert.equal(cubreDominio([ej('producir', 3), ej('producir', 1), ej('reconocer', 1)]), true);
  assert.equal(cubreDominio([ej('producir', 1), ej('producir', 1)]), false); // sin difícil
  assert.equal(cubreDominio([ej('producir', 3), ej('reconocer', 1)]), false); // 1 solo producir
});

test('bandaDeGrado: 1-2 chiquitos, 3-4 medianos, 5-7 grandes', () => {
  assert.equal(bandaDeGrado(1), 'chiquitos');
  assert.equal(bandaDeGrado(2), 'chiquitos');
  assert.equal(bandaDeGrado(3), 'medianos');
  assert.equal(bandaDeGrado(4), 'medianos');
  assert.equal(bandaDeGrado(5), 'grandes');
  assert.equal(bandaDeGrado(7), 'grandes');
});

test('celdas: 12 combinaciones tipo × dificultad; inicial trae 3 por celda', () => {
  assert.equal(CELDAS.length, 12);
  const ini = celdasIniciales();
  assert.equal(ini.reduce((s, c) => s + c.n, 0), 12 * POR_CELDA_INICIAL);
  assert.ok(ini.every((c) => c.n === POR_CELDA_INICIAL));
});

test('celdasParaLote: reparte el lote priorizando las celdas con menos sin-ver', () => {
  // todas las celdas con 5 sin ver, salvo producir|3 con 0 → producir|3 recibe más
  const sinVer = new Map(CELDAS.map((c) => [claveCelda(c), 5]));
  sinVer.set('producir|3', 0);
  const lote = celdasParaLote(sinVer, LOTE_REPOSICION);
  assert.equal(lote.reduce((s, c) => s + c.n, 0), LOTE_REPOSICION);
  const prod3 = lote.find((c) => c.tipo === 'producir' && c.dificultad === 3);
  assert.ok(prod3 && prod3.n >= 2, 'la celda más escasa recibe más ejercicios');
});

test('celdasParaLote: determinístico', () => {
  const sinVer = new Map(CELDAS.map((c) => [claveCelda(c), 2]));
  assert.deepEqual(celdasParaLote(sinVer, 12), celdasParaLote(sinVer, 12));
});


test('construirPromptEjercicios: incluye estilo de banda y cantidades por celda', () => {
  const { system, user } = construirPromptEjercicios('Lengua', 2, 'Vocales', '', 6, [{ tipo: 'producir', dificultad: 3, n: 2 }]);
  assert.ok(system.includes(ESTILO_BANDA.chiquitos));
  assert.ok(user.includes('2 de tipo "producir" con dificultad 3'));
});
