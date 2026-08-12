// Lógica PURA de licencias e instituciones (alumno golondrina, migraciones
// 0025/0026). Sin DOM ni imports: la testea Node directo
// (tests/unit/licencias.test.mjs). "Ahora" siempre por parámetro.

export const PLANES = ['basico', 'docente', 'completo', 'custom'] as const;
export const ESTADOS_LICENCIA = ['prueba', 'activa', 'vencida', 'suspendida'] as const;
export const TIPOS_INSTITUCION = ['provincia', 'fundacion', 'red', 'municipio'] as const;
export const ESTADOS_INSTITUCION = ['activa', 'suspendida', 'archivada'] as const;

export const PLAN_COPY: Record<string, string> = {
  basico: 'Básico',
  docente: 'Docente',
  completo: 'Completo',
  custom: 'A medida',
};

export const TIPO_INSTITUCION_COPY: Record<string, string> = {
  provincia: 'Provincia',
  fundacion: 'Fundación',
  red: 'Red de escuelas',
  municipio: 'Municipio',
};

// Estados de licencia con el mismo criterio de corte que acceso_calcular v2:
// suspendida bloquea, vencida deja en solo lectura (nunca se borra nada).
export const ESTADO_LICENCIA: Record<string, { copy: string; color: string; detalle: string }> = {
  prueba: { copy: 'En prueba', color: '#F4A93B', detalle: 'Período de prueba en curso.' },
  activa: { copy: 'Activa', color: '#7FB069', detalle: 'Todo habilitado.' },
  vencida: { copy: 'Vencida', color: '#BB4F3F', detalle: 'El colegio queda en solo lectura: ve todo, no genera nuevo.' },
  suspendida: { copy: 'Suspendida', color: '#9A8C7E', detalle: 'El colegio queda bloqueado.' },
};

export function copyEstadoLicencia(estado: string): { copy: string; color: string; detalle: string } {
  return ESTADO_LICENCIA[estado] ?? { copy: estado, color: '#9A8C7E', detalle: '' };
}

export const ESTADO_INSTITUCION: Record<string, { copy: string; color: string }> = {
  activa: { copy: 'Activa', color: '#7FB069' },
  suspendida: { copy: 'Suspendida', color: '#F4A93B' },
  archivada: { copy: 'Archivada', color: '#9A8C7E' },
};

// ── Cupos de un pool ────────────────────────────────────────────────────────
// `cupos` null = licencia directa de un colegio (no es pool): sin cupos.
export function cuposDe(licencia: { cupos?: number | null; usados?: number | null } | null | undefined): {
  esPool: boolean; cupos: number | null; usados: number; disponibles: number | null; porcentaje: number | null;
} {
  const cupos = typeof licencia?.cupos === 'number' && Number.isFinite(licencia.cupos) ? licencia.cupos : null;
  const usados = Math.max(0, Number(licencia?.usados) || 0);
  if (cupos === null) return { esPool: false, cupos: null, usados, disponibles: null, porcentaje: null };
  const disponibles = Math.max(0, cupos - usados);
  const porcentaje = cupos > 0 ? Math.min(100, Math.round((usados / cupos) * 100)) : 0;
  return { esPool: true, cupos, usados, disponibles, porcentaje };
}

export function copyCupos(licencia: { cupos?: number | null; usados?: number | null } | null | undefined): string {
  const c = cuposDe(licencia);
  if (!c.esPool) return 'Licencia de un solo colegio';
  return `${c.usados} de ${c.cupos} ${c.cupos === 1 ? 'cupo usado' : 'cupos usados'} · ${c.disponibles} ${c.disponibles === 1 ? 'libre' : 'libres'}`;
}

