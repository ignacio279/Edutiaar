// Tests unitarios de la lógica pura de práctica (web/lib/practica.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirEjercicios, resumen } from '../../web/lib/practica.ts';

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
