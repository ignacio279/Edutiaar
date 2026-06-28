// evaluar-sesion (Fase 2 / SP-4c): al cerrar una sesión, SOL produce un DIAGNÓSTICO
// cualitativo (resumen, errores, a_reforzar) y lo guarda en evaluacion_sesion. NO mueve
// el estado del nodo (eso es la regla determinística, alumno_nodo). Modo mock por
// defecto; Haiku real detrás de flag, con la API key SOLO server-side (Rule 1).
// verify_jwt=true: lo llama el alumno logueado para SU sesión.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { runToolLoop } from '../_shared/loop.ts';
import type { LlamarClaude } from '../_shared/loop.ts';
import { construirPromptEval, mockDiagnostico, parseEval, TOOL_ESCRIBIR_EVALUACION, type RespuestaDiag } from './diagnostico.ts';

const MODELO = 'claude-haiku-4-5'; // corre seguido (1 por sesión) → barato (Rule 4)
const MAX_TOKENS = 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'no_autenticado' }, 401);

    const { sesion_id, mock } = await req.json();
    if (!sesion_id) return json({ error: 'falta_sesion_id' }, 400);

    const sb = createClient(url, srKey);
    // La sesión tiene que ser del que llama (el alumno evalúa SU sesión).
    const { data: ses } = await sb.from('sesion').select('alumno_id, nodo_id').eq('id', sesion_id).single();
    if (!ses) return json({ error: 'sesion_inexistente' }, 404);
    if (ses.alumno_id !== user.id) return json({ error: 'sesion_ajena' }, 403);

    const { data: nodo } = await sb.from('nodo').select('nombre').eq('id', ses.nodo_id).single();
    const nodoNombre = (nodo as { nombre?: string } | null)?.nombre ?? 'el nodo';

    const { data: resp } = await sb
      .from('respuesta')
      .select('dada, correcta, reintentos, ejercicio:ejercicio_id(enunciado, correcta, tipo)')
      .eq('sesion_id', sesion_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rs: RespuestaDiag[] = ((resp as any[]) || []).map((r) => ({
      enunciado: r.ejercicio?.enunciado ?? '', dada: r.dada ?? '', esperaba: r.ejercicio?.correcta ?? '',
      correcta: !!r.correcta, reintentos: r.reintentos ?? 0, tipo: r.ejercicio?.tipo ?? 'reconocer',
    }));

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    let diag;
    if (mock || !key) {
      diag = mockDiagnostico(nodoNombre, rs);
    } else {
      const { system, user: userMsg } = construirPromptEval(nodoNombre, rs);
      const callClaude: LlamarClaude = async ({ system, messages, tools }) => {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages, tools }),
        });
        if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
        return await r.json();
      };
      let cap: unknown = null;
      await runToolLoop({
        callClaude,
        toolImpls: { escribir_evaluacion: (input) => { cap = input; return 'ok'; } },
        tools: [TOOL_ESCRIBIR_EVALUACION],
        system,
        userMessage: userMsg,
        maxIters: 2,
      });
      diag = parseEval(cap);
    }

    const { data: evalRow, error } = await sb
      .from('evaluacion_sesion')
      .insert({ sesion_id, resumen: diag.resumen, errores: diag.errores, a_reforzar: diag.a_reforzar })
      .select('id, resumen, errores, a_reforzar')
      .single();
    if (error) throw error;

    return json({ evaluacion: evalRow });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
