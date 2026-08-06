// Planes y flags de features por colegio (WP4, Dashboard admin v3).
// Módulo PURO sin imports: corre igual en Deno (Edge Function admin-features),
// en el front (Next) y en Node (tests). El shape canónico lo define
// features_default() en la migración 0018; el preset 'docente' ES ese default
// (la conducta actual de la app: SOL + LUNA completa, sin TERRA).
// Espejo exacto: supabase/functions/admin-features/planes.ts ↔ web/lib/admin/planes.ts — el test de paridad los compara.

export type Flags = {
  sol: boolean;
  luna: { activa: boolean; alertas: boolean; boletines: boolean; chat: boolean };
  terra: boolean;
};

export type Plan = 'basico' | 'docente' | 'completo';

// Presets = azúcar de UI que escribe los mismos flags (D5 de la spec).
// 'completo' prende terra aunque TERRA no esté construida: el toggle queda
// future-proof y la UI lo muestra como "próximamente".
export const PRESETS: Record<Plan, Flags> = {
  basico: { sol: true, luna: { activa: false, alertas: false, boletines: false, chat: false }, terra: false },
  docente: { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: true }, terra: false },
  completo: { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: true }, terra: true },
};

const aBool = (v: unknown, def: boolean): boolean => (v === undefined || v === null ? def : Boolean(v));

// Completa claves faltantes con el default (preset 'docente') y castea
// truthiness. Tolerante a shapes viejos o rotos: un valor plano en `luna`
// prende/apaga todo el bloque; cualquier cosa que no sea objeto cae al default.
export function normalizarFlags(x: unknown): Flags {
  const d = PRESETS.docente;
  const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const lunaRaw = o.luna;
  let luna: Flags['luna'];
  if (lunaRaw && typeof lunaRaw === 'object' && !Array.isArray(lunaRaw)) {
    const l = lunaRaw as Record<string, unknown>;
    luna = {
      activa: aBool(l.activa, d.luna.activa),
      alertas: aBool(l.alertas, d.luna.alertas),
      boletines: aBool(l.boletines, d.luna.boletines),
      chat: aBool(l.chat, d.luna.chat),
    };
  } else if (lunaRaw !== undefined && lunaRaw !== null) {
    const on = Boolean(lunaRaw); // shape viejo: luna como valor plano
    luna = { activa: on, alertas: on, boletines: on, chat: on };
  } else {
    luna = { ...d.luna };
  }
  return { sol: aBool(o.sol, d.sol), luna, terra: aBool(o.terra, d.terra) };
}

// Deep-equal contra los presets: si los flags calzan exacto con uno, ese es el
// plan; si no, 'custom'.
export function detectarPlan(flags: Flags): Plan | 'custom' {
  const f = normalizarFlags(flags);
  for (const plan of ['basico', 'docente', 'completo'] as const) {
    const p = PRESETS[plan];
    if (
      f.sol === p.sol && f.terra === p.terra &&
      f.luna.activa === p.luna.activa && f.luna.alertas === p.luna.alertas &&
      f.luna.boletines === p.luna.boletines && f.luna.chat === p.luna.chat
    ) return plan;
  }
  return 'custom';
}

export function validarFlags(x: unknown): { ok: true; flags: Flags } | { ok: false; error: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    return { ok: false, error: 'flags_invalidos' };
  }
  return { ok: true, flags: normalizarFlags(x) };
}
