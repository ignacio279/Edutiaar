// SOL — base de Fase 2 (SP-1): Edge Function que llama a la Messages API de Claude
// con tool use. Dado un programa_id, Claude usa la tool leer_programa para ver el
// temario y devuelve una frase con los temas. La API key de Claude vive SOLO acá
// (server-side, vía Deno.env), nunca en el front (Rule 1). Tope de costo con
// max_tokens + modelo barato + maxIters (Rule 4).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { runToolLoop } from '../_shared/loop.ts';
import type { ImplTools, LlamarClaude } from '../_shared/loop.ts';
import { TOOLS } from './tools.ts';

const MODELO = 'claude-haiku-4-5'; // barato; pensado para correr seguido (Rule 4)
const MAX_TOKENS = 1024; // tope de costo por llamada (Rule 4)

const SYSTEM = [
  'Sos SOL, un copiloto de enseñanza para una escuela rural de Argentina.',
  'Tenés la tool leer_programa para ver el temario de un programa.',
  'Usá la tool con el programa_id que te pasan y después resumí en UNA frase,',
  'en español rioplatense y cálido, qué temas cubre el programa.',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { programa_id } = await req.json();
    if (!programa_id) return json({ error: 'falta_programa_id' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'falta_anthropic_api_key' }, 500);
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // callClaude real: fetch a la Messages API. La key nunca sale de esta función.
    const callClaude: LlamarClaude = async ({ system, messages, tools }) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages, tools }),
      });
      if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
      return await r.json();
    };

    // Las MANOS sobre Supabase: leer el programa (contenido compartido, sin PII).
    const toolImpls: ImplTools = {
      leer_programa: async (input) => {
        const id = input.programa_id as string;
        const { data, error } = await sb
          .from('programa')
          .select('id, grado, contenido, materia:materia_id(nombre)')
          .eq('id', id)
          .single();
        if (error) throw error;
        return JSON.stringify(data);
      },
    };

    const { texto, iters } = await runToolLoop({
      callClaude,
      toolImpls,
      tools: TOOLS,
      system: SYSTEM,
      userMessage: `Resumí el temario del programa con programa_id = ${programa_id}.`,
    });

    return json({ texto, iters });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
