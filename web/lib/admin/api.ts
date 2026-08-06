// Cliente de las Edge Functions admin-* (Dashboard admin v3).
// OJO: web/lib/edge.ts→callFn manda el ANON key como Bearer — inservible para
// funciones con guard de usuario. Acá el Bearer es el ACCESS TOKEN de la
// sesión del admin; el guard server-side (plataforma_admin) decide.
import { createClient } from '@/lib/supabase/client';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type RespAdmin<T> = { ok: boolean; status: number; data: T & { error?: string } };

export async function llamarAdmin<T = Record<string, unknown>>(
  fn: string,
  accion: string,
  payload: Record<string, unknown> = {},
): Promise<RespAdmin<T>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accion, ...payload }),
  });
  let data = {} as T & { error?: string };
  try {
    data = await r.json();
  } catch {
    /* cuerpo vacío */
  }
  return { ok: r.ok, status: r.status, data };
}

// Copys de los errores comunes del guard (cada página suma los suyos).
export const ERRS_ADMIN: Record<string, string> = {
  no_autenticado: 'Tu sesión venció. Entrá de nuevo.',
  no_admin: 'Tu cuenta no tiene acceso al panel de administración.',
  requiere_super: 'Esta acción es solo para el super-admin.',
};
