// Tests del guardado local de la tanda en curso (web/lib/practica-storage.ts). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveProgreso, guardarProgreso, leerProgreso, borrarProgreso } from '../../web/lib/practica-storage.ts';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

const tanda = {
  ejercicios: [
    { id: 'e1', enunciado: '2+2', opciones: ['3', '4'], correcta: '4', dificultad: 1, tipo: 'reconocer' },
    { id: 'e2', enunciado: '3+3', opciones: ['5', '6'], correcta: '6', dificultad: 1, tipo: 'reconocer' },
  ],
  idx: 1,
  reintentos: 1,
  respuestas: [{ ejercicio_id: 'e1', dada: '4', correcta: true, reintentos: 0, tiempo_seg: 3 }],
  msgs: [
    { who: 'sol', kind: 'text', text: '¡Hola!' },
    { who: 'sol', kind: 'q', ejIdx: 0 },
    { who: 'kid', kind: 'text', text: '4' },
    { who: 'sol', kind: 'q', ejIdx: 1 },
  ],
  chatCount: 2,
  nodoNombre: 'Sumas',
  materia: 'Matemática',
};

test('guardar → leer: roundtrip completo de la tanda', () => {
  const s = fakeStorage();
  guardarProgreso('a1', 'n1', tanda, s);
  const p = leerProgreso('a1', 'n1', s);
  assert.deepEqual(p, { ...tanda, v: 1 });
});

test('clave por alumno+nodo: la tanda de un chico no se filtra a otro', () => {
  const s = fakeStorage();
  guardarProgreso('a1', 'n1', tanda, s);
  assert.equal(leerProgreso('a2', 'n1', s), null, 'otro alumno, mismo nodo');
  assert.equal(leerProgreso('a1', 'n2', s), null, 'mismo alumno, otro nodo');
  assert.notEqual(claveProgreso('a1', 'n1'), claveProgreso('a2', 'n1'));
});

test('leer: JSON roto → null y limpia la clave', () => {
  const s = fakeStorage();
  s.setItem(claveProgreso('a1', 'n1'), '{rota');
  assert.equal(leerProgreso('a1', 'n1', s), null);
  assert.equal(s._map.size, 0, 'la clave rota se borra');
});

test('leer: snapshot inválido (idx fuera de rango, sin ejercicios, versión rara) → null', () => {
  const s = fakeStorage();
  guardarProgreso('a1', 'n1', { ...tanda, idx: 99 }, s);
  assert.equal(leerProgreso('a1', 'n1', s), null, 'idx fuera de rango');
  guardarProgreso('a1', 'n1', { ...tanda, ejercicios: [] }, s);
  assert.equal(leerProgreso('a1', 'n1', s), null, 'sin ejercicios');
  s.setItem(claveProgreso('a1', 'n1'), JSON.stringify({ ...tanda, v: 2 }));
  assert.equal(leerProgreso('a1', 'n1', s), null, 'versión desconocida');
});

test('borrar: saca el snapshot (leer vuelve null)', () => {
  const s = fakeStorage();
  guardarProgreso('a1', 'n1', tanda, s);
  borrarProgreso('a1', 'n1', s);
  assert.equal(leerProgreso('a1', 'n1', s), null);
});

test('sin storage (null): no explota, leer devuelve null', () => {
  assert.doesNotThrow(() => guardarProgreso('a1', 'n1', tanda, null));
  assert.equal(leerProgreso('a1', 'n1', null), null);
  assert.doesNotThrow(() => borrarProgreso('a1', 'n1', null));
});
