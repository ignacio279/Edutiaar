// Validadores PUROS de admin-colegios (alta, edición y estados de colegios
// desde el panel admin — Dashboard admin v3, WP1). Sin Deno, sin DOM: se
// testean desde Node (tests/unit/admin-colegios.test.mjs). La Edge Function
// (index.ts) los importa y es la FUENTE DE VERDAD; la UI solo da feedback.
// Errores como códigos snake_case ({error:'codigo'}): el front los mapea a copy.
import { esProvinciaValida } from '../_shared/provincias.ts';

export const TIPOS_COLEGIO = ['rural', 'unidocente', 'plurigrado'] as const;
export const ESTADOS_COLEGIO = ['trial', 'activo', 'suspendido', 'archivado'] as const;

export type TipoColegio = (typeof TIPOS_COLEGIO)[number];
export type EstadoColegio = (typeof ESTADOS_COLEGIO)[number];
export type Resultado = { ok: true } | { ok: false; error: string };

// Flags default de escuela_feature — copia LITERAL de features_default() en la
// migración 0018 (equivale al plan 'docente', la conducta actual de la app).
// Si cambia el SQL, cambia acá: hay un unit test que congela la forma.
export const FEATURES_DEFAULT = {
  sol: true,
  luna: { activa: true, alertas: true, boletines: true, chat: true },
  terra: false,
} as const;

export const TRIAL_DIAS = 30;

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

export function tipoValido(t: unknown): t is TipoColegio {
  return typeof t === 'string' && (TIPOS_COLEGIO as readonly string[]).includes(t);
}

export function estadoValido(e: unknown): e is EstadoColegio {
  return typeof e === 'string' && (ESTADOS_COLEGIO as readonly string[]).includes(e);
}

// Provincia OPCIONAL (eje del observatorio): undefined/null son legales (sin
// asignar / limpiar); un string tiene que estar EXACTO en la lista espejada
// (_shared/provincias.ts — la UI usa un select, nunca tipea).
const provinciaOk = (p: unknown): boolean => p === undefined || p === null || esProvinciaValida(p);

export function validarCrear(d: { nombre?: unknown; zona?: unknown; tipo?: unknown; provincia?: unknown }): Resultado {
  if (!noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (!tipoValido(d.tipo)) return { ok: false, error: 'tipo_invalido' };
  if (d.zona !== undefined && d.zona !== null && typeof d.zona !== 'string') {
    return { ok: false, error: 'zona_invalida' };
  }
  if (!provinciaOk(d.provincia)) return { ok: false, error: 'provincia_invalida' };
  return { ok: true };
}

// Edición parcial: solo valida lo que vino; un patch vacío es legal (no-op).
export function validarEditar(d: { nombre?: unknown; zona?: unknown; tipo?: unknown; provincia?: unknown }): Resultado {
  if (d.nombre !== undefined && !noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (d.tipo !== undefined && !tipoValido(d.tipo)) return { ok: false, error: 'tipo_invalido' };
  if (d.zona !== undefined && d.zona !== null && typeof d.zona !== 'string') {
    return { ok: false, error: 'zona_invalida' };
  }
  if (!provinciaOk(d.provincia)) return { ok: false, error: 'provincia_invalida' };
  return { ok: true };
}

// Arma el patch de UPDATE a partir del body ya validado (trim; zona vacía →
// null; provincia null explícito limpia la columna).
export function armarPatchEditar(d: { nombre?: unknown; zona?: unknown; tipo?: unknown; provincia?: unknown }): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (d.nombre !== undefined) patch.nombre = String(d.nombre).trim();
  if (d.zona !== undefined) patch.zona = noVacio(d.zona) ? d.zona.trim() : null;
  if (d.tipo !== undefined) patch.tipo = d.tipo;
  if (d.provincia !== undefined) patch.provincia = d.provincia ?? null;
  return patch;
}

// Matriz de transiciones de estado. Reglas: un colegio nunca "vuelve a prueba"
// (el trial es una sola vez, alargarlo es tarea de WP3-Accesos); desde
// archivado solo se restaura a activo; quedarse en el mismo estado no es una
// transición. `archivado` además exige nivel super (requiereSuper).
const TRANSICIONES: Record<EstadoColegio, readonly EstadoColegio[]> = {
  trial: ['activo', 'suspendido', 'archivado'],
  activo: ['suspendido', 'archivado'],
  suspendido: ['activo', 'archivado'],
  archivado: ['activo'],
};

export function puedeTransicionar(de: unknown, a: unknown): boolean {
  if (!estadoValido(de) || !estadoValido(a)) return false;
  return TRANSICIONES[de].includes(a);
}

export function requiereSuper(estado: unknown): boolean {
  return estado === 'archivado';
}

// Fechas del trial en UTC (yyyy-mm-dd): arranca hoy, vence a los 30 días.
// Fecha inyectada → determinístico y testeable.
export function fechasTrial(hoy: Date): { trial_inicio: string; trial_fin: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fin = new Date(hoy.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000);
  return { trial_inicio: iso(hoy), trial_fin: iso(fin) };
}

// Filtros de `listar`: ignora lo inválido en vez de romper, y sanea la
// búsqueda para el ilike de PostgREST (%, _ son comodines; la coma y los
// paréntesis rompen el parseo de la query string).
export function normalizarFiltros(f?: { estado?: unknown; tipo?: unknown; busqueda?: unknown } | null): {
  estado?: EstadoColegio;
  tipo?: TipoColegio;
  busqueda?: string;
} {
  const out: { estado?: EstadoColegio; tipo?: TipoColegio; busqueda?: string } = {};
  if (f && estadoValido(f.estado)) out.estado = f.estado;
  if (f && tipoValido(f.tipo)) out.tipo = f.tipo;
  if (f && noVacio(f.busqueda)) {
    const limpia = f.busqueda.replace(/[%_,()]/g, ' ').trim();
    if (limpia) out.busqueda = limpia;
  }
  return out;
}
