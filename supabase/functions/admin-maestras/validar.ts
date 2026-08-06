// Validadores PUROS de admin-maestras (alta y ciclo de vida de cuentas de
// maestras desde el panel admin — Dashboard admin v3, WP2).
// Sin Deno, sin DOM: se testean desde Node (tests/unit/admin-maestras.test.mjs).
// La Edge Function (index.ts) los importa y es la FUENTE DE VERDAD de la
// validación; el front hace una versión liviana para feedback (Regla 5).

export type Resultado = { ok: true } | { ok: false; error: string };

// Regex simple y suficiente: algo@algo.algo, sin espacios. No intenta cubrir
// el RFC entero; Supabase Auth valida de nuevo al crear el user.
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

export function validarCrearMaestra(d: {
  email?: unknown; nombre?: unknown; escuela_id?: unknown;
}): Resultado {
  if (!emailValido(d.email)) return { ok: false, error: 'email_invalido' };
  if (!nombreValido(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (!nombreValido(d.escuela_id)) return { ok: false, error: 'escuela_requerida' };
  return { ok: true };
}

// ── Password temporal legible ───────────────────────────────────────────────
// Tres palabras + tres dígitos ("sol-ceibo-viento-482"): fácil de dictar por
// teléfono a una maestra rural. Es un secreto de corta vida (el canal primario
// es el link de recovery) y NUNCA se persiste: se muestra una sola vez.

export const PALABRAS = [
  'sol', 'luna', 'rio', 'monte', 'nube', 'flor', 'faro', 'lago',
  'puma', 'tero', 'ceibo', 'trigo', 'viento', 'brote', 'cielo', 'campo',
  'hornero', 'zorro', 'yerba', 'sauce', 'junco', 'cobre', 'duende', 'tilo',
] as const;

// Fuente de azar inyectable para los tests: entero uniforme en [0, max).
export type Azar = (max: number) => number;

// Default criptográfico (crypto global existe en Deno y en Node >= 19).
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
  const palabras = Array.from({ length: 3 }, () => PALABRAS[azar(PALABRAS.length)]);
  const digitos = Array.from({ length: 3 }, () => String(azar(10))).join('');
  return `${palabras.join('-')}-${digitos}`;
}
