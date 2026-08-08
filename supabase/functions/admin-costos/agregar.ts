// Agregación pura del uso de la API (admin-costos, WP6 — Dashboard admin v3).
// Módulo hermano de index.ts SIN imports de Deno: testeable desde Node
// (patrón gestion-alumnos/validar.ts). index.ts trae las filas crudas del
// rango y acá se agrupan/resumen en TS puro (MVP: agregados on-demand, D6).

export type FilaUso = {
  escuela_id?: string | null;
  funcion: string;
  costo_usd: number;
  ok: boolean;
  latencia_ms?: number | null;
  tokens_entrada: number;
  tokens_salida: number;
  created_at?: string;
};

export type TotalUso = {
  costo_usd: number;
  llamadas: number;
  tokens_entrada: number;
  tokens_salida: number;
  errores: number;
};

export type GrupoUso = TotalUso & { clave: string; nombre?: string };

export type SaludFuncion = {
  funcion: string;
  llamadas: number;
  tasa_error: number; // fracción 0..1
  p50: number; // ms
  p95: number; // ms
  errores_consecutivos: number;
};

export const RANGO_DEFAULT = 30;
export const RANGO_MAX = 90;
export const SIN_COLEGIO = 'sin_colegio'; // filas con escuela_id null (FK on delete set null)

// Rango en días acotado: default 30, máximo 90, mínimo 1. Cualquier cosa rara
// (string, NaN, negativo) cae al default.
export function rangoValido(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return RANGO_DEFAULT;
  return Math.min(RANGO_MAX, Math.max(1, Math.floor(n)));
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function totalizar(filas: FilaUso[]): TotalUso {
  const t: TotalUso = { costo_usd: 0, llamadas: 0, tokens_entrada: 0, tokens_salida: 0, errores: 0 };
  for (const f of filas) {
    t.costo_usd += f.costo_usd || 0;
    t.llamadas += 1;
    t.tokens_entrada += f.tokens_entrada || 0;
    t.tokens_salida += f.tokens_salida || 0;
    if (!f.ok) t.errores += 1;
  }
  t.costo_usd = r6(t.costo_usd);
  return t;
}

// Agrupa por colegio (escuela_id; null → SIN_COLEGIO) o por función, ordenado
// por costo descendente. `nombre` lo resuelve index.ts solo para colegios.
export function agruparUso(filas: FilaUso[], por: 'escuela_id' | 'funcion'): GrupoUso[] {
  const grupos = new Map<string, GrupoUso>();
  for (const f of filas) {
    const clave = por === 'funcion' ? f.funcion : (f.escuela_id ?? SIN_COLEGIO);
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, costo_usd: 0, llamadas: 0, tokens_entrada: 0, tokens_salida: 0, errores: 0 };
      grupos.set(clave, g);
    }
    g.costo_usd += f.costo_usd || 0;
    g.llamadas += 1;
    g.tokens_entrada += f.tokens_entrada || 0;
    g.tokens_salida += f.tokens_salida || 0;
    if (!f.ok) g.errores += 1;
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, costo_usd: r6(g.costo_usd) }))
    .sort((a, b) => b.costo_usd - a.costo_usd);
}

// Percentil por rango más cercano (nearest-rank) sobre la lista sin ordenar.
// Determinístico y simple: vacío → 0, n=1 → ese valor.
export function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const idx = Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1));
  return orden[idx];
}

// Fracción de llamadas con ok=false (0..1, 4 decimales). Vacío → 0.
export function tasaError(filas: { ok: boolean }[]): number {
  if (!filas.length) return 0;
  const errores = filas.filter((f) => !f.ok).length;
  return Math.round((errores / filas.length) * 10000) / 10000;
}

// Racha ACTUAL de errores: sobre los ok ordenados del más nuevo al más viejo,
// cuenta ok=false desde el tope hasta el primer éxito. Un éxito reciente la
// corta a 0 aunque atrás haya errores.
export function erroresConsecutivos(oksDesc: boolean[]): number {
  let racha = 0;
  for (const ok of oksDesc) {
    if (ok) break;
    racha += 1;
  }
  return racha;
}

// Métricas de salud de un conjunto de filas ordenadas desc por created_at.
// Los percentiles se computan solo sobre latencias presentes (no null).
export function metricasSalud(filasDesc: FilaUso[]): Omit<SaludFuncion, 'funcion'> {
  const latencias = filasDesc
    .map((f) => f.latencia_ms)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return {
    llamadas: filasDesc.length,
    tasa_error: tasaError(filasDesc),
    p50: percentil(latencias, 50),
    p95: percentil(latencias, 95),
    errores_consecutivos: erroresConsecutivos(filasDesc.map((f) => f.ok)),
  };
}

// Salud por función, ordenada por cantidad de llamadas (las más usadas arriba).
// Las filas TIENEN que venir ordenadas desc por created_at (así las trae
// index.ts): el orden dentro de cada función es el que da sentido a la racha.
export function saludPorFuncion(filasDesc: FilaUso[]): SaludFuncion[] {
  const porFn = new Map<string, FilaUso[]>();
  for (const f of filasDesc) {
    const lista = porFn.get(f.funcion);
    if (lista) lista.push(f);
    else porFn.set(f.funcion, [f]);
  }
  return [...porFn.entries()]
    .map(([funcion, filas]) => ({ funcion, ...metricasSalud(filas) }))
    .sort((a, b) => b.llamadas - a.llamadas);
}

const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DIA_MS = 86400000;

export type SemanaUso = { desde: string; hasta: string; costo_usd: number; llamadas: number };

// Serie semanal simple para el detalle de un colegio: cubos de 7 días hacia
// atrás desde `ahoraMs`, del más viejo al más nuevo (la semana actual al
// final). Filas fuera del rango se ignoran.
export function serieSemanal(filas: FilaUso[], rangoDias: number, ahoraMs: number): SemanaUso[] {
  const semanas = Math.max(1, Math.ceil(rangoValido(rangoDias) / 7));
  const serie: SemanaUso[] = Array.from({ length: semanas }, (_, i) => {
    const k = semanas - 1 - i; // k=0 es la semana actual; i=0 la más vieja
    return {
      desde: isoDia(ahoraMs - ((k + 1) * 7 - 1) * DIA_MS),
      hasta: isoDia(ahoraMs - k * 7 * DIA_MS),
      costo_usd: 0,
      llamadas: 0,
    };
  });
  for (const f of filas) {
    if (!f.created_at) continue;
    const t = Date.parse(f.created_at);
    if (!Number.isFinite(t)) continue;
    const k = Math.max(0, Math.floor((ahoraMs - t) / (7 * DIA_MS)));
    if (k >= semanas) continue;
    const cubo = serie[semanas - 1 - k];
    cubo.costo_usd += f.costo_usd || 0;
    cubo.llamadas += 1;
  }
  for (const cubo of serie) cubo.costo_usd = r6(cubo.costo_usd);
  return serie;
}