// ── Form de licencia: XOR colegio / institución ─────────────────────────────
// La DB tiene el check num_nonnulls = 1; acá se ataja antes con un mensaje
// humano, y se impide poner cupos en una licencia de un solo colegio.
export function validarFormLicencia(d: {
  escuela_id?: unknown; institucion_id?: unknown; plan?: unknown; cupos?: unknown;
}): { ok: true } | { ok: false; error: string } {
  const tieneEscuela = typeof d.escuela_id === 'string' && d.escuela_id.trim().length > 0;
  const tieneInstitucion = typeof d.institucion_id === 'string' && d.institucion_id.trim().length > 0;
  if (tieneEscuela === tieneInstitucion) {
    return { ok: false, error: 'Elegí un colegio O una institución, no las dos ni ninguna.' };
  }
  if (d.plan !== undefined && d.plan !== null && !(PLANES as readonly string[]).includes(String(d.plan))) {
    return { ok: false, error: 'Elegí un plan válido.' };
  }
  if (d.cupos !== undefined && d.cupos !== null && d.cupos !== '') {
    if (!tieneInstitucion) return { ok: false, error: 'Los cupos son solo para las licencias de una institución.' };
    const n = Number(d.cupos);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'Los cupos tienen que ser un número mayor a cero.' };
  }
  return { ok: true };
}

// ── Vencimiento ─────────────────────────────────────────────────────────────

const DIA_MS = 86400000;

export function diasHastaFin(fechaFin: string | null | undefined, ahora: Date): number | null {
  if (typeof fechaFin !== 'string' || fechaFin.length < 10) return null;
  const [y, m, d] = fechaFin.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const fin = Date.UTC(y, m - 1, d);
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return Math.round((fin - hoy) / DIA_MS);
}

export function copyVencimientoLicencia(fechaFin: string | null | undefined, ahora: Date): string {
  const d = diasHastaFin(fechaFin, ahora);
  if (d === null) return 'Sin fecha de vencimiento';
  if (d < 0) return `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`;
  if (d === 0) return 'Vence hoy';
  return `Vence en ${d} ${d === 1 ? 'día' : 'días'}`;
}

// ¿Hay que avisarle al operador? Misma ventana que las alertas (7 días).
export function porVencer(fechaFin: string | null | undefined, ahora: Date, dias = 7): boolean {
  const d = diasHastaFin(fechaFin, ahora);
  return d !== null && d <= dias;
}

// "Extender +30 días" del panel: un click, sin escribir fechas a mano.
// Si la licencia todavía no venció, los 30 días se SUMAN a lo que le quedaba
// (nadie pierde días por renovar temprano); si ya venció o no tenía fecha,
// arrancan desde hoy. Devuelve YYYY-MM-DD.
export function extenderTreintaDias(fechaFin: string | null | undefined, ahora: Date, dias = 30): string {
  const restantes = diasHastaFin(fechaFin, ahora);
  const desde = restantes !== null && restantes > 0 ? restantes : 0;
  const base = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return new Date(base + (desde + dias) * DIA_MS).toISOString().slice(0, 10);
}

export const ERRS_LICENCIAS: Record<string, string> = {
  sin_conexion: 'Parece que estás sin internet. Revisá la conexión y probá de nuevo.',
  sin_respuesta: 'No pudimos conectarnos con EDUTIA. Probá de nuevo en un ratito.',
  sin_cupos: 'Ese pool no tiene cupos libres. Ampliá los cupos o liberá uno.',
  colegio_ya_asignado: 'Ese colegio ya está consumiendo un cupo.',
  email_en_uso: 'Ya hay una cuenta con ese email.',
  fuera_de_tu_institucion: 'Eso no pertenece a tu institución.',
  no_admin_institucion: 'Tu cuenta no tiene acceso al panel de la institución.',
  institucion_suspendida: 'La institución está en pausa. Escribinos y lo resolvemos.',
  institucion_inexistente: 'No encontramos esa institución.',
  escuela_inexistente: 'No encontramos ese colegio.',
  licencia_inexistente: 'No encontramos esa licencia.',
  xor_invalido: 'Una licencia es de un colegio O de una institución, no de las dos.',
};

export const msgErrLicencias = (j: { error?: string } | null | undefined): string =>
  ERRS_LICENCIAS[j?.error ?? ''] || j?.error || 'No se pudo.';
