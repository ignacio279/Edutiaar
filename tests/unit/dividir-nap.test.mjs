// Tests unitarios del clasificador NAP en dividir-nodos (Task 5).
// Sin red ni API key: solo la lógica pura de dividir.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDivision, catalogoParaPrompt, construirPromptDivision } from '../../supabase/functions/dividir-nodos/dividir.ts';

const TEMAS = [
  { id: 't1', nombre: 'Fracciones de uso frecuente', eje: 'Número y operaciones' },
  { id: 't2', nombre: 'Figuras planas', eje: 'Geometría y medida' },
];

test('catalogoParaPrompt lista los temas con su id y su eje', () => {
  const txt = catalogoParaPrompt('Matemática', 4, TEMAS);
  assert.ok(txt.includes('t1'));
  assert.ok(txt.includes('Fracciones de uso frecuente'));
  assert.ok(txt.includes('Número y operaciones'));
});

test('parseDivision acepta el mapeo cuando el tema existe', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'Fracciones', orden: 0, nap_tema_id: 't1', nap_confianza: 0.9 }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, 't1');
  assert.equal(d.nodos[0].nap_confianza, 0.9);
});

test('parseDivision acepta null: el clasificador puede decir que no sabe', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'Ética y convivencia', orden: 0, nap_tema_id: null }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, null);
  assert.equal(d.nodos[0].nap_confianza, null);
});

test('parseDivision descarta un tema inventado en vez de guardarlo', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'X', orden: 0, nap_tema_id: 'inventado', nap_confianza: 1 }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, null, 'un id fuera del catálogo cae a null');
  assert.equal(d.nodos[0].nap_confianza, null);
});

test('parseDivision acota la confianza a 0..1 y tolera basura', () => {
  const d = parseDivision(
    { nodos: [
      { nombre: 'A', orden: 0, nap_tema_id: 't1', nap_confianza: 5 },
      { nombre: 'B', orden: 1, nap_tema_id: 't2', nap_confianza: 'alta' },
    ] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_confianza, 1);
  assert.equal(d.nodos[1].nap_confianza, null);
});

test('sin catálogo, la división sigue funcionando y el mapeo queda null', () => {
  const d = parseDivision({ nodos: [{ nombre: 'A', orden: 0 }] }, 'Ética', 4, []);
  assert.equal(d.nodos[0].nap_tema_id, null);
});

// --- Cobertura extra de los dos cambios de diseño sobre el brief original ---

test('catalogoParaPrompt incluye el texto_oficial, no solo la etiqueta corta', () => {
  const temas = [
    { id: 't1', nombre: 'Vocales', eje: 'Lectura', texto_oficial: 'El reconocimiento de las vocales en palabras de uso frecuente.' },
  ];
  const txt = catalogoParaPrompt('Lengua', 1, temas);
  assert.ok(txt.includes('El reconocimiento de las vocales en palabras de uso frecuente.'));
});

test('catalogoParaPrompt etiqueta cada tema con su materia (catálogo multi-materia sin filtrar)', () => {
  const temas = [
    { id: 'm1', nombre: 'Sistema decimal', eje: 'Número y operaciones', materia: 'Matemática' },
    { id: 'l1', nombre: 'Vocales', eje: 'Lectura', materia: 'Lengua' },
  ];
  const txt = catalogoParaPrompt('Matematicas', 1, temas);
  assert.ok(txt.includes('Matemática'));
  assert.ok(txt.includes('Lengua'));
});

test('catalogoParaPrompt sin temas no rompe y deja instrucción de mapear a null', () => {
  const txt = catalogoParaPrompt('Ética', 4, []);
  assert.ok(txt.length > 0);
  assert.match(txt, /null/);
});

test('parseDivision: nap_tema_id que no es string (número, objeto) cae a null', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'A', orden: 0, nap_tema_id: 123 }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, null);
});

test('construirPromptDivision incluye el catálogo y la instrucción explícita de null', () => {
  const { system } = construirPromptDivision('Matematicas', 4, 'Fracciones', TEMAS);
  assert.ok(system.includes('t1'));
  assert.ok(system.includes('Fracciones de uso frecuente'));
  assert.match(system, /nap_tema_id: null/);
  assert.match(system, /preferible dejarlo sin clasificar/);
});

test('construirPromptDivision sin catálogo (tema desconocido) sigue armando el prompt', () => {
  const { system, user } = construirPromptDivision('Ética', 3, 'Convivencia');
  assert.ok(system.length > 0);
  assert.match(user, /Convivencia/);
});
