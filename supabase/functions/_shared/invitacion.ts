// El link de invitación / reset de contraseña que copia el admin (no hay SMTP).
//
// `generateLink({type:'recovery'})` devuelve un `action_link` a
// `/auth/v1/verify`. Supabase valida el token y **redirige** a `redirect_to`
// con la sesión en el fragment (#access_token=…&type=recovery). Sin
// `redirectTo` explícito usa el Site URL — que en EDUTIA es la home, o sea el
// selector de rol: la maestra aterrizaba ahí, el fragment se tiraba y nunca
// podía elegir contraseña. Por eso todo generateLink del repo pasa por acá.
//
// La ruta está espejada en web/lib/recuperacion.ts, con test de paridad
// (tests/unit/recuperacion.test.mjs) — mismo criterio que provincias/planes.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const RUTA_NUEVA_CONTRASENA = '/nueva-contrasena';

// A qué panel entra después de elegir la contraseña. Lo sabe quien emite el
// link, así que viaja en la URL en vez de deducirse del rol.
export type DestinoInvitacion = 'docente' | 'admin' | 'institucion';

const ORIGEN_POR_DEFECTO = 'https://www.edutia.ar';

// `APP_URL` permite apuntar a un preview de Vercel sin tocar código; si no
// está, producción. Nunca puede quedar vacío: un redirect_to vacío vuelve a
// caer en el Site URL, que es el bug original.
export function origenApp(): string {
  const v = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get('APP_URL');
  const limpio = typeof v === 'string' ? v.trim() : '';
  return limpio.length > 0 ? limpio : ORIGEN_POR_DEFECTO;
}

export function linkRecuperacion(origen: string, destino: DestinoInvitacion): string {
  return `${origen.replace(/\/+$/, '')}${RUTA_NUEVA_CONTRASENA}?d=${destino}`;
}

// Devuelve el link listo para copiar, o null si Auth falló. Quien llama decide
// si eso es un warning (alta: queda la contraseña temporal) o un error (reset:
// no hay nada más que dar).
export async function generarLinkRecuperacion(
  sb: SupabaseClient,
  email: string,
  destino: DestinoInvitacion,
): Promise<string | null> {
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: linkRecuperacion(origenApp(), destino) },
  });
  if (error) return null;
  return data?.properties?.action_link ?? null;
}
