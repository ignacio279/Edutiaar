// Loop de tool-use contra la Messages API de Claude — lógica PURA, compartida por
// las funciones de SOL (sol, dividir-nodos, …). `callClaude` y las tools se
// INYECTAN: así el loop se testea desde Node sin red ni API key
// (ver tests/unit/sol-loop.test.mjs). Sin Deno, sin fetch propio.

export type Bloque =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

export type Mensaje = { role: 'user' | 'assistant'; content: string | Bloque[] };

export type RespClaude = { stop_reason: string; content: Bloque[] };

export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export type LlamarClaude = (req: { system: string; messages: Mensaje[]; tools: Tool[] }) => Promise<RespClaude>;

export type ImplTools = Record<string, (input: Record<string, unknown>) => Promise<string> | string>;

export function extraerToolUses(res: RespClaude): Extract<Bloque, { type: 'tool_use' }>[] {
  return (res.content ?? []).filter((b): b is Extract<Bloque, { type: 'tool_use' }> => b.type === 'tool_use');
}

export function extraerTexto(res: RespClaude): string {
  return (res.content ?? [])
    .filter((b): b is Extract<Bloque, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// Corre el ida y vuelta con Claude: si pide tools, las ejecuta y le realimenta el
// resultado, hasta que responde con texto o se agota `maxIters` (guardarraíl).
export async function runToolLoop(opts: {
  callClaude: LlamarClaude;
  toolImpls: ImplTools;
  tools: Tool[];
  system: string;
  userMessage: string | Bloque[];
  maxIters?: number;
}): Promise<{ texto: string; iters: number }> {
  const { callClaude, toolImpls, tools, system, userMessage } = opts;
  const maxIters = opts.maxIters ?? 4;
  const messages: Mensaje[] = [{ role: 'user', content: userMessage }];

  let iters = 0;
  while (iters < maxIters) {
    iters++;
    const res = await callClaude({ system, messages, tools });

    if (res.stop_reason !== 'tool_use') {
      return { texto: extraerTexto(res), iters };
    }

    // Claude pidió tools: guardamos su turno y respondemos cada tool_use.
    messages.push({ role: 'assistant', content: res.content });
    const resultados: Bloque[] = [];
    for (const uso of extraerToolUses(res)) {
      const impl = toolImpls[uso.name];
      const content = impl
        ? String(await impl(uso.input))
        : `error: tool desconocida "${uso.name}"`;
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content });
    }
    messages.push({ role: 'user', content: resultados });
  }

  // Se agotó el tope de iteraciones: cortamos (no seguimos gastando llamadas).
  return { texto: '', iters };
}
