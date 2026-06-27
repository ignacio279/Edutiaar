// Devuelve la lista de avatares de un aula SOLO si el secreto del aula es correcto.
// El listado no es público: sin secreto válido → 401.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { codigo, secreto } = await req.json();
    if (!codigo || !secreto) return json({ error: 'datos_faltantes' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data, error } = await sb.rpc('aula_students', { p_codigo: codigo, p_secreto: secreto });
    if (error) throw error;
    if (!data || data.length === 0) return json({ error: 'aula_invalida' }, 401);

    const alumnos = data.map((r: { perfil_id: string; nombre: string; avatar: string }) => ({
      id: r.perfil_id, nombre: r.nombre, avatar: r.avatar,
    }));
    return json({ alumnos });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
