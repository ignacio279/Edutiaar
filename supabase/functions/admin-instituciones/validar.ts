// Validadores PUROS de admin-instituciones (Alumno golondrina, WP-C):
// instituciones, sus admins y el ciclo de licencias desde el panel /admin.
// Sin Deno, sin DOM: se testean desde Node (tests/unit/licencias.test.mjs).
// La Edge Function (index.ts) los importa y es la FUENTE DE VERDAD; el front
// (web/lib/admin/licencias.ts) espeja lo justo para dar feedback — hay un
// test que compara ambas implementaciones del XOR (patrón acceso-front).
// Errores como códigos snake_case ({error:'codigo'}): el front los mapea a copy.

export type Resultado = { ok: true } | { ok: false; error: string };

// Espejo de los CHECK de las migraciones 0025/0026 — si cambia el SQL, cambia
// acá (golondrina-ddl.test.mjs congela el SQL; licencias.test.mjs, esto).
export const TIPOS_INSTITUCION = ['provincia', 'fundacion', 'red', 'municipio'] as const;
export const ESTADOS_INSTITUCION = ['activa', 'suspendida', 'archivada'] as const;
export const PLANES_LICENCIA = ['basico', 'docente', 'completo', 'custom'] as const;
export const ESTADOS_LICENCIA = ['prueba', 'activa', 'vencida', 'suspendida'] as const;

export type TipoInstitucion = (typeof TIPOS_INSTITUCION)[number];
export type EstadoInstitucion = (typeof ESTADOS_INSTITUCION)[number];
export type PlanLicencia = (typeof PLANES_LICENCIA)[number];
export type EstadoLicencia = (typeof ESTADOS_LICENCIA)[number];

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

export function tipoInstitucionValido(t: unknown): t is TipoInstitucion {
  return typeof t === 'string' && (TIPOS_INSTITUCION as readonly string[]).includes(t);
}

export function estadoInstitucionValido(e: unknown): e is EstadoInstitucion {
  return typeof e === 'string' && (ESTADOS_INSTITUCION as readonly string[]).includes(e);
}

export function planValido(p: unknown): p is PlanLicencia {
  return typeof p === 'string' && (PLANES_LICENCIA as readonly string[]).includes(p);
}

export function estadoLicenciaValido(e: unknown): e is EstadoLicencia {
  return typeof e === 'string' && (ESTADOS_LICENCIA as readonly string[]).includes(e);
}

// Contacto: jsonb chico y plano (nombre/email/teléfono como strings). No es
// dato de menores — es el referente institucional adulto. Nada de DNI.
export function contactoValido(c: unknown): boolean {
  if (c === undefined || c === null) return true;
  if (typeof c !== 'object' || Array.isArray(c)) return false;
  return Object.values(c as Record<string, unknown>).every(
    (v) => v === null || typeof v === 'string',
  );
}

