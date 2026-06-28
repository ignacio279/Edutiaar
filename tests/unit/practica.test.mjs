// Tests unitarios de la lógica pura de práctica (web/lib/practica.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirEjercicios, resumen, nivelAdaptativo, tiposPendientes } from '../../web/lib/practica.ts';

const ej = (id, tipo, dif) => ({ id, enunciado: '', opciones: [], correcta: '', dificultad: dif, tipo });

test('elegirEjercicios sin historia: arranca por reconocer fácil (cobertura + nivel mínimo)', () => {
  const pool = [ej('p', 'producir', 3), ej('r', 'reconocer', 1), ej('c', 'completar', 2)];
  const out = elegirEjercicios(pool, [], 3);
  assert.equal(out[0].id, 'r'); // reconocer es el primer tipo pendiente, dif cercana al nivel min
});

test('elegirEjercicios: si ya domina reconocer, prioriza el próximo tipo pendiente', () => {
  const pool = [ej('r', 'reconocer', 1), ej('c', 'completar', 2), ej('p', 'producir', 3)];
  const historia = [ft('reconocer', 1)]; // reconocer ya cubierto
  const out = elegirEjercicios(pool, historia, 3);
  assert.notEqual(out[0].tipo, 'reconocer'); // ya no lo prioriza
});

test('elegirEjercicios: determinístico — mismo input, mismo orden', () => {
  const pool = [ej('b', 'reconocer', 2), ej('a', 'reconocer', 2)];
  assert.deepEqual(
    elegirEjercicios(pool, [], 2).map((x) => x.id),
    elegirEjercicios(pool, [], 2).map((x) => x.id),
  );
});

test('elegirEjercicios: corta en max', () => {
  const pool = [ej('a', 'reconocer', 1), ej('b', 'completar', 1), ej('c', 'ordenar', 1)];
  assert.equal(elegirEjercicios(pool, [], 2).length, 2);
});

test('resumen: cuenta aciertos, total y aciertos al primer intento', () => {
  const regs = [
    { ejercicio_id: '1', dada: 'a', correcta: true, reintentos: 0, tiempo_seg: 3 },
    { ejercicio_id: '2', dada: 'a', correcta: true, reintentos: 1, tiempo_seg: 5 },
    { ejercicio_id: '3', dada: 'b', correcta: false, reintentos: 2, tiempo_seg: 8 },
  ];
  assert.deepEqual(resumen(regs), { aciertos: 2, total: 3, primerIntento: 1 });
});

test('resumen: lista vacía', () => {
  assert.deepEqual(resumen([]), { aciertos: 0, total: 0, primerIntento: 0 });
});

// pool con dificultades 1..3 (como la semilla)
const pool = [
  { id: 'a', enunciado: '', opciones: [], correcta: '', dificultad: 1, tipo: 'reconocer' },
  { id: 'b', enunciado: '', opciones: [], correcta: '', dificultad: 2, tipo: 'completar' },
  { id: 'c', enunciado: '', opciones: [], correcta: '', dificultad: 3, tipo: 'producir' },
];
const ft = (tipo, dif) => ({ correcta: true, reintentos: 0, tipo, dificultad: dif });
const fail = (tipo, dif) => ({ correcta: false, reintentos: 1, tipo, dificultad: dif });

test('nivelAdaptativo: sin historia arranca en la dificultad más baja del pool', () => {
  assert.equal(nivelAdaptativo([], pool), 1);
});

test('nivelAdaptativo: racha de >=2 al primer intento sube el nivel', () => {
  // más reciente primero: dos aciertos al 1er intento en dif 2 => sube a 3
  assert.equal(nivelAdaptativo([ft('completar', 2), ft('reconocer', 2)], pool), 3);
});

test('nivelAdaptativo: dos fallos seguidos al 1er intento bajan el nivel', () => {
  assert.equal(nivelAdaptativo([fail('producir', 3), fail('producir', 3)], pool), 2);
});

test('nivelAdaptativo: clamp al máximo del pool (no se va de 3)', () => {
  assert.equal(nivelAdaptativo([ft('producir', 3), ft('producir', 3)], pool), 3);
});

test('nivelAdaptativo: clamp al mínimo del pool (no baja de 1)', () => {
  assert.equal(nivelAdaptativo([fail('reconocer', 1), fail('reconocer', 1)], pool), 1);
});

test('tiposPendientes: sin historia, faltan los 4 tipos en orden de demanda', () => {
  assert.deepEqual(tiposPendientes([]), ['reconocer', 'completar', 'ordenar', 'producir']);
});

test('tiposPendientes: un acierto al 1er intento saca ese tipo de pendientes', () => {
  assert.deepEqual(tiposPendientes([ft('reconocer', 1)]), ['completar', 'ordenar', 'producir']);
});

test('tiposPendientes: acertar con reintento NO cuenta como cubierto', () => {
  const conReintento = { correcta: true, reintentos: 1, tipo: 'reconocer', dificultad: 1 };
  assert.deepEqual(tiposPendientes([conReintento]), ['reconocer', 'completar', 'ordenar', 'producir']);
});
