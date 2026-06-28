// Tests unitarios del diagnóstico puro (supabase/functions/evaluar-sesion/diagnostico.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockDiagnostico, parseEval } from '../../supabase/functions/evaluar-sesion/diagnostico.ts';

const r = (correcta, reintentos, enunciado, dada, esperaba, tipo = 'reconocer') => ({ enunciado, dada, esperaba, correcta, reintentos, tipo });

test('mockDiagnostico: sesión buena → sin a_reforzar, resumen alentador', () => {
  const rs = [r(true, 0, 'a', 'a', 'a'), r(true, 0, 'b', 'b', 'b'), r(true, 0, 'c', 'c', 'c'), r(true, 1, 'd', 'd', 'd')];
  const d = mockDiagnostico('Vocales', rs);
  assert.match(d.resumen, /Vocales/);
  assert.match(d.resumen, /4 de 4/);
  assert.deepEqual(d.a_reforzar, []);
  assert.equal(d.errores.length, 0);
});

test('mockDiagnostico: sesión floja → a_reforzar el nodo + lista errores', () => {
  const rs = [r(false, 1, 'cuál vocal', 'm', 'a'), r(false, 2, 'cuántas', '2', '4'), r(true, 0, 'ok', 'x', 'x')];
  const d = mockDiagnostico('Sílabas', rs);
  assert.deepEqual(d.a_reforzar, ['Sílabas']);
  assert.equal(d.errores.length, 2);
  assert.deepEqual(d.errores[0], { pregunta: 'cuál vocal', respondio: 'm', esperaba: 'a' });
});

test('mockDiagnostico: sin respuestas', () => {
  const d = mockDiagnostico('Cuento', []);
  assert.match(d.resumen, /No registró/);
  assert.deepEqual(d.a_reforzar, []);
});

test('parseEval: normaliza y completa faltantes', () => {
  const d = parseEval({ resumen: '  ok  ', errores: [{ pregunta: 'p' }], a_reforzar: ['Vocales'] });
  assert.equal(d.resumen, 'ok');
  assert.deepEqual(d.errores[0], { pregunta: 'p', respondio: '', esperaba: '' });
  assert.deepEqual(d.a_reforzar, ['Vocales']);
});

test('parseEval: vacío → defaults seguros', () => {
  const d = parseEval({});
  assert.ok(d.resumen.length > 0);
  assert.deepEqual(d.errores, []);
  assert.deepEqual(d.a_reforzar, []);
});
