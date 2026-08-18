// Lógica PURA de `/nueva-contrasena`: la pantalla que abre el link de
// invitación de una maestra (y de un admin de plataforma o de institución).
// Sin DOM y sin red — la testea Node directo (tests/unit/recuperacion.test.mjs).
//
// El link que genera `generateLink({type:'recovery'})` NO trae la contraseña:
// Supabase valida el token y redirige a `redirect_to` con la sesión en el
// FRAGMENT (#access_token=…&refresh_token=…&type=recovery). El fragment no
// viaja al server, así que todo esto corre en el navegador.

export const RUTA_NUEVA_CONTRASENA = '/nueva-contrasena';

// A dónde va la persona después de elegir su contraseña. El destino viaja en
// `?d=` porque quien emite el link sabe a quién invita; el front no adivina
// (evita pedirle el rol a la DB justo cuando la sesión recién nace).
export type Destino = 'docente' | 'admin' | 'institucion';

export const RUTA_DESTINO: Record<Destino, string> = {
  docente: '/docente',
  admin: '/admin',
  institucion: '/institucion',
};

export function destinoDe(v: unknown): Destino {
  return typeof v === 'string' && v in RUTA_DESTINO ? (v as Destino) : 'docente';
}

// Siempre una ruta interna: `d` llega de la URL y nunca puede redirigir afuera.
export function rutaDestino(v: unknown): string {
  return RUTA_DESTINO[destinoDe(v)];
}

// ── El fragment ─────────────────────────────────────────────────────────────

function params(hash: unknown): URLSearchParams | null {
  if (typeof hash !== 'string') return null;
  const limpio = hash.trim().replace(/^#/, '').trim();
  return limpio.length > 0 ? new URLSearchParams(limpio) : null;
}

export type TokensRecuperacion = { access_token: string; refresh_token: string };

// Los dos tokens que necesita `supabase.auth.setSession()`. Si falta cualquiera
// de los dos no hay sesión posible: devolver null y mostrar el error.
export function tokensDelFragmento(hash: unknown): TokensRecuperacion | null {
  const p = params(hash);
  if (!p) return null;
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh };
}

// Un link vencido o ya usado NO da 400: Supabase redirige igual, con el error
// en el fragment. Sin esto la maestra ve un form vacío y no entiende nada.
const ERRORES: Record<string, string> = {
  otp_expired: 'Este link ya venció o ya se usó. Pedile al equipo de EDUTIA uno nuevo.',
  access_denied: 'Este link ya no sirve. Pedile al equipo de EDUTIA uno nuevo.',
};

const ERROR_GENERICO = 'No pudimos abrir este link. Pedile al equipo de EDUTIA uno nuevo.';

export function errorDelFragmento(hash: unknown): string | null {
  const p = params(hash);
  if (!p) return null;
  const code = p.get('error_code');
  const error = p.get('error');
  if (!code && !error) return null;
  return (code && ERRORES[code]) || (error && ERRORES[error]) || ERROR_GENERICO;
}

// ── El form ─────────────────────────────────────────────────────────────────

// Es el `password_min_length` del proyecto en Supabase: pedir menos acá haría
// que Auth rechace la contraseña recién al guardar.
export const LARGO_MINIMO_PASSWORD = 6;

export function validarNuevaPassword(a: unknown, b: unknown):
  | { ok: true; password: string }
  | { ok: false; error: string } {
  const p1 = typeof a === 'string' ? a : '';
  const p2 = typeof b === 'string' ? b : '';
  // Sin trim: si eligió una contraseña con espacios, es su contraseña.
  if (p1.length < LARGO_MINIMO_PASSWORD) {
    return { ok: false, error: `La contraseña tiene que tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.` };
  }
  if (p1 !== p2) return { ok: false, error: 'Las dos contraseñas tienen que coincidir.' };
  return { ok: true, password: p1 };
}
