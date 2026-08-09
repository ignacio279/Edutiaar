// Usuarios de Auth paginados (email + last_sign_in_at). Reemplaza los
// listUsers({page:1}) inline: con >1000 auth users (los alumnos TAMBIÉN son
// auth users) los emails de maestras se caían de la página 1.
// `maxPaginas` (default 10 → 10.000 users) es un tope de seguridad para no
// colgar la Edge Function si Auth crece de más; se corta antes apenas una
// página viene corta.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const POR_PAGINA = 1000;

export async function listarUsuariosAuth(
  sb: SupabaseClient,
  opts: { maxPaginas?: number } = {},
): Promise<Map<string, { email: string | null; last_sign_in_at: string | null }>> {
  const maxPaginas = Math.max(1, opts.maxPaginas ?? 10);
  const porId = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
  for (let page = 1; page <= maxPaginas; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      porId.set(u.id, {
        email: u.email ?? null,
        last_sign_in_at: (u.last_sign_in_at as string | undefined) ?? null,
      });
    }
    if (users.length < POR_PAGINA) break; // página corta = no hay más
  }
  return porId;
}
