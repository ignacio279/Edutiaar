// Lógica PURA del enforcement de acceso (Dashboard admin v3, WP3 — Accesos y límites).
// CERO imports de Deno/supabase: Node la corre tal cual (tests/unit/acceso-logica.test.mjs).
// El veredicto de ESTADO (activo/solo_lectura/bloqueado + motivo) viene YA resuelto
// por la RPC acceso_de/acceso_calcular (migración 0018 — única fuente de verdad);
// acá se decide qué hacer con él: corte suave del trial, toggles de features y
// topes mensuales de IA. La cara I/O vive en _shared/acceso.ts (verificarAcceso).

// Topes mensuales default por colegio (escuela.limites null o clave ausente/null).
// Elegidos contra los topes diarios ya vigentes (Regla 4), con margen para un
// colegio unidocente/plurigrado de ~30 chicos:
// - sol_mes 2000: cubre las llamadas SOL del mes (generación de pool ~240
//   ejercicios/día son ~20 llamadas, + dividir-nodos y evaluar-sesion por sesión).
// - boletines_mes 100: ~3 boletines por alumno por mes (regeneraciones incluidas);
//   el tope diario de LUNA ya es 20 por docente.
// - chats_mes 500: ~10 días activos del tope diario de LUNA (50 chats/día).
export const LIMITES_DEFAULT = { sol_mes: 2000, boletines_mes: 100, chats_mes: 500 } as const;

export type Feature = 'sol' | 'luna.alertas' | 'luna.boletines' | 'luna.chat';
export type ClaveTope = keyof typeof LIMITES_DEFAULT; // 'sol_mes' | 'boletines_mes' | 'chats_mes'

export type Limites = Partial<Record<ClaveTope, number | null>> | null;

export type Acceso = {
  estado: 'activo' | 'solo_lectura' | 'bloqueado';
  motivo: string | null; // 'colegio_suspendido' | 'cuenta_suspendida' | 'sin_perfil' | 'sin_escuela' | 'trial_vencido' | null
  // deno-lint-ignore no-explicit-any
  features: any; // jsonb de acceso_de: {sol, luna:{activa,alertas,boletines,chat}, terra}
};

export type Veredicto = { permitido: boolean; motivo: string | null; status: number };

// feature → clave del jsonb escuela.limites (y de LIMITES_DEFAULT).
// luna.alertas NO tiene tope: las alertas se calculan localmente, no gastan IA.
export function claveTope(feature?: string): ClaveTope | null {
  if (feature === 'sol') return 'sol_mes';
  if (feature === 'luna.boletines') return 'boletines_mes';
  if (feature === 'luna.chat') return 'chats_mes';
  return null;
}

// feature → valores de `uso_api.funcion` que cuentan para su tope mensual.
// El conteo del mes se hace con `.in('funcion', FUNCIONES_POR_FEATURE[feature])`.
export const FUNCIONES_POR_FEATURE: Record<Feature, readonly string[]> = {
  sol: ['sol', 'sol-chat', 'generador-ejercicios', 'dividir-nodos', 'evaluar-sesion'],
  'luna.alertas': [], // no gasta IA → nada que contar
  'luna.boletines': ['luna-boletin'],
  'luna.chat': ['luna-chat'],
} as const;

// ¿La feature está prendida en los flags del colegio? Resuelve la jerarquía de
// LUNA: `luna.activa` apaga TODAS las sub-features aunque el sub-flag diga true.
// Una feature desconocida se considera apagada (fail-closed).
// deno-lint-ignore no-explicit-any
export function featureActiva(features: any, feature?: string): boolean {
  if (!feature) return true; // la acción no cuelga de ningún toggle
  if (feature === 'sol') return features?.sol === true;
  if (feature === 'terra') return features?.terra === true;
  if (feature.startsWith('luna.')) {
    const luna = features?.luna;
    if (!luna || luna.activa !== true) return false;
    return luna[feature.slice('luna.'.length)] === true;
  }
  // 'luna' pelado = la sección entera (lo usa el gate del front para decidir si
  // el ítem del menú aparece); acá se define para que front y server no
  // diverjan (tests/unit/acceso-front.test.mjs compara las dos implementaciones).
  if (feature === 'luna') return features?.luna?.activa === true;
  return false;
}

