// Cliente de las Edge Functions admin-* (Dashboard admin v3).
// OJO: web/lib/edge.ts→callFn manda el ANON key como Bearer — inservible para
// funciones con guard de usuario. Acá el Bearer es el ACCESS TOKEN de la
// sesión del admin; el guard server-side (plataforma_admin) decide.
import { createClient } from '@/lib/supabase/client';
import { postFn } from '@/lib/edge';

export type RespAdmin<T> = { ok: boolean; status: number; data: T & { error?: string } };

export async function llamarAdmin<T = Record<string, unknown>>(
  fn: string,
  accion: string,
  payload: Record<string, unknown> = {},
): Promise<RespAdmin<T>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  // postFn no lanza: si no hay red o la función no está deployada, vuelve
  // `sin_conexion` y la página muestra un aviso en vez de romperse.
  return postFn<T>(fn, { accion, ...payload }, { token: session?.access_token ?? '' });
}

// Copys de los errores comunes del guard (cada página suma los suyos).
export const ERRS_ADMIN: Record<string, string> = {
  no_autenticado: 'Tu sesión venció. Entrá de nuevo.',
  no_admin: 'Tu cuenta no tiene acceso al panel de administración.',
  requiere_super: 'Esta acción es solo para el super-admin.',
  sin_conexion: 'No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.',
};
