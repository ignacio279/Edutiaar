// sol-chat (Fase 2): chat de SOL dentro de practicar. El chico le manda mensajes
// (pedir ayuda sobre el ejercicio actual o preguntar libre sobre el tema) y SOL
// responde. SOL da pistas pero NUNCA dice la opción correcta (la app ya la revela
// sola tras 2 intentos) — la regla vive en el system prompt (chat.ts).
//
// Claude real siempre (sin mock: si falta la key, error explícito — nunca una
// respuesta enlatada). API key SOLO server-side (Rule 1). Tope de costo: modelo
// barato + max_tokens bajo + historial recortado (Rule 4). verify_jwt=true.
// El contexto del ejercicio va INLINE: no se lee la DB, no hace falta tool use.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { extraerTexto } from '../_shared/loop.ts';
import { verificarAcceso } from '../_shared/acceso.ts';
import { registrarUso } from '../_shared/uso.ts';
import { recortarHistorial, aMensajesClaude, construirSystem, aBurbujas, type ChatMsg } from './chat.ts';

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

    const { mensajes, contexto } = await req.json();
    if (!Array.isArray(mensajes) || mensajes.length === 0) return json({ error: 'faltan_mensajes' }, 400);
    if (!contexto?.nodoNombre) return json({ error: 'falta_contexto' }, 400);

    const recortados = recortarHistorial(mensajes as ChatMsg[]);

    // Acceso de plataforma (Dashboard admin v3): el chat de práctica gasta IA,
    // así que cuelga del toggle de SOL, del estado del colegio y del tope
    // mensual. Se necesita service_role (acceso_de y uso_api son server-only).
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const acc = await verificarAcceso(sb, user.id, { genera: true, feature: 'sol' });
    if (!acc.permitido) return json({ error: acc.motivo }, acc.status);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'falta_anthropic_api_key' }, 500);

    // Real: UNA sola llamada a la Messages API (sin tools; el contexto va inline).
    const t0 = Date.now();
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
    if (!r.ok) {
      await registrarUso(sb, {
        escuela_id: acc.escuelaId, perfil_id: user.id, funcion: 'sol-chat', modelo: MODELO,
        latencia_ms: Date.now() - t0, ok: false, error_codigo: `claude_${r.status}`,
      });
      throw new Error(`claude_${r.status}: ${await r.text()}`);
    }
    const data = await r.json();
    await registrarUso(sb, {
      escuela_id: acc.escuelaId, perfil_id: user.id, funcion: 'sol-chat', modelo: MODELO,
      usage: data.usage, latencia_ms: Date.now() - t0, ok: true,
    });
    // Sin markdown y en burbujas separadas (respuesta / "¿Te quedó claro?");
    // `texto` queda como fallback para fronts viejos.
    const burbujas = aBurbujas(extraerTexto(data));

    return json({ texto: burbujas.join('\n\n'), burbujas });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
