// Tests unitarios del generador de ejercicios puro
// (supabase/functions/generador-ejercicios/generar.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandaDeGrado, ESTILO_BANDA, CELDAS, celdasIniciales, celdasParaLote, claveCelda,
  construirPromptEjercicios, parseEjercicios, cubreDominio, CLAVES_IMAGEN,
  POR_CELDA_INICIAL, LOTE_REPOSICION, SESGO_BANDA,
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
  const rows = parseEjercicios([ej('producir', 2)], 'N1', 'chiquitos');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nodo_id, 'N1', 'chiquitos');
  assert.equal(rows[0].correcta, 'a');
  assert.equal(rows[0].tipo, 'producir');
});

test('parseEjercicios: descarta si la correcta no está entre las opciones', () => {
  const rows = parseEjercicios([ej('reconocer', 1, 'z'), ej('reconocer', 1, 'a')], 'N1', 'chiquitos');
  assert.equal(rows.length, 1, 'solo el válido');
});

test('parseEjercicios: clampa dificultad y cae a reconocer si el tipo es raro', () => {
  const rows = parseEjercicios([{ enunciado: 'x', opciones: ['a', 'b'], correcta: 'a', dificultad: 9, tipo: 'xxx' }], 'N1', 'chiquitos');
  assert.equal(rows[0].dificultad, 3);
  assert.equal(rows[0].tipo, 'reconocer');
});

test('parseEjercicios: acepta {ejercicios:[...]} además del array pelado', () => {
  const rows = parseEjercicios({ ejercicios: [ej('completar', 2)] }, 'N1', 'chiquitos');
  assert.equal(rows.length, 1);
});

