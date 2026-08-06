// Guard compartido de las Edge Functions admin-* (Dashboard admin v3).
// Patrón de gestion-alumnos: cliente anon con el Authorization del caller →
// getUser() → cliente service_role → fila en plataforma_admin (activo).
// El admin NO tiene fila en perfil (ADR-009): la identidad es solo esta tabla.
// Devuelve el contexto o un Response de error listo para retornar.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json } from './cors.ts';

export type AdminCtx = {
  sb: SupabaseClient;
  user: { id: string; email?: string };
  admin: { nivel: 'super' | 'operativo'; nombre: string };
};

export async function verificarAdmin(
  req: Request,
  opts: { nivel?: 'super' } = {},
): Promise<AdminCtx | Response> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'no_autenticado' }, 401);

  const sb = createClient(url, srKey);
  const { data } = await sb
    .from('plataforma_admin')
    .select('nivel, nombre, activo')
    .eq('perfil_id', user.id)
    .maybeSingle();
  const fila = data as { nivel?: string; nombre?: string; activo?: boolean } | null;
  if (!fila || !fila.activo) return json({ error: 'no_admin' }, 403);
  if (opts.nivel === 'super' && fila.nivel !== 'super') return json({ error: 'requiere_super' }, 403);

  return {
    sb,
    user: { id: user.id, email: user.email ?? undefined },
    admin: { nivel: fila.nivel as 'super' | 'operativo', nombre: fila.nombre ?? '' },
  };
}
