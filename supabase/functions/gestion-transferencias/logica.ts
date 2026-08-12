// Lógica PURA de gestion-transferencias (alumno golondrina, WP-A). Sin imports:
// Node la testea directo (tests/unit/transferencias.test.mjs) con el mismo
// texto que corre en Deno. Acá vive todo lo que se puede decidir sin I/O:
// vínculos válidos, expiración, armado del link y el hash del token.

export const VINCULOS = ['madre', 'padre', 'tutor', 'otro'] as const;
export type Vinculo = (typeof VINCULOS)[number];

export function vinculoValido(v: unknown): v is Vinculo {
  return typeof v === 'string' && (VINCULOS as readonly string[]).includes(v);
}

// Días de vida del link. El valor real vive en plataforma_config
// ('transferencia_dias_expiracion', jsonb) — esto es solo el fallback y el
// parseo defensivo del jsonb (que puede llegar como number o string).
export const DIAS_EXPIRACION_DEFAULT = 14;

export function diasExpiracion(valor: unknown, fallback = DIAS_EXPIRACION_DEFAULT): number {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function calcularExpiracion(ahora: Date, dias: number): string {
  return new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

// El token viaja en el FRAGMENT (#...) del link: el fragment no sale del
// browser, así que no queda en logs de server ni en referers. En DB queda
// SOLO el hash (sha256 hex) — mismo principio que aula_secreto/alumno_cred.
export function armarLinkTransferencia(id: string, token: string): string {
  return `/transferir/${id}#${token}`;
}

// Hex de bytes ya sorteados (el sorteo con crypto.getRandomValues queda en el
// caller: así esto es determinístico y testeable). 16 bytes = 128 bits.
export function tokenHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 hex vía WebCrypto (existe igual en Deno y en Node 18+). Duplicado a
// propósito en transferencia-confirmar/logica.ts: _shared está congelado en
// esta fase y las fns no se importan entre sí (cada una se deploya sola).
export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return tokenHex(new Uint8Array(digest));
}

// Los raise exception de las RPCs llegan como 'codigo: detalle humano' (o el
// código pelado). El front mapea el código a copy; acá solo se recorta.
export function codigoDeError(mensaje: unknown): string {
  return String(mensaje ?? '').split(':')[0].trim() || 'error_desconocido';
}
