// Tests unitarios de la regla de dominio (web/lib/dominio.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstado, puntajeNodo } from '../../web/lib/dominio.ts';

// helper: respuesta (correcta, reintentos, tipo, dificultad)
const r = (correcta, reintentos, tipo, dificultad) => ({ correcta, reintentos, tipo, dificultad });
const ft = (tipo, dif) => r(true, 0, tipo, dif); // acierto al primer intento
const fail = (tipo, dif) => r(false, 1, tipo, dif);

test('dominado: >=6 al primer intento con >=2 producir y >=1 difícil', () => {
  const ventana = [
    ft('producir', 3), ft('producir', 2), ft('reconocer', 1), ft('reconocer', 2),
    ft('completar', 2), ft('ordenar', 2), fail('reconocer', 1), fail('reconocer', 2),
  ];
  assert.equal(calcularEstado(ventana, 0.75).estado, 'dominado');
});

test('NO domina sin 2 producir (aunque tenga 6+ aciertos)', () => {
  const ventana = [ft('reconocer', 3), ft('reconocer', 2), ft('completar', 2), ft('ordenar', 2), ft('reconocer', 1), ft('producir', 2), ft('reconocer', 1), ft('reconocer', 1)];
  assert.equal(calcularEstado(ventana, 0.9).estado, 'en_construccion');
});

test('NO domina sin un difícil', () => {
  const ventana = [ft('producir', 2), ft('producir', 2), ft('reconocer', 1), ft('completar', 2), ft('ordenar', 2), ft('reconocer', 2), ft('reconocer', 1), ft('reconocer', 1)];
  assert.equal(calcularEstado(ventana, 0.9).estado, 'en_construccion');
});

test('a_reforzar: las 2 más recientes fallaron al primer intento', () => {
  const ventana = [fail('reconocer', 1), fail('reconocer', 2), ft('reconocer', 1), ft('producir', 2)];
  assert.equal(calcularEstado(ventana, 0.6).estado, 'a_reforzar');
});

test('a_reforzar: sesión por debajo del 50%', () => {
  const ventana = [ft('reconocer', 1), ft('reconocer', 1)];
  assert.equal(calcularEstado(ventana, 0.3).estado, 'a_reforzar');
});

test('en_construccion: practicó pero no alcanza dominio ni reforzar', () => {
  const ventana = [ft('reconocer', 1), ft('completar', 2), ft('reconocer', 1)];
  assert.equal(calcularEstado(ventana, 0.8).estado, 'en_construccion');
});

test('dominado es sticky: no se baja por una sesión floja (D5, no castiga)', () => {
  const ventana = [fail('reconocer', 1), fail('reconocer', 2)];
  assert.equal(calcularEstado(ventana, 0.2, 'dominado').estado, 'dominado');
});

test('ventana vacía: mantiene el estado actual, nunca no_empezado por error', () => {
  assert.equal(calcularEstado([], 0, 'en_construccion').estado, 'en_construccion');
});

test('puntajeNodo: 0..100 ponderado; todo al primer intento = 100', () => {
  const ventana = [ft('producir', 3), ft('reconocer', 1)];
  assert.equal(puntajeNodo(ventana), 100);
  assert.equal(puntajeNodo([]), 0);
  // la mitad del peso logrado
  const mitad = puntajeNodo([ft('reconocer', 2), fail('reconocer', 2)]);
  assert.equal(mitad, 50);
});
