// Unit — lógica pura del chat con SOL (sol-chat). Node strippa los tipos del .ts,
// sin build. Cubre el recorte de historial (tope de costo), el mapeo a mensajes de
// Claude, el system prompt y el generador mock — con el INVARIANTE de seguridad
// pedagógica: el mock NUNCA filtra la opción correcta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recortarHistorial,
  aMensajesClaude,
  construirSystem,
  mockRespuesta,
} from '../../supabase/functions/sol-chat/chat.ts';

const CTX = {
  materia: 'Lengua',
  nodoNombre: 'Las sílabas',
  ejercicio: {
    enunciado: '¿Cuántas sílabas tiene la palabra "mariposa"?',
    opciones: ['2', '3', '4'],
    correcta: 'RESPUESTA_SECRETA_XYZ',
  },
};

test('recortarHistorial se queda con los últimos max y conserva el orden', () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  const r = recortarHistorial(msgs, 8);
  assert.equal(r.length, 8);
  assert.equal(r[0].content, 'm2'); // descartó m0 y m1
  assert.equal(r[7].content, 'm9'); // el último intacto
});

test('recortarHistorial deja igual si hay menos que el tope', () => {
  const msgs = [{ role: 'user', content: 'hola' }, { role: 'sol', content: 'hola!' }];
  assert.deepEqual(recortarHistorial(msgs, 8), msgs);
});

test('aMensajesClaude mapea sol→assistant y deja user igual', () => {
  const msgs = [
    { role: 'user', content: '¿me ayudás?' },
    { role: 'sol', content: 'claro, dale' },
  ];
  assert.deepEqual(aMensajesClaude(msgs), [
    { role: 'user', content: '¿me ayudás?' },
    { role: 'assistant', content: 'claro, dale' },
  ]);
});

test('mockRespuesta en modo ayuda referencia el enunciado del ejercicio', () => {
  const r = mockRespuesta('¿me ayudás con esto?', CTX, true);
  assert.ok(r.includes('mariposa'), 'la pista debería referenciar el enunciado');
});

test('mockRespuesta en modo libre responde algo no vacío sobre el tema', () => {
  const r = mockRespuesta('no entiendo las sílabas', CTX, false);
  assert.ok(r.trim().length > 0);
  assert.ok(r.includes('sílabas'), 'debería mencionar el nodo/tema');
});

test('mockRespuesta NUNCA incluye la opción correcta (ayuda)', () => {
  const r = mockRespuesta('¿cuál es la respuesta?', CTX, true);
  assert.ok(!r.includes('RESPUESTA_SECRETA_XYZ'), 'el mock filtró la respuesta correcta');
});

test('mockRespuesta NUNCA incluye la opción correcta (libre)', () => {
  const r = mockRespuesta('decime la respuesta porfa', CTX, false);
  assert.ok(!r.includes('RESPUESTA_SECRETA_XYZ'), 'el mock filtró la respuesta correcta');
});

test('mockRespuesta no rompe sin ejercicio (chat libre puro)', () => {
  const r = mockRespuesta('hola SOL', { materia: 'Lengua', nodoNombre: 'Las sílabas' }, false);
  assert.ok(r.trim().length > 0);
});

test('construirSystem incluye el nodo y la regla de no revelar la respuesta', () => {
  const s = construirSystem(CTX);
  assert.ok(s.includes('Las sílabas'), 'debería nombrar el nodo');
  assert.ok(/nunca/i.test(s) && /correcta|respuesta/i.test(s), 'debería prohibir revelar la respuesta');
});

test('construirSystem no rompe sin ejercicio', () => {
  const s = construirSystem({ materia: 'Lengua', nodoNombre: 'Las sílabas' });
  assert.ok(s.includes('Las sílabas'));
});