test('parseEjercicios: tira si no es array o si no queda ninguno válido', () => {
  assert.throws(() => parseEjercicios('nope', 'N1', 'chiquitos'), /no_es_array/);
  assert.throws(() => parseEjercicios([{ enunciado: '', opciones: [] }], 'N1', 'chiquitos'), /sin_ejercicios_validos/);
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

test('construirPromptEjercicios: solo chiquitos reciben la guía de imagen', () => {
  const chico = construirPromptEjercicios('Lengua', 1, 'Contar', '', 6);
  assert.match(chico.system, /imagen/);
  assert.match(chico.system, /apples3/);
  // grados más grandes NO llevan imágenes
  const grande = construirPromptEjercicios('Lengua', 5, 'Cuento', '', 6);
  assert.doesNotMatch(grande.system, /apples3/);
});

test('parseEjercicios: conserva imagen solo si está en la whitelist', () => {
  const conValida = parseEjercicios([{ ...ej('reconocer', 1), imagen: 'apples3' }], 'N1', 'chiquitos');
  assert.equal(conValida[0].imagen, 'apples3');
  const conTrucha = parseEjercicios([{ ...ej('reconocer', 1), imagen: 'https://malo.com/x.png' }], 'N1', 'chiquitos');
  assert.equal(conTrucha[0].imagen, undefined);
  const sinImagen = parseEjercicios([ej('reconocer', 1)], 'N1', 'chiquitos');
  assert.equal('imagen' in sinImagen[0], false);
  // la whitelist son exactamente las claves de art.ts item()
  assert.deepEqual([...CLAVES_IMAGEN].sort(), ['apples3', 'arbol', 'oveja', 'solcito', 'stars4', 'uva']);
});

test('parseEjercicios: descarta la imagen si la banda no es chiquitos (enforcement server-side)', () => {
  const item = { ...ej('reconocer', 1), imagen: 'apples3' };
  assert.equal(parseEjercicios([item], 'N1', 'chiquitos')[0].imagen, 'apples3');
  assert.equal('imagen' in parseEjercicios([item], 'N1', 'medianos')[0], false);
  assert.equal('imagen' in parseEjercicios([item], 'N1', 'grandes')[0], false);
});

test('celdasIniciales: sesgo por banda — total 36, toda celda >=1, default uniforme', () => {
  const total = (banda) => celdasIniciales(banda).reduce((s, c) => s + c.n, 0);
  assert.equal(total('chiquitos'), 36);
  assert.equal(total('medianos'), 36);
  assert.equal(total('grandes'), 36);
  // default sin argumento = medianos = comportamiento histórico (3 por celda)
  assert.ok(celdasIniciales().every((c) => c.n === POR_CELDA_INICIAL));
  // toda celda queda con al menos 1 en las 3 bandas
  for (const banda of ['chiquitos', 'medianos', 'grandes']) {
    assert.ok(celdasIniciales(banda).every((c) => c.n >= 1), banda);
  }
  // grandes cargan dificultad 3; chiquitos la alivian y cargan dificultad 1
  const nDif = (banda, dif) => celdasIniciales(banda).filter((c) => c.dificultad === dif).reduce((s, c) => s + c.n, 0);
  assert.ok(nDif('grandes', 3) > nDif('chiquitos', 3));
  assert.ok(nDif('chiquitos', 1) > nDif('grandes', 1));
  assert.deepEqual(SESGO_BANDA.chiquitos, [5, 3, 1]);
});

test('celdasIniciales: el pool sesgado cubre dominio en las 3 bandas', () => {
  for (const banda of ['chiquitos', 'medianos', 'grandes']) {
    const pool = celdasIniciales(banda).flatMap((c) =>
      Array.from({ length: c.n }, () => ({ enunciado: 'x', opciones: ['a', 'b'], correcta: 'a', tipo: c.tipo, dificultad: c.dificultad })));
    assert.equal(cubreDominio(pool), true, banda);
  }
});

test('construirPromptEjercicios: chiquitos NO recibe bloque de formatos; medianos/grandes SÍ', () => {
  const chico = construirPromptEjercicios('Lengua', 1, 'X', '', 6);
  assert.doesNotMatch(chico.system, /Detalle de cada formato/);
  assert.match(chico.system, /OPCIÓN MÚLTIPLE/);
  const mediano = construirPromptEjercicios('Lengua', 3, 'X', '', 6);
  assert.match(mediano.system, /Detalle de cada formato/);
  assert.match(mediano.system, /escribir/);
  assert.match(mediano.system, /"formato":/); // el shape incluye formato
});

test('parseEjercicios: escribir válido conserva correcta y vacía opciones; descarta vacía o >40', () => {
  const bueno = parseEjercicios([{ enunciado: 'Escribí el animal', opciones: [], correcta: 'la vaca', tipo: 'producir', formato: 'escribir' }], 'N1', 'medianos');
  assert.equal(bueno.length, 1);
  assert.equal(bueno[0].formato, 'escribir');
  assert.equal(bueno[0].correcta, 'la vaca');
  assert.deepEqual(bueno[0].opciones, []);
  assert.throws(() => parseEjercicios([{ enunciado: 'x', opciones: [], correcta: '', formato: 'escribir' }], 'N1', 'medianos'), /sin_ejercicios/);
  const larga = 'a'.repeat(41);
  assert.throws(() => parseEjercicios([{ enunciado: 'x', opciones: [], correcta: larga, formato: 'escribir' }], 'N1', 'medianos'), /sin_ejercicios/);
});

test('parseEjercicios: escribir conserva el flag estricto solo si viene true', () => {
  const con = parseEjercicios([{ enunciado: 'x', opciones: [], correcta: 'camión', formato: 'escribir', datos: { estricto: true } }], 'N1', 'grandes');
  assert.deepEqual(con[0].datos, { estricto: true });
  const sin = parseEjercicios([{ enunciado: 'x', opciones: [], correcta: 'camion', formato: 'escribir' }], 'N1', 'grandes');
  assert.equal('datos' in sin[0], false);
});

test('parseEjercicios: gating por banda — escribir se descarta para chiquitos', () => {
  const r = parseEjercicios([
    { enunciado: 'x', opciones: [], correcta: 'vaca', formato: 'escribir' },
    { enunciado: 'y', opciones: ['a', 'b'], correcta: 'a', formato: 'opciones' },
  ], 'N1', 'chiquitos');
  assert.equal(r.length, 1);
  assert.equal(r[0].formato, 'opciones');
});

test('parseEjercicios: ordenar válido si las fichas unidas == correcta; descarta si no coincide o largo fuera de 3..8', () => {
  const ok = parseEjercicios([{ enunciado: 'Ordená', opciones: ['El', 'perro', 'corre'], correcta: 'El perro corre', tipo: 'ordenar', formato: 'ordenar' }], 'N1', 'medianos');
  assert.equal(ok[0].formato, 'ordenar');
  assert.deepEqual(ok[0].opciones, ['El', 'perro', 'corre']);
  // fichas que no arman la correcta → descartado
  assert.throws(() => parseEjercicios([{ enunciado: 'x', opciones: ['El', 'gato', 'corre'], correcta: 'El perro corre', formato: 'ordenar' }], 'N1', 'medianos'), /sin_ejercicios/);
  // menos de 3 fichas → descartado
  assert.throws(() => parseEjercicios([{ enunciado: 'x', opciones: ['El', 'perro'], correcta: 'El perro', formato: 'ordenar' }], 'N1', 'medianos'), /sin_ejercicios/);
});

test('parseEjercicios: gating — ordenar se descarta para chiquitos, se acepta para medianos/grandes', () => {
  const item = { enunciado: 'x', opciones: ['a', 'b', 'c'], correcta: 'a b c', formato: 'ordenar' };
  assert.throws(() => parseEjercicios([item], 'N1', 'chiquitos'), /sin_ejercicios/);
  assert.equal(parseEjercicios([item], 'N1', 'grandes')[0].formato, 'ordenar');
});

test('parseEjercicios: unir construye correcta desde los pares, vacía opciones y guarda datos.pares', () => {
  const item = { enunciado: 'Uní', formato: 'unir', tipo: 'reconocer', pares: [{ izq: 'vaca', der: 'ternero' }, { izq: 'oveja', der: 'cordero' }, { izq: 'gallina', der: 'pollito' }] };
  const r = parseEjercicios([item], 'N1', 'grandes');
  assert.equal(r[0].formato, 'unir');
  assert.deepEqual(r[0].opciones, []);
  assert.equal(r[0].correcta, 'vaca → ternero · oveja → cordero · gallina → pollito');
  assert.equal(r[0].datos.pares.length, 3);
});

test('parseEjercicios: unir descarta si <3 pares o si hay izq/der duplicada tras normalizar', () => {
  assert.throws(() => parseEjercicios([{ enunciado: 'x', formato: 'unir', pares: [{ izq: 'a', der: '1' }, { izq: 'b', der: '2' }] }], 'N1', 'grandes'), /sin_ejercicios/); // solo 2
  // izq duplicada tras normalizar ("Vaca" y "vaca")
  assert.throws(() => parseEjercicios([{ enunciado: 'x', formato: 'unir', pares: [{ izq: 'Vaca', der: '1' }, { izq: 'vaca', der: '2' }, { izq: 'c', der: '3' }] }], 'N1', 'grandes'), /sin_ejercicios/);
});

test('parseEjercicios: gating — unir solo para grandes (medianos lo descarta)', () => {
  const item = { enunciado: 'x', formato: 'unir', pares: [{ izq: 'a', der: '1' }, { izq: 'b', der: '2' }, { izq: 'c', der: '3' }] };
  assert.throws(() => parseEjercicios([item], 'N1', 'medianos'), /sin_ejercicios/);
  assert.equal(parseEjercicios([item], 'N1', 'grandes')[0].formato, 'unir');
});
