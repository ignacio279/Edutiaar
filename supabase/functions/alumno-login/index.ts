// Login del alumno mediado por servidor:
//   verifica secreto de aula + PIN + lockout (todo en el RPC), y SOLO si todo ok
//   hace el token grant con credenciales opacas (que el browser nunca ve) y
//   devuelve la sesión para que el front haga setSession.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { codigo, secreto, perfilId, pin } = await req.json();
    if (!codigo || !secreto || !perfilId || !pin) return json({ error: 'datos_faltantes' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data, error } = await sb.rpc('alumno_login', {
      p_codigo: codigo, p_secreto: secreto, p_perfil: perfilId, p_pin: pin,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.status !== 'ok') {
      const status = row?.status === 'bloqueado' ? 429 : 401;
      return json({ error: row?.status ?? 'error', dato: row?.dato ?? 0 }, status);
    }

    // token grant con las credenciales opacas (server-side)
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: row.auth_email, password: row.auth_password }),
    });
    const session = await r.json();
    if (!r.ok) return json({ error: 'auth_fallo' }, 500);
    return json({ session });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
