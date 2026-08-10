// Lógica PURA de transferencia-confirmar (alumno golondrina, WP-A). Sin
// imports: Node la testea directo (tests/unit/transferencias.test.mjs).
// El lockout es la pieza central: la fn es pública (verify_jwt=false) y el
// token opaco es toda la auth, así que acá se decide — con el reloj INYECTADO,
// nada de new Date() adentro — cuándo un intento fallido bloquea el link.
// Patrón intento_login (0003/0015): al 5° fallo, 15 minutos y contador a 0.

export const MAX_INTENTOS = 5;
export const BLOQUEO_MINUTOS = 15;

// Qué escribir en la fila tras un token errado: suma un fallo; si con este
// llega al tope, bloquea y resetea el contador (igual que intento_login).
export function registrarFallo(
  intentosPrevios: number,
  ahora: Date,
): { intentos_fallidos: number; bloqueada_hasta: string | null } {
  const intentos = (Number.isFinite(intentosPrevios) && intentosPrevios > 0 ? intentosPrevios : 0) + 1;
  if (intentos >= MAX_INTENTOS) {
    return {
      intentos_fallidos: 0,
      bloqueada_hasta: new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60 * 1000).toISOString(),
    };
  }
  return { intentos_fallidos: intentos, bloqueada_hasta: null };
}

export function estaBloqueada(bloqueadaHasta: string | null | undefined, ahora: Date): boolean {
  if (!bloqueadaHasta) return false;
  const t = new Date(bloqueadaHasta).getTime();
  return Number.isFinite(t) && t > ahora.getTime();
}

export function estaVencida(expiraAt: string, ahora: Date): boolean {
  const t = new Date(expiraAt).getTime();
  return !Number.isFinite(t) || t <= ahora.getTime();
}

// ── Duplicados mínimos de gestion-transferencias/logica.ts ──────────────────
// _shared está congelado en esta fase y cada Edge Function se deploya sola
// (no se importan entre sí), así que estos tres helpers chicos viven dos
// veces; el test unitario los cubre en ambos módulos.

export const VINCULOS = ['madre', 'padre', 'tutor', 'otro'] as const;

export function vinculoValido(v: unknown): boolean {
  return typeof v === 'string' && (VINCULOS as readonly string[]).includes(v);
}

export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function codigoDeError(mensaje: unknown): string {
  return String(mensaje ?? '').split(':')[0].trim() || 'error_desconocido';
}