// Topes efectivos del colegio: custom válido pisa el default; clave ausente o
// null = volver al default (null NO significa "sin tope").
export function limitesEfectivos(limites: Limites): Record<ClaveTope, number> {
  const out = { ...LIMITES_DEFAULT } as Record<ClaveTope, number>;
  for (const clave of Object.keys(LIMITES_DEFAULT) as ClaveTope[]) {
    const v = limites?.[clave];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) out[clave] = v;
  }
  return out;
}

// EL veredicto. Orden de prioridad:
// 1. bloqueado → 403 con el motivo del acceso (colegio_suspendido | cuenta_suspendida
//    | sin_perfil | sin_escuela).
// 2. solo_lectura + genera → 403 'trial_vencido' (corte SUAVE: las lecturas pasan).
// 3. feature apagada → 403 'feature_apagada' (apagada es apagada, aun en solo_lectura).
// 4. tope mensual: usoMes >= tope efectivo de esa feature → 429 'tope_excedido'
//    (solo si genera, la feature tiene tope y el caller trajo usoMes).
// 5. todo ok → { permitido: true, motivo: null, status: 200 }.
export function decidirAcceso(input: {
  acceso: Acceso;
  genera: boolean; // ¿la acción crea contenido / gasta IA?
  feature?: string; // 'sol' | 'luna.alertas' | 'luna.boletines' | 'luna.chat'
  usoMes?: number; // count de uso_api del mes calendario UTC para esa feature/colegio
  limites?: Limites; // escuela.limites (null/ausente = defaults)
}): Veredicto {
  const { acceso, genera, feature, usoMes, limites } = input;

  if (acceso.estado === 'bloqueado') {
    return { permitido: false, motivo: acceso.motivo ?? 'bloqueado', status: 403 };
  }
  if (acceso.estado === 'solo_lectura' && genera) {
    return { permitido: false, motivo: 'trial_vencido', status: 403 };
  }
  if (feature && !featureActiva(acceso.features, feature)) {
    return { permitido: false, motivo: 'feature_apagada', status: 403 };
  }
  const clave = claveTope(feature);
  if (genera && clave && usoMes !== undefined) {
    const tope = limitesEfectivos(limites ?? null)[clave];
    if (usoMes >= tope) return { permitido: false, motivo: 'tope_excedido', status: 429 };
  }
  return { permitido: true, motivo: null, status: 200 };
}

// ── Fechas puras (UTC, formato YYYY-MM-DD) ──────────────────────────────────

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function fechaValida(f: unknown): f is string {
  return typeof f === 'string' && RE_FECHA.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
}

// set_trial: ambas fechas bien formadas y fin ESTRICTAMENTE posterior al inicio.
export function validarFechasTrial(inicio: unknown, fin: unknown): { ok: boolean; error?: string } {
  if (!fechaValida(inicio) || !fechaValida(fin)) return { ok: false, error: 'fechas_invalidas' };
  if (!(fin > inicio)) return { ok: false, error: 'fechas_invalidas' }; // ISO compara bien como string
  return { ok: true };
}

export function hoyISO(ahora: Date = new Date()): string {
  return ahora.toISOString().slice(0, 10);
}

// extender_trial: corre el fin `dias` días desde max(hoy, trial_fin actual).
// Vencido o sin trial → hoy + dias; vigente → trial_fin + dias.
export function extenderTrialDesde(trialFinActual: string | null, dias: number, hoy: string): string {
  const base = trialFinActual && trialFinActual > hoy ? trialFinActual : hoy;
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasValidos(dias: unknown): dias is number {
  return typeof dias === 'number' && Number.isInteger(dias) && dias > 0 && dias <= 3650;
}

// set_limites: objeto con SOLO claves conocidas; cada valor entero positivo o
// null (null = volver al default de esa clave). `null` entero = borrar el custom.
export function validarLimites(limites: unknown): { ok: true; limites: Limites } | { ok: false; error: string } {
  if (limites === null || limites === undefined) return { ok: true, limites: null };
  if (typeof limites !== 'object' || Array.isArray(limites)) return { ok: false, error: 'limites_invalidos' };
  const claves = Object.keys(LIMITES_DEFAULT);
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(limites as Record<string, unknown>)) {
    if (!claves.includes(k)) return { ok: false, error: 'limites_invalidos' };
    if (v === null) { out[k] = null; continue; }
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) return { ok: false, error: 'limites_invalidos' };
    out[k] = v;
  }
  return { ok: true, limites: out as Limites };
}

// Primer instante del mes calendario UTC actual (para contar uso_api del mes).
export function inicioMesUTC(ahora: Date = new Date()): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
}
