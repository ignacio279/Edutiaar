// Login del panel admin: el operador tipea un usuario corto ("admin"), no un
// email. Supabase Auth solo entiende emails, así que acá se completa el
// dominio de la casa antes de mandar el signInWithPassword.
//
// Lógica pura y sin DOM (tests/unit/admin-login.test.mjs). No hay ninguna
// contraseña acá: lo único que se resuelve es la identidad del usuario.

/** Dominio que se le pone a un usuario tipeado sin `@`. */
export const DOMINIO_ADMIN = 'edutia.ar';

/**
 * Normaliza lo que la persona tipea en "Usuario" a un email de Auth.
 *
 * - `admin`             → `admin@edutia.ar`
 * - `Admin `            → `admin@edutia.ar`  (trim + minúsculas)
 * - `jorge@edutia.ar`   → `jorge@edutia.ar`  (un email pasa tal cual)
 * - `ana@otracosa.com`  → `ana@otracosa.com` (NO se fuerza el dominio propio)
 *
 * Devuelve '' si no queda nada usable: el llamador corta antes de pegarle a
 * Auth (un email vacío da el mismo error genérico, pero sin viaje de red).
 */
export function emailDeUsuario(entrada: string): string {
  const v = (entrada ?? '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v.startsWith('@') || v.endsWith('@') ? '' : v;
  return `${v}@${DOMINIO_ADMIN}`;
}
