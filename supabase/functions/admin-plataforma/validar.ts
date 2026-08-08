// Validadores PUROS de admin-plataforma (gestión de administradores de la
// plataforma — Dashboard admin v3, WP9). Sin Deno, sin DOM: se testean desde
// Node (tests/unit/admin-impersonar.test.mjs). La Edge Function (index.ts) los
// importa y es la FUENTE DE VERDAD de la validación.

export type Resultado = { ok: true } | { ok: false; error: string };

export const NIVELES = ['super', 'operativo'] as const;
export type Nivel = (typeof NIVELES)[number];

// Regex simple y suficiente: algo@algo.algo, sin espacios. Supabase Auth
// valida de nuevo al crear el user.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(e: unknown): boolean {
  return typeof e === 'string' && EMAIL_RE.test(e.trim());
}

export function emailNormalizado(e: unknown): string {
  return String(e ?? '').trim().toLowerCase();
}

export function nombreValido(n: unknown): boolean {
  return typeof n === 'string' && n.trim().length > 0;
}

export function nivelValido(n: unknown): n is Nivel {
  return typeof n === 'string' && (NIVELES as readonly string[]).includes(n);
}

export function validarCrearAdmin(d: {
  email?: unknown; nombre?: unknown; nivel?: unknown;
}): Resultado {
  if (!emailValido(d.email)) return { ok: false, error: 'email_invalido' };
  if (!nombreValido(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (!nivelValido(d.nivel)) return { ok: false, error: 'nivel_invalido' };
  return { ok: true };
}

// ── Password temporal random ────────────────────────────────────────────────
// Secreto de corta vida (el canal primario es el link de recovery): se muestra
// UNA sola vez y nunca se persiste. 20 chars alfanuméricos sin ambiguos
// (0/O, 1/l/I) por si hay que dictarla. crypto global existe en Deno y Node.

const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PASSWORD_LARGO = 20;

// Fuente de azar inyectable para los tests: entero uniforme en [0, max).
export type Azar = (max: number) => number;

// Rejection sampling para no sesgar el módulo.
function azarCrypto(max: number): number {
  const limite = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limite);
  return n % max;
}

export function generarPasswordTemporal(azar: Azar = azarCrypto): string {
  return Array.from({ length: PASSWORD_LARGO }, () => ALFABETO[azar(ALFABETO.length)]).join('');
}
