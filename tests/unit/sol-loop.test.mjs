// Tests unitarios del loop de tool-use de SOL (supabase/functions/sol/loop.ts).
// Sin red ni API key: inyectamos un Claude falso y tools falsas. Corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop, extraerToolUses, extraerTexto } from '../../supabase/functions/_shared/loop.ts';
import { TOOLS } from '../../supabase/functions/sol/tools.ts';

test('runToolLoop: Claude pide la tool, se realimenta el resultado y termina con texto', async () => {
  const llamadas = [];
  const respuestas = [
    { stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: 'tu_1', name: 'leer_programa', input: { programa_id: 'P1' } },
    ] },
    { stop_reason: 'end_turn', content: [
      { type: 'text', text: 'El programa cubre vocales y sílabas.' },
    ] },
  ];
  let i = 0;
  const callClaude = async (req) => { llamadas.push(req); return respuestas[i++]; };

  let recibido;
  const toolImpls = {
    leer_programa: (input) => { recibido = input; return JSON.stringify({ contenido: 'Vocales, sílabas' }); },
  };

  const { texto, iters } = await runToolLoop({
    callClaude, toolImpls, tools: TOOLS, system: 'sys', userMessage: 'resumí P1',
  });

  assert.equal(texto, 'El programa cubre vocales y sílabas.');
  assert.equal(iters, 2);
  assert.deepEqual(recibido, { programa_id: 'P1' }, 'la tool recibe el input que pidió Claude');

  // La 2ª llamada debe realimentar el tool_result al historial.
  assert.equal(llamadas.length, 2);
  const ultimo = llamadas[1].messages.at(-1);
  assert.equal(ultimo.role, 'user');
  assert.equal(ultimo.content[0].type, 'tool_result');
  assert.equal(ultimo.content[0].tool_use_id, 'tu_1');
  assert.match(ultimo.content[0].content, /Vocales/);
  // Y el turno del assistant con el tool_use debe estar guardado antes.
  assert.equal(llamadas[1].messages.some((m) => m.role === 'assistant'), true);
});

test('runToolLoop: sin tool_use devuelve el texto en una sola iteración', async () => {
  const callClaude = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hola' }] });
  const { texto, iters } = await runToolLoop({
    callClaude, toolImpls: {}, tools: TOOLS, system: 's', userMessage: 'u',
  });
  assert.equal(texto, 'Hola');
  assert.equal(iters, 1);
});

test('runToolLoop: tool desconocida no rompe, realimenta un error y sigue', async () => {
  const respuestas = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_x', name: 'no_existe', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'listo' }] },
  ];
  let i = 0;
  const callClaude = async () => respuestas[i++];
  const { texto } = await runToolLoop({
    callClaude, toolImpls: {}, tools: TOOLS, system: 's', userMessage: 'u',
  });
  assert.equal(texto, 'listo');
});

test('runToolLoop: respeta el tope de iteraciones (guardarraíl anti-loop)', async () => {
  // Claude pide tool siempre → debe cortar en maxIters, no colgarse.
  const callClaude = async () => ({
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu', name: 'leer_programa', input: {} }],
  });
  const { iters, texto } = await runToolLoop({
    callClaude, toolImpls: { leer_programa: () => 'x' }, tools: TOOLS,
    system: 's', userMessage: 'u', maxIters: 3,
  });
  assert.equal(iters, 3);
  assert.equal(texto, '');
});

test('extraerToolUses / extraerTexto: filtran por tipo de bloque', () => {
  const res = { stop_reason: 'tool_use', content: [
    { type: 'text', text: 'a' },
    { type: 'tool_use', id: 't', name: 'x', input: {} },
    { type: 'text', text: 'b' },
  ] };
  assert.equal(extraerToolUses(res).length, 1);
  assert.equal(extraerTexto(res), 'a\nb');
});
