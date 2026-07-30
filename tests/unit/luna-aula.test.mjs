// Unit de "LUNA por aula" (web/lib/luna-aula.ts): resolución del aula activa
// desde el searchParam, links internos y filtro de alumnos por aula.
// node --test, sin deps. Importa el .ts directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverAula, linkLuna, puedeCambiarAula, enAula } from '../../web/lib/luna-aula.ts';

const CERRO = { id: 'a1', nombre: '3° grado', codigo: 'CERRO-3A' };
const SALA2 = { id: 'a2', nombre: '4to', codigo: 'SALA2' };

// --- resolverAula ---

test('resolverAula: param válido → esa aula activa', () => {
  assert.deepEqual(resolverAula('a2', [CERRO, SALA2]), { modo: 'aula', aula: SALA2 });
});

test('resolverAula: sin param y 2+ aulas → selector', () => {
  assert.deepEqual(resolverAula(null, [CERRO, SALA2]), { modo: 'selector' });
  assert.deepEqual(resolverAula(undefined, [CERRO, SALA2]), { modo: 'selector' });
});

test('resolverAula: param inválido (aula ajena o inexistente) y 2+ aulas → selector', () => {
  assert.deepEqual(resolverAula('ajena', [CERRO, SALA2]), { modo: 'selector' });
});

test('resolverAula: una sola aula → auto-selección, con o sin param', () => {
  assert.deepEqual(resolverAula(null, [CERRO]), { modo: 'aula', aula: CERRO });
  assert.deepEqual(resolverAula('ajena', [CERRO]), { modo: 'aula', aula: CERRO });
  assert.deepEqual(resolverAula('a1', [CERRO]), { modo: 'aula', aula: CERRO });
});

test('resolverAula: sin aulas → selector (la pantalla explica que no hay)', () => {
  assert.deepEqual(resolverAula(null, []), { modo: 'selector' });
});

// --- linkLuna ---

test('linkLuna: con aula agrega ?aula=, sin aula deja la ruta pelada', () => {
  assert.equal(linkLuna('/docente/luna/chat', 'a1'), '/docente/luna/chat?aula=a1');
  assert.equal(linkLuna('/docente/luna', null), '/docente/luna');
  assert.equal(linkLuna('/docente/luna', undefined), '/docente/luna');
});

test('linkLuna: encodea el id por las dudas', () => {
  assert.equal(linkLuna('/docente/luna', 'a 1&x'), '/docente/luna?aula=a%201%26x');
});

// --- puedeCambiarAula ---

test('puedeCambiarAula: solo con 2 o más aulas', () => {
  assert.equal(puedeCambiarAula([]), false);
  assert.equal(puedeCambiarAula([CERRO]), false);
  assert.equal(puedeCambiarAula([CERRO, SALA2]), true);
});

// --- enAula ---

test('enAula: filtra por aula_id; los alumnos sin aula no entran a ninguna', () => {
  const alumnos = [
    { id: 'x', aula_id: 'a1' },
    { id: 'y', aula_id: 'a2' },
    { id: 'z', aula_id: null },
  ];
  assert.deepEqual(enAula(alumnos, 'a1').map((a) => a.id), ['x']);
  assert.deepEqual(enAula(alumnos, 'a2').map((a) => a.id), ['y']);
  assert.deepEqual(enAula(alumnos, 'otra'), []);
});
