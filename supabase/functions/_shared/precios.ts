// Precios de la API de Claude en USD por MILLÓN de tokens (WP6 — Costos).
// ÚNICO archivo de precios de toda la plataforma: si Anthropic los cambia,
// actualizar acá (y solo acá) — nadie más hardcodea un precio.
// Módulo PURO sin imports: lo comparten las Edge Functions (Deno) y los tests
// unitarios (Node con type-stripping).
export const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  'claude-haiku-4-5': { entrada: 1, salida: 5 },
  'claude-sonnet-4-6': { entrada: 3, salida: 15 },
};

// Costo en USD de una llamada. Modelo desconocido (o null/'' desde uso.ts) →
// 0: preferimos registrar la llamada sin costo antes que inventar un precio.
// Redondeado a 6 decimales (la precisión de uso_api.costo_usd numeric(12,6)).
export function calcularCostoUsd(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const p = PRECIOS[modelo];
  if (!p) return 0;
  const ent = Number.isFinite(tokensEntrada) && tokensEntrada > 0 ? tokensEntrada : 0;
  const sal = Number.isFinite(tokensSalida) && tokensSalida > 0 ? tokensSalida : 0;
  return Math.round(((ent * p.entrada + sal * p.salida) / 1_000_000) * 1e6) / 1e6;
}
