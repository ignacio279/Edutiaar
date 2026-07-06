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
  aBurbujas,
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






test('construirSystem incluye el nodo y la regla de no revelar la respuesta', () => {
  const s = construirSystem(CTX);
  assert.ok(s.includes('Las sílabas'), 'debería nombrar el nodo');
  assert.ok(/nunca/i.test(s) && /correcta|respuesta/i.test(s), 'debería prohibir revelar la respuesta');
});

test('construirSystem no rompe sin ejercicio', () => {
  const s = construirSystem({ materia: 'Lengua', nodoNombre: 'Las sílabas' });
  assert.ok(s.includes('Las sílabas'));
});

test('construirSystem pide texto plano y el flujo "¿Te quedó claro?"', () => {
  const s = construirSystem(CTX);
  assert.ok(/texto plano/i.test(s), 'debería exigir texto plano (sin markdown)');
  assert.ok(/asteriscos/i.test(s), 'debería prohibir asteriscos');
  assert.ok(s.includes('¿Te quedó claro?'), 'debería cerrar las dudas con "¿Te quedó claro?"');
  assert.ok(/confirme|te diga que sí/i.test(s), 'debería esperar confirmación antes de seguir');
});

test('aBurbujas limpia asteriscos, títulos y viñetas', () => {
  const r = aBurbujas('## Ojo\n**Decena** = grupos de 10.\n- __Centena__ = grupos de 100.');
  assert.equal(r.length, 1);
  assert.ok(!r[0].includes('*') && !r[0].includes('#') && !r[0].includes('_'), 'sin restos de markdown');
  assert.ok(r[0].includes('Decena = grupos de 10.'));
  assert.ok(r[0].includes('Centena = grupos de 100.'));
});

test('aBurbujas separa la respuesta y el "¿Te quedó claro?" en dos burbujas', () => {
  const r = aBurbujas('La decena son grupos de 10.\n\n¿Te quedó claro?');
  assert.deepEqual(r, ['La decena son grupos de 10.', '¿Te quedó claro?']);
});

test('aBurbujas con más de dos párrafos junta todo menos el último', () => {
  const r = aBurbujas('Uno.\n\nDos.\n\n¿Te quedó claro?');
  assert.equal(r.length, 2);
  assert.ok(r[0].includes('Uno.') && r[0].includes('Dos.'));
  assert.equal(r[1], '¿Te quedó claro?');
});

test('aBurbujas: un párrafo solo queda como una burbuja y sin texto no hay burbujas', () => {
  assert.deepEqual(aBurbujas('¡Muy bien! Dale, probá.'), ['¡Muy bien! Dale, probá.']);
  assert.deepEqual(aBurbujas('   \n\n  '), []);
});
