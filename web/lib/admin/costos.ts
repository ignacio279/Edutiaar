// Helpers PUROS de la UI de Costos y salud (WP6 — Dashboard admin v3).
// Standalone a propósito (cero imports): formateos y semáforos que comparten
// /admin/costos y /admin/colegios/[id]/costos, testeables desde Node.
// El color real lo mapea cada página con el tema ADMIN; acá solo se decide
// la CLAVE semántica ('ok' | 'aviso' | 'rojo').

// ── Tipos de las respuestas de admin-costos (espejo de agregar.ts) ──────────
export type TotalCosto = {
  costo_usd: number;
  llamadas: number;
  tokens_entrada: number;
  tokens_salida: number;
  errores: number;
};
export type GrupoCosto = TotalCosto & { clave: string; nombre?: string };
export type SaludGlobal = {
  llamadas: number;
  tasa_error: number; // fracción 0..1
  p50: number;
  p95: number;
  errores_consecutivos: number;
};
export type SaludFn = SaludGlobal & { funcion: string };
export type SemanaCosto = { desde: string; hasta: string; costo_usd: number; llamadas: number };

// Rangos que ofrece el selector (días). El backend acota igual (max 90).
export const RANGOS = [7, 30, 90] as const;

// Copy del estado vacío: hasta que la Fase final cablee la instrumentación,
// uso_api está vacía y todo da cero. Cálido, sin drama.
export const SIN_DATOS_COPY =
  'Sin datos de uso todavía. Apenas las funciones empiecen a registrar sus llamadas a la API, acá vas a ver los costos y la salud de cada una.';

// ── Formateos ───────────────────────────────────────────────────────────────

// USD con 2 a 4 decimales según magnitud: montos chicos (menos de $1, lo
// normal por llamada) muestran 4 para no quedar en "$ 0.00".
export function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const dec = v !== 0 && Math.abs(v) < 1 ? 4 : 2;
  return `$ ${v.toFixed(dec)}`;
}

// Tokens compactos: 850 → "850", 1.234 → "1.2k", 3.400.000 → "3.4M".
export function fmtTokens(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  if (v < 1000) return String(Math.round(v));
  if (v < 1e6) return `${Math.round(v / 100) / 10}k`;
  return `${Math.round(v / 1e5) / 10}M`;
}

// Latencia legible: null/0 → "—", 850 → "850 ms", 2340 → "2.3 s".
export function fmtMs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${Math.round(n / 100) / 10} s`;
}

// Porcentaje de a sobre b con 1 decimal (número, sin el "%"). b=0 → 0.
export function porcentaje(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return 0;
  return Math.round((a / b) * 1000) / 10;
}

// ── Semáforo de salud ───────────────────────────────────────────────────────

// tasaError es FRACCIÓN (0.015 = 1.5%): verde (<2%), naranja (<10%), rojo.
export function colorSalud(tasaError: number): 'ok' | 'aviso' | 'rojo' {
  const v = Number.isFinite(tasaError) ? tasaError : 0;
  if (v < 0.02) return 'ok';
  if (v < 0.1) return 'aviso';
  return 'rojo';
}
