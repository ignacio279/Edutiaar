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

// Los copys viven en `errores.ts` (módulo puro, testeable sin bundler) y se
// re-exportan acá para que las pantallas los sigan importando de un solo lugar.
export { ERRS_ADMIN, ERRS_RED_ADMIN } from './errores';
