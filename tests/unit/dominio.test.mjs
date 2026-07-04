// Tests unitarios de la regla de dominio (web/lib/dominio.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverEstado,
  coberturaHistorica,
  dosUltimasMal,
  calcularEstadoProgresivo,
  UMBRAL_DOMINIO,
  MIN_EJERCICIOS_DOMINIO,
  pesoTipo,
  esperado,
  aplicarRespuesta,
  puntajeSesion,
  K_ELO,
} from '../../web/lib/dominio.ts';

// helper: respuesta (correcta, reintentos, tipo, dificultad)
const r = (correcta, reintentos, tipo, dificultad) => ({ correcta, reintentos, tipo, dificultad });
const ft = (tipo, dif) => r(true, 0, tipo, dif); // acierto al primer intento
const fail = (tipo, dif) => r(false, 1, tipo, dif);

test('resolverEstado: sin override devuelve el cálculo de la regla', () => {
  const calculo = { estado: 'en_construccion', puntaje: 40 };
  assert.deepEqual(resolverEstado(calculo, false, 'dominado'), calculo);
});

test('resolverEstado: con override gana el estado manual de la docente, pero conserva el puntaje', () => {
  const calculo = { estado: 'a_reforzar', puntaje: 55 };
  assert.deepEqual(resolverEstado(calculo, true, 'dominado'), { estado: 'dominado', puntaje: 55 });
});

test('esperado: con puntaje 0 casi no se espera acertar lo difícil', () => {
  assert.ok(esperado(0, 3) < 0.02); // nivel 75, 10^(75/40) enorme
  assert.ok(esperado(0, 1) > 0.15 && esperado(0, 1) < 0.3); // fácil: algo se espera
});

test('esperado: con puntaje alto lo fácil es casi seguro', () => {
  assert.ok(esperado(90, 1) > 0.95);
});

test('aplicarRespuesta: acertar difícil a nivel bajo suma mucho; fácil a nivel alto casi nada', () => {
  const saltoDificil = aplicarRespuesta(30, r(true, 0, 'producir', 3)) - 30;
  const saltoFacil = aplicarRespuesta(90, r(true, 0, 'reconocer', 1)) - 90;
  assert.ok(saltoDificil > 10, `esperaba > 10, dio ${saltoDificil}`); // K=8 × peso 2 × (~0.93)
  assert.ok(saltoFacil < 0.5, `esperaba < 0.5, dio ${saltoFacil}`);
});

test('aplicarRespuesta: asimetría — fallar resta la mitad de lo que sumaría acertar', () => {
  // A puntaje 50 con ejercicio de su nivel (dif 2 → nivel 50): esperado = 0.5.
  const sube = aplicarRespuesta(50, r(true, 0, 'reconocer', 2)) - 50; // +K×0.5
  const baja = 50 - aplicarRespuesta(50, r(false, 1, 'reconocer', 2)); // K×0.5/2
  assert.ok(Math.abs(sube - K_ELO * 0.5) < 0.01);
  assert.ok(Math.abs(baja - (K_ELO * 0.5) / 2) < 0.01);
});

test('aplicarRespuesta: acertar con reintentos mueve como fallo del primer intento (baja)', () => {
  const conReintento = aplicarRespuesta(50, r(true, 2, 'reconocer', 2));
  const falloSeco = aplicarRespuesta(50, r(false, 1, 'reconocer', 2));
  assert.equal(conReintento, falloSeco); // el primer intento falló en ambos
  assert.ok(conReintento < 50);
});

test('aplicarRespuesta: clamp a [0, 100]', () => {
  assert.equal(aplicarRespuesta(0, r(false, 1, 'reconocer', 1)), 0);
  assert.ok(aplicarRespuesta(99.9, r(true, 0, 'producir', 3)) <= 100);
});

test('puntajeSesion: replay determinístico en orden cronológico, redondeo a 2 decimales', () => {
  const rs = [r(true, 0, 'reconocer', 1), r(true, 0, 'completar', 2), r(false, 1, 'reconocer', 1)];
  const paso1 = aplicarRespuesta(0, rs[0]);
  const paso2 = aplicarRespuesta(paso1, rs[1]);
  const paso3 = aplicarRespuesta(paso2, rs[2]);
  assert.equal(puntajeSesion(0, rs), Math.round(paso3 * 100) / 100);
  assert.equal(puntajeSesion(0, []), 0); // sin respuestas, no se mueve
});

const base = { puntaje: 75, totalRespondidos: 55, cobertura: { producir: 3, dificil: 2 }, dosUltimasMal: false, tasaSesion: 0.9, estadoActual: 'en_construccion' };

test('estado: dominado con puntaje, cobertura y 50+ ejercicios', () => {
  assert.equal(calcularEstadoProgresivo(base), 'dominado');
});

test('estado: sin 50 ejercicios NO domina aunque sobre puntaje', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, totalRespondidos: 49 }), 'en_construccion');
  assert.equal(calcularEstadoProgresivo({ ...base, totalRespondidos: MIN_EJERCICIOS_DOMINIO }), 'dominado');
});

test('estado: sin cobertura NO domina (2 producir y 1 difícil al primer intento)', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, cobertura: { producir: 1, dificil: 2 } }), 'en_construccion');
  assert.equal(calcularEstadoProgresivo({ ...base, cobertura: { producir: 2, dificil: 0 } }), 'en_construccion');
});

test('estado: bajo el umbral de puntaje NO domina', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: UMBRAL_DOMINIO - 1 }), 'en_construccion');
});

test('estado: dominado es pegajoso — no baja aunque el puntaje caiga', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: 20, estadoActual: 'dominado', dosUltimasMal: true, tasaSesion: 0.1 }), 'dominado');
});

test('estado: a_reforzar por 2 fallos seguidos o sesión floja (si no domina)', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: 40, dosUltimasMal: true }), 'a_reforzar');
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: 40, tasaSesion: 0.4 }), 'a_reforzar');
});

test('estado: sin respuestas queda no_empezado', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, totalRespondidos: 0, estadoActual: 'no_empezado' }), 'no_empezado');
});

test('coberturaHistorica: cuenta solo aciertos al primer intento', () => {
  const todas = [ft('producir', 3), ft('producir', 1), fail('producir', 3), ft('reconocer', 3)];
  assert.deepEqual(coberturaHistorica(todas), { producir: 2, dificil: 2 });
});

test('dosUltimasMal: mira las 2 últimas cronológicas', () => {
  assert.equal(dosUltimasMal([ft('reconocer', 1), fail('reconocer', 1), fail('reconocer', 1)]), true);
  assert.equal(dosUltimasMal([fail('reconocer', 1), fail('reconocer', 1), ft('reconocer', 1)]), false);
  assert.equal(dosUltimasMal([fail('reconocer', 1)]), false);
});

test('pesoTipo: producir 2, ordenar 1.5, resto 1', () => {
  assert.equal(pesoTipo('producir'), 2);
  assert.equal(pesoTipo('ordenar'), 1.5);
  assert.equal(pesoTipo('reconocer'), 1);
  assert.equal(pesoTipo('completar'), 1);
});
