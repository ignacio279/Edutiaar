// Tests unitarios del diagnóstico puro (supabase/functions/evaluar-sesion/diagnostico.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEval } from '../../supabase/functions/evaluar-sesion/diagnostico.ts';

const r = (correcta, reintentos, enunciado, dada, esperaba, tipo = 'reconocer') => ({ enunciado, dada, esperaba, correcta, reintentos, tipo });




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