export function validarCrearInstitucion(d: {
  nombre?: unknown; tipo?: unknown; contacto?: unknown;
}): Resultado {
  if (!noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (!tipoInstitucionValido(d.tipo)) return { ok: false, error: 'tipo_invalido' };
  if (!contactoValido(d.contacto)) return { ok: false, error: 'contacto_invalido' };
  return { ok: true };
}

// Edición parcial: solo valida lo que vino; un patch vacío es legal (no-op).
export function validarEditarInstitucion(d: {
  nombre?: unknown; tipo?: unknown; contacto?: unknown;
}): Resultado {
  if (d.nombre !== undefined && !noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (d.tipo !== undefined && !tipoInstitucionValido(d.tipo)) return { ok: false, error: 'tipo_invalido' };
  if (d.contacto !== undefined && !contactoValido(d.contacto)) return { ok: false, error: 'contacto_invalido' };
  return { ok: true };
}

// ── Licencias ───────────────────────────────────────────────────────────────

// Fecha yyyy-mm-dd real (el <input type=date> del front y current_date de la
// DB hablan este formato; Date.parse solo no alcanza — acepta basura).
export function fechaValida(f: unknown): f is string {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

export function cuposValidos(c: unknown): boolean {
  if (c === undefined || c === null) return true;
  return Number.isInteger(c) && (c as number) > 0;
}

// La regla XOR de la DB (num_nonnulls = 1), validada ANTES del insert para
// devolver un 400 legible en vez del texto del CHECK.
export function esXorValido(escuelaId: unknown, institucionId: unknown): boolean {
  return noVacio(escuelaId) !== noVacio(institucionId);
}

export function validarLicenciaCrear(d: {
  escuela_id?: unknown; institucion_id?: unknown; plan?: unknown; cupos?: unknown;
  fecha_inicio?: unknown; fecha_fin?: unknown; estado?: unknown;
}): Resultado {
  if (!esXorValido(d.escuela_id, d.institucion_id)) return { ok: false, error: 'xor_invalido' };
  if (!planValido(d.plan)) return { ok: false, error: 'plan_invalido' };
  if (!cuposValidos(d.cupos)) return { ok: false, error: 'cupos_invalidos' };
  // Cupos solo tienen sentido en pools (segundo CHECK de 0026).
  if (d.cupos !== undefined && d.cupos !== null && !noVacio(d.institucion_id)) {
    return { ok: false, error: 'cupos_solo_pool' };
  }
  if (d.fecha_inicio !== undefined && d.fecha_inicio !== null && !fechaValida(d.fecha_inicio)) {
    return { ok: false, error: 'fecha_invalida' };
  }
  if (d.fecha_fin !== undefined && d.fecha_fin !== null && !fechaValida(d.fecha_fin)) {
    return { ok: false, error: 'fecha_invalida' };
  }
  if (d.estado !== undefined && !estadoLicenciaValido(d.estado)) {
    return { ok: false, error: 'estado_invalido' };
  }
  return { ok: true };
}

// Edición parcial de licencia (extender fecha_fin, cambiar estado/plan/cupos).
// escuela_id/institucion_id NO se editan: una licencia no cambia de dueño.
export function validarLicenciaEditar(d: {
  plan?: unknown; cupos?: unknown; fecha_inicio?: unknown; fecha_fin?: unknown;
  estado?: unknown; condiciones?: unknown;
}): Resultado {
  if (d.plan !== undefined && !planValido(d.plan)) return { ok: false, error: 'plan_invalido' };
  if (!cuposValidos(d.cupos)) return { ok: false, error: 'cupos_invalidos' };
  if (d.fecha_inicio !== undefined && d.fecha_inicio !== null && !fechaValida(d.fecha_inicio)) {
    return { ok: false, error: 'fecha_invalida' };
  }
  if (d.fecha_fin !== undefined && d.fecha_fin !== null && !fechaValida(d.fecha_fin)) {
    return { ok: false, error: 'fecha_invalida' };
  }
  if (d.estado !== undefined && !estadoLicenciaValido(d.estado)) {
    return { ok: false, error: 'estado_invalido' };
  }
  if (d.condiciones !== undefined && d.condiciones !== null && typeof d.condiciones !== 'string') {
    return { ok: false, error: 'condiciones_invalidas' };
  }
  return { ok: true };
}

// Arma el patch de UPDATE a partir del body ya validado (solo lo que vino;
// fecha_fin/cupos null explícito limpia la columna).
export function armarPatchLicencia(d: {
  plan?: unknown; cupos?: unknown; fecha_inicio?: unknown; fecha_fin?: unknown;
  estado?: unknown; condiciones?: unknown;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (d.plan !== undefined) patch.plan = d.plan;
  if (d.cupos !== undefined) patch.cupos = d.cupos;
  if (d.fecha_inicio !== undefined) patch.fecha_inicio = d.fecha_inicio;
  if (d.fecha_fin !== undefined) patch.fecha_fin = d.fecha_fin;
  if (d.estado !== undefined) patch.estado = d.estado;
  if (d.condiciones !== undefined) {
    patch.condiciones = noVacio(d.condiciones) ? d.condiciones.trim() : null;
  }
  return patch;
}

// ── Email + password temporal (patrón admin-maestras) ───────────────────────
// Copia local del generador de admin-maestras/validar.ts: las fns no comparten
// archivos entre sí (solo _shared, y ahí solo se pueden tocar los guards);
// tests/unit/licencias.test.mjs congela la forma para que no diverja.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(e: unknown): boolean {
  return typeof e === 'string' && EMAIL_RE.test(e.trim());
}

export function emailNormalizado(e: unknown): string {
  return String(e ?? '').trim().toLowerCase();
}

export function validarCrearAdminInstitucion(d: {
  institucion_id?: unknown; nombre?: unknown; email?: unknown;
}): Resultado {
  if (!noVacio(d.institucion_id)) return { ok: false, error: 'institucion_requerida' };
  if (!noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (!emailValido(d.email)) return { ok: false, error: 'email_invalido' };
  return { ok: true };
}

// Tres palabras + tres dígitos ("sol-ceibo-viento-482"): fácil de dictar por
// teléfono. Secreto de corta vida (el canal primario es el link de recovery),
// NUNCA se persiste: se muestra una sola vez.
export const PALABRAS = [
  'sol', 'luna', 'rio', 'monte', 'nube', 'flor', 'faro', 'lago',
  'puma', 'tero', 'ceibo', 'trigo', 'viento', 'brote', 'cielo', 'campo',
  'hornero', 'zorro', 'yerba', 'sauce', 'junco', 'cobre', 'duende', 'tilo',
] as const;

export type Azar = (max: number) => number;

// Default criptográfico (crypto global existe en Deno y en Node >= 19).
// Rejection sampling para no sesgar el módulo.
function azarCrypto(max: number): number {
  const limite = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limite);
  return n % max;
}

export function generarPasswordTemporal(azar: Azar = azarCrypto): string {
  const palabras = Array.from({ length: 3 }, () => PALABRAS[azar(PALABRAS.length)]);
  const digitos = Array.from({ length: 3 }, () => String(azar(10))).join('');
  return `${palabras.join('-')}-${digitos}`;
}

// ── Mapeo de errores de la DB a códigos legibles ────────────────────────────
// El trigger licencia_cupos_guard tira 'sin_cupos'; el PK de licencia_asignacion
// (escuela_id) tira 23505. Cualquier otra cosa se propaga como error genérico.
export function codigoErrorAsignacion(err: { code?: string; message?: string } | null): string | null {
  if (!err) return null;
  if (String(err.message ?? '').includes('sin_cupos')) return 'sin_cupos';
  if (err.code === '23505') return 'colegio_ya_asignado';
  return null;
}
