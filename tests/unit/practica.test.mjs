// Tests unitarios de la lógica pura de práctica (web/lib/practica.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirEjercicios, resumen, nivelAdaptativo, tiposPendientes } from '../../web/lib/practica.ts';

const ej = (id, dificultad, tipo = 'reconocer') => ({ id, enunciado: id, opciones: ['a', 'b'], correcta: 'a', dificultad, tipo });

test('elegirEjercicios: ordena por dificultad y respeta el tope', () => {
  const pool = [ej('c', 3), ej('a', 1), ej('b', 2), ej('d', 2)];
  const sel = elegirEjercicios(pool, 3);
  assert.equal(sel.length, 3);
  assert.deepEqual(sel.map((e) => e.dificultad), [1, 2, 2]);
  assert.equal(sel[0].id, 'a');
});

test('elegirEjercicios: tope por defecto 8 y no muta el pool', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ej(String(i), (i % 3) + 1));
  const sel = elegirEjercicios(pool);
  assert.equal(sel.length, 8);
  assert.equal(pool.length, 12);
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
