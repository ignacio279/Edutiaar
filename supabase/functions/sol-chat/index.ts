// sol-chat (Fase 2): chat de SOL dentro de practicar. El chico le manda mensajes
// (pedir ayuda sobre el ejercicio actual o preguntar libre sobre el tema) y SOL
// responde. SOL da pistas pero NUNCA dice la opción correcta (la app ya la revela
// sola tras 2 intentos) — la regla vive en el system prompt (chat.ts).
//
// Modo mock por defecto (sin gastar API); Haiku real detrás de flag, con la API key
// SOLO server-side (Rule 1). Tope de costo: modelo barato + max_tokens bajo +
// historial recortado (Rule 4). verify_jwt=true: solo el alumno logueado lo llama.
// El contexto del ejercicio va INLINE: no se lee la DB, no hace falta tool use.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { extraerTexto } from '../_shared/loop.ts';
import { recortarHistorial, aMensajesClaude, construirSystem, mockRespuesta, type ChatMsg } from './chat.ts';

const MODELO = 'claude-haiku-4-5'; // barato; corre seguido (Rule 4)
const MAX_TOKENS = 400; // respuestas cortas para chicos → tope de costo por llamada

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'no_autenticado' }, 401);

    const { mensajes, contexto, esAyuda, mock } = await req.json();
    if (!Array.isArray(mensajes) || mensajes.length === 0) return json({ error: 'faltan_mensajes' }, 400);
    if (!contexto?.nodoNombre) return json({ error: 'falta_contexto' }, 400);

    const recortados = recortarHistorial(mensajes as ChatMsg[]);
    const ultimo = [...recortados].reverse().find((m) => m.role === 'user')?.content ?? '';

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (mock || !key) {
      return json({ texto: mockRespuesta(ultimo, contexto, !!esAyuda), mock: true });
    }

    // Real: UNA sola llamada a la Messages API (sin tools; el contexto va inline).
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: construirSystem(contexto),
        messages: aMensajesClaude(recortados),
      }),
    });
    if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
    const texto = extraerTexto(await r.json());

    return json({ texto });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
