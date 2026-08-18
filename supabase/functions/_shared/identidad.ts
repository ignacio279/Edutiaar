// Espejo exacto: supabase/functions/_shared/identidad.ts ↔ web/lib/admin/identidad.ts
// — el test de paridad (tests/unit/identidad.test.mjs) los compara byte a byte
// y contra los checks de la migración 0033 (patrón provincias.ts).
//
// IDENTIDAD OFICIAL DEL ESTABLECIMIENTO. El CUE (Clave Única de
// Establecimiento) es el identificador federal de cada escuela argentina: sin
// él, ningún número de EDUTIA se puede cruzar con el Padrón Oficial, el
// Relevamiento Anual, SInIDE ni Aprender — el matching por nombre en
// ruralidad ("Escuela N° 45" en cada departamento) no es una opción.
//
// TODO ES OPCIONAL, a propósito: un colegio sin CUE sigue funcionando entero.
// La identidad se carga cuando la escuela la dicta, no antes.

export const CUE_LARGO = 9;
export const ANEXO_LARGO = 2;
export const ANEXO_SEDE = '00';
export const MATRICULA_MAX = 10000;
export const MATRICULA_ANIO_MIN = 2000;
export const MATRICULA_ANIO_MAX = 2100;

const CUE_RE = /^[0-9]{9}$/;
const ANEXO_RE = /^[0-9]{2}$/;

export type Resultado = { ok: true } | { ok: false; error: string };

// Un campo "no vino" (undefined) o "se limpia" (null / string vacío) nunca es
// un error: la identidad es opcional.
const ausente = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// El CUE llega de un papel del ministerio, con guiones o espacios. Saca todo lo
// que no sea dígito; NO valida (eso es esCueValido). Ausente → null.
export function normalizarCue(c: unknown): string | null {
  if (ausente(c)) return null;
  return String(c).replace(/[^0-9]/g, '');
}

export function esCueValido(c: unknown): boolean {
  return typeof c === 'string' && CUE_RE.test(c);
}

export function esAnexoValido(a: unknown): boolean {
  return typeof a === 'string' && ANEXO_RE.test(a);
}

// Acepta número o string numérico (el input del front manda texto), pero exige
// entero: medio chico no existe.
function enteroEnRango(v: unknown, min: number, max: number): boolean {
  if (typeof v !== 'number' && typeof v !== 'string') return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max;
}

export function esMatriculaValida(m: unknown): boolean {
  return enteroEnRango(m, 1, MATRICULA_MAX);
}

export function esMatriculaAnioValida(a: unknown): boolean {
  return enteroEnRango(a, MATRICULA_ANIO_MIN, MATRICULA_ANIO_MAX);
}

export type IdentidadEntrada = {
  cue?: unknown; cue_anexo?: unknown; departamento?: unknown;
  localidad?: unknown; matricula_declarada?: unknown; matricula_anio?: unknown;
};

// Valida SOLO lo que vino (patrón armarPatchEditar de admin-colegios): un body
// sin ningún campo de identidad es legal y no toca nada.
export function validarIdentidad(d: IdentidadEntrada): Resultado {
  const cue = normalizarCue(d.cue);
  if (cue !== null && cue !== '' && !esCueValido(cue)) return { ok: false, error: 'cue_invalido' };
  if (cue === '') return { ok: false, error: 'cue_invalido' };

  if (!ausente(d.cue_anexo)) {
    if (!esAnexoValido(typeof d.cue_anexo === 'string' ? d.cue_anexo.trim() : d.cue_anexo)) {
      return { ok: false, error: 'cue_anexo_invalido' };
    }
    // Un anexo sin CUE no identifica nada. Vale si el CUE viene en el mismo
    // patch o si el patch no toca el CUE (ya está en la fila) — pero no si el
    // patch lo está limpiando.
    if (d.cue !== undefined && cue === null) return { ok: false, error: 'anexo_sin_cue' };
    if (d.cue === undefined) return { ok: false, error: 'anexo_sin_cue' };
  }

  if (!ausente(d.departamento) && typeof d.departamento !== 'string') {
    return { ok: false, error: 'departamento_invalido' };
  }
  if (!ausente(d.localidad) && typeof d.localidad !== 'string') {
    return { ok: false, error: 'localidad_invalida' };
  }
  if (!ausente(d.matricula_declarada) && !esMatriculaValida(d.matricula_declarada)) {
    return { ok: false, error: 'matricula_invalida' };
  }
  if (!ausente(d.matricula_anio) && !esMatriculaAnioValida(d.matricula_anio)) {
    return { ok: false, error: 'matricula_anio_invalido' };
  }
  return { ok: true };
}

// Patch de UPDATE con lo ya validado: el CUE se guarda normalizado, la
// matrícula como número, y lo vacío limpia la columna.
export function armarPatchIdentidad(d: IdentidadEntrada): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (d.cue !== undefined) {
    const cue = normalizarCue(d.cue);
    patch.cue = cue;
    // Limpiar el CUE se lleva el anexo puesto: sin CUE, un anexo es basura.
    if (cue === null) patch.cue_anexo = null;
  }
  if (d.cue_anexo !== undefined && patch.cue_anexo === undefined) {
    patch.cue_anexo = ausente(d.cue_anexo) ? null : String(d.cue_anexo).trim();
  }
  if (d.departamento !== undefined) {
    patch.departamento = ausente(d.departamento) ? null : String(d.departamento).trim();
  }
  if (d.localidad !== undefined) {
    patch.localidad = ausente(d.localidad) ? null : String(d.localidad).trim();
  }
  if (d.matricula_declarada !== undefined) {
    patch.matricula_declarada = ausente(d.matricula_declarada) ? null : Number(d.matricula_declarada);
  }
  if (d.matricula_anio !== undefined) {
    patch.matricula_anio = ausente(d.matricula_anio) ? null : Number(d.matricula_anio);
  }
  return patch;
}

// La clave con la que el Estado nombra al establecimiento. Anexo ausente y
// "00" son el MISMO asiento (la sede) — igual que el índice único de 0033.
export function claveEstablecimiento(cue: unknown, anexo: unknown): string | null {
  if (!esCueValido(cue)) return null;
  return `${cue as string}-${esAnexoValido(anexo) ? (anexo as string) : ANEXO_SEDE}`;
}

// Copy del panel: que falte el CUE es normal, no un error.
export function copyCue(cue: unknown, anexo: unknown): string {
  const clave = claveEstablecimiento(cue, anexo);
  return clave ? `CUE ${clave}` : 'Sin CUE cargado';
}
