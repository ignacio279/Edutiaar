// Lógica PURA del relato de la auditoría (fase "Auditoría legible", 2026-08-18).
// Spec: docs/superpowers/specs/2026-08-18-auditoria-legible-design.md
//
// El log se guarda crudo (42+ acciones con su jsonb) y ACÁ se convierte en algo
// que se lee: se clasifica en clave/rutina, se redacta un titular en castellano
// y se agrupan en una sola fila las cadenas de pase y de caso ARCO.
//
// Sin imports de React ni de Supabase: lo testea Node directo
// (tests/unit/admin-auditoria-relato.test.mjs). Nada de new Date() adentro —
// las fechas se formatean en la pantalla.
//
// Se arma al LEER, no al escribir (D1): ni columna nueva ni migración, y
// funciona igual sobre todo lo que ya está registrado.

// ── Tipos de entrada (shape crudo de la tabla `auditoria`) ──────────────────

export type EventoAuditoria = {
  id: string;
  actor_id: string;
  actor_email: string | null;
  nivel: string | null;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
  created_at: string;
};

// Diccionarios que resuelve admin-auditoria. Un id que no está simplemente no
// resuelve y cae al id corto: nunca "undefined" en pantalla.
export type Nombres = {
  escuelas?: Record<string, string>;
  perfiles?: Record<string, string>;
  instituciones?: Record<string, string>;
};

// Consentimiento de un pase, indexado por transferencia_id.
export type Consentimiento = {
  adulto_nombre: string;
  adulto_vinculo: string;
  via: string;
  otorgado_at: string | null;
};
export type Consentimientos = Record<string, Consentimiento>;

// ── Tipos de salida ────────────────────────────────────────────────────────

export type Importancia = 'clave' | 'rutina';
export type Categoria =
  | 'chicos' | 'maestras' | 'colegios' | 'acceso' | 'instituciones' | 'poder' | 'sistema';

export type PasoCadena = { id: string; fecha: string; texto: string };

// Una fila del feed: o un evento suelto (pasos vacío), o una cadena con sus
// hechos adentro.
export type ItemAuditoria = {
  id: string;
  fecha: string; // el ÚLTIMO hecho de la cadena (D5)
  titular: string;
  importancia: Importancia;
  categoria: Categoria;
  eventos: EventoAuditoria[];
  pasos: PasoCadena[];
};

export const CATEGORIAS: readonly { key: Categoria; label: string }[] = [
  { key: 'chicos', label: 'Chicos' },
  { key: 'maestras', label: 'Maestras' },
  { key: 'colegios', label: 'Colegios' },
  { key: 'acceso', label: 'Acceso' },
  { key: 'instituciones', label: 'Instituciones' },
  { key: 'poder', label: 'Poder' },
  { key: 'sistema', label: 'Sistema' },
] as const;

// ── Clasificación (D3/D4) ──────────────────────────────────────────────────

// Solo las RUTINA se enumeran. Todo lo demás es clave, incluida una acción que
// nadie clasificó todavía: agregar un detector no debe exigir tocar este
// archivo, y el peor caso de no tocarlo es que se vea de más (D4).
//
// ESPEJO de supabase/functions/_shared/auditoria-clasificacion.ts, que aplica
// el mismo filtro en la query (si no, una página entera de acciones rutinarias
// llegaría al front para mostrarse vacía). Un test de paridad congela las dos
// copias — mismo patrón que planes.ts y provincias.ts.
export const ACCIONES_RUTINA: readonly string[] = [
  'nap_revision_fijar', 'nap_backfill',
  'recalcular_alertas', 'job_nocturno',
  'atender_alerta',
  'crear_nota', 'borrar_nota', 'editar_contacto',
  'editar_colegio', 'editar_institucion',
  'editar_anuncio', 'activar_anuncio', 'desactivar_anuncio', 'borrar_anuncio',
  // Contabilidad del vínculo alumno↔colegio que escriben los triggers de la
  // base. Cada una dispara EN EL MISMO INSTANTE que un `alumno_transicion`
  // que cuenta el mismo hecho mejor (con `de`, `a` y `motivo`), así que
  // mostrar ambas duplicaría cada inscripción. La clave se queda; ésta no.
  'matricula_abierta', 'matricula_cerrada',
] as const;

const RUTINA: ReadonlySet<string> = new Set(ACCIONES_RUTINA);

const CATEGORIA_DE: Readonly<Record<string, Categoria>> = {
  transferencia_solicitada: 'chicos',
  transferencia_confirmada: 'chicos',
  transferencia_asistida: 'chicos',
  transferencia_denegada: 'chicos',
  alumno_transferido_activado: 'chicos',
  arco_acceso_exportado: 'chicos',
  arco_rectificacion: 'chicos',
  arco_cancelacion_solicitada: 'chicos',
  arco_cancelacion_ejecutada: 'chicos',
  arco_cancelacion_rechazada: 'chicos',
  // Escritas por triggers/RPCs de la base, no por registrarAuditoria.
  alumno_transicion: 'chicos',
  arco_oposicion: 'chicos',
  matricula_abierta: 'chicos',
  matricula_cerrada: 'chicos',

  crear_maestra: 'maestras',
  borrar_maestra: 'maestras',
  reset_password_maestra: 'maestras',
  suspender_maestra: 'maestras',
  // El slug real es `reactivar_maestra` (admin-maestras arma `${accion}_maestra`
  // con accion='reactivar'). `activar_maestra` se deja por si alguna vez se
  // escribió así: clasificar de más no cuesta nada.
  reactivar_maestra: 'maestras',
  activar_maestra: 'maestras',
  reasignar_maestra: 'maestras',
  docente_creado: 'maestras',

  crear_colegio: 'colegios',
  editar_colegio: 'colegios',
  cambiar_estado_colegio: 'colegios',

  crear_licencia: 'acceso',
  editar_licencia: 'acceso',
  asignar_cupo: 'acceso',
  quitar_cupo: 'acceso',
  set_trial: 'acceso',
  extender_trial: 'acceso',
  finalizar_trial: 'acceso',
  set_limites: 'acceso',
  set_features: 'acceso',
  aplicar_preset: 'acceso',

  crear_institucion: 'instituciones',
  editar_institucion: 'instituciones',
  estado_institucion: 'instituciones',
  crear_admin_institucion: 'instituciones',
  suspender_admin_institucion: 'instituciones',
  reactivar_admin_institucion: 'instituciones',
  asignar_colegio_institucion: 'instituciones',
  quitar_colegio_institucion: 'instituciones',

  crear_admin: 'poder',
  cambiar_nivel_admin: 'poder',
  desactivar_admin: 'poder',
  reactivar_admin: 'poder',
  ver_como: 'poder',
  crear_anuncio: 'poder',
};

export function importanciaDe(accion: string): Importancia {
  return RUTINA.has(accion) ? 'rutina' : 'clave';
}

export function categoriaDe(accion: string): Categoria {
  return CATEGORIA_DE[accion] ?? 'sistema';
}

// ── Helpers de redacción ───────────────────────────────────────────────────

// Las dos puntas del uuid: alcanza para cotejar contra un id completo desde
// cualquier extremo, sin ocupar media pantalla.
export function idCorto(id: string | null | undefined): string {
  if (typeof id !== 'string' || id.trim().length === 0) return '—';
  const s = id.trim();
  return s.length <= 10 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

const lista = (v: unknown): string | null =>
  Array.isArray(v) && v.length > 0 ? v.map(String).join(', ') : null;

// Un alumno se nombra SIEMPRE por su id (D2). Esta función es el único camino
// para referirse a un chico: aunque el diccionario de nombres trajera el suyo,
// acá no se consulta.
const alumno = (v: unknown): string => `alumno ${idCorto(str(v))}`;

function resolver(mapa: Record<string, string> | undefined, id: unknown): string {
  const s = str(id);
  if (!s) return '—';
  return mapa?.[s] ?? idCorto(s);
}

// Verbo natural para cada estado destino, en vez de "cambió de X a Y".
const VERBO_ESTADO_COLEGIO: Record<string, string> = {
  activo: 'Activó el colegio',
  trial: 'Puso en trial el colegio',
  suspendido: 'Suspendió el colegio',
  archivado: 'Archivó el colegio',
};

const VERBO_ESTADO_INSTITUCION: Record<string, string> = {
  activa: 'Activó la institución',
  suspendida: 'Suspendió la institución',
  archivada: 'Archivó la institución',
};

const VINCULO: Record<string, string> = {
  madre: 'madre', padre: 'padre', tutor: 'tutor/a', otro: 'adulto responsable',
};

const VIA: Record<string, string> = {
  link: 'por link', asistida: 'de forma asistida', migracion: 'por migración',
};

// Motivos de la máquina de estados del alumno (migración 0022).
const MOTIVO: Record<string, string> = {
  migracion: ' por un pase',
  egreso: ' por egreso',
  arco_baja: ' por un pedido ARCO',
};

// ── Redactar el titular ────────────────────────────────────────────────────

type Ctx = { e: EventoAuditoria; d: Record<string, unknown>; n: Nombres; c: Consentimientos };

const esc = (ctx: Ctx, id: unknown) => resolver(ctx.n.escuelas, id);
const perf = (ctx: Ctx, id: unknown) => resolver(ctx.n.perfiles, id);
const inst = (ctx: Ctx, id: unknown) => resolver(ctx.n.instituciones, id);

// Un redactor por acción. El que falta cae al fallback de `redactar`.
const REDACTORES: Record<string, (ctx: Ctx) => string> = {
  // ── Chicos ──
  transferencia_solicitada: (c) =>
    `Solicitó el pase del ${alumno(c.d.alumno_id)} a ${esc(c, c.d.escuela_destino_id ?? c.d.escuela_destino)}`,
  transferencia_confirmada: (c) =>
    `Se confirmó el pase del ${alumno(c.d.alumno_id)} a ${esc(c, c.d.escuela_destino ?? c.d.escuela_destino_id)}`,
  transferencia_asistida: (c) =>
    `Registró el pase asistido del ${alumno(c.d.alumno_id)} a ${esc(c, c.d.escuela_destino_id ?? c.d.escuela_destino)}`,
  transferencia_denegada: (c) => `Canceló el pase del ${alumno(c.d.alumno_id)}`,
  alumno_transferido_activado: (c) => {
    const grado = c.d.grado;
    const g = typeof grado === 'number' ? ` en ${grado}°` : '';
    return `Activó al ${alumno(c.d.alumno_id)}${g} en su aula nueva`;
  },
  arco_acceso_exportado: (c) => `Exportó el legajo del ${alumno(c.d.alumno_id)}`,
  arco_rectificacion: (c) => {
    const campos = lista(c.d.campos);
    return `Rectificó datos del ${alumno(c.d.alumno_id)}${campos ? ` — ${campos}` : ''}`;
  },
  arco_cancelacion_solicitada: (c) =>
    `Pidió la cancelación ARCO del ${alumno(c.d.alumno_id)}`,
  arco_cancelacion_ejecutada: () =>
    'Ejecutó la cancelación ARCO — borrado físico, no queda legajo',
  arco_cancelacion_rechazada: () => 'Rechazó un pedido de cancelación ARCO',
  arco_oposicion: (c) =>
    c.d.excluido_procesamiento === false
      ? `Levantó la oposición al procesamiento del ${alumno(c.e.entidad_id)}`
      : `Activó la oposición al procesamiento del ${alumno(c.e.entidad_id)}`,

  // ── Chicos: lo que escriben los triggers de la base ──
  // Ojo: acá el alumno viaja en `entidad_id` (entidad 'perfil'), no en el detalle.
  alumno_transicion: (c) => {
    const quien = `El ${alumno(c.e.entidad_id)}`;
    const motivo = MOTIVO[str(c.d.motivo) ?? ''] ?? '';
    switch (str(c.d.a)) {
      case 'en_transito': return `${quien} salió de su colegio${motivo}`;
      case 'activo': return `${quien} quedó activo en ${esc(c, c.d.escuela_id)}`;
      case 'egresado': return `${quien} egresó`;
      case 'baja': return `${quien} fue dado de baja${motivo}`;
      default: return `${quien} pasó de ${str(c.d.de) ?? '—'} a ${str(c.d.a) ?? '—'}`;
    }
  },
  matricula_abierta: (c) =>
    `Se abrió la matrícula del ${alumno(c.d.alumno_id)} en ${esc(c, c.d.escuela_id)}`,
  matricula_cerrada: (c) =>
    `Se cerró la matrícula del ${alumno(c.d.alumno_id)}${MOTIVO[str(c.d.motivo) ?? ''] ?? ''}`,

  // ── Maestras ──
  crear_maestra: (c) =>
    `Dio de alta a ${str(c.d.email) ?? 'una maestra'} en ${esc(c, c.d.escuela_id)}`,
  borrar_maestra: (c) =>
    `Dio de baja a ${str(c.d.nombre) ?? perf(c, c.e.entidad_id)} (${esc(c, c.d.escuela_id)})`,
  reset_password_maestra: (c) => `Reseteó la contraseña de ${perf(c, c.e.entidad_id)}`,
  suspender_maestra: (c) => `Suspendió a ${perf(c, c.e.entidad_id)}`,
  reactivar_maestra: (c) => `Reactivó a ${perf(c, c.e.entidad_id)}`,
  activar_maestra: (c) => `Reactivó a ${perf(c, c.e.entidad_id)}`,
  // La escribe institucion-panel: un admin de institución da de alta la maestra.
  docente_creado: (c) =>
    `Dio de alta a ${str(c.d.email) ?? 'una maestra'} en ${esc(c, c.d.escuela_id)}`,
  reasignar_maestra: (c) =>
    `Reasignó a ${perf(c, c.e.entidad_id)} de ${esc(c, c.d.de)} a ${esc(c, c.d.a)}`,

  // ── Colegios ──
  crear_colegio: (c) => `Dio de alta el colegio ${str(c.d.nombre) ?? esc(c, c.e.entidad_id)}`,
  editar_colegio: (c) => {
    const campos = lista(Object.keys(c.d));
    return `Editó los datos de ${esc(c, c.e.entidad_id)}${campos ? ` — ${campos}` : ''}`;
  },
  cambiar_estado_colegio: (c) => {
    const a = str(c.d.a) ?? '';
    const verbo = VERBO_ESTADO_COLEGIO[a] ?? `Cambió a "${a}" el colegio`;
    return `${verbo} ${esc(c, c.e.entidad_id)}`;
  },

  // ── Acceso ──
  set_trial: (c) => {
    const quien = c.e.entidad === 'perfil' ? perf(c, c.e.entidad_id) : esc(c, c.e.entidad_id);
    const fin = str(c.d.fin);
    return `Fijó el trial de ${quien}${fin ? ` hasta el ${fin}` : ''}`;
  },
  extender_trial: (c) => {
    const quien = c.e.entidad === 'perfil' ? perf(c, c.e.entidad_id) : esc(c, c.e.entidad_id);
    const dias = typeof c.d.dias === 'number' ? `${c.d.dias} días` : '';
    const fin = str(c.d.nuevo_fin);
    return `Extendió el trial de ${quien}${dias ? ` ${dias}` : ''}${fin ? ` — hasta el ${fin}` : ''}`;
  },
  finalizar_trial: (c) => `Finalizó el trial de ${esc(c, c.e.entidad_id)}`,
  set_limites: (c) => `Cambió los topes de IA de ${esc(c, c.e.entidad_id)}`,
  set_features: (c) =>
    `Cambió las features de ${esc(c, c.e.entidad_id)}${str(c.d.plan) ? ` (plan ${str(c.d.plan)})` : ''}`,
  aplicar_preset: (c) =>
    `Aplicó el preset ${str(c.d.plan) ?? '—'} en ${esc(c, c.e.entidad_id)}`,
  crear_licencia: (c) => {
    const destino = c.d.institucion_id
      ? inst(c, c.d.institucion_id)
      : esc(c, c.d.escuela_id);
    return `Creó una licencia ${str(c.d.plan) ?? ''} para ${destino}`.replace(/\s+/g, ' ');
  },
  editar_licencia: (c) => {
    const campos = lista(Object.keys(c.d));
    return `Editó una licencia${campos ? ` — ${campos}` : ''}`;
  },
  asignar_cupo: (c) => `Asignó un cupo de licencia a ${esc(c, c.d.escuela_id)}`,
  quitar_cupo: (c) => `Quitó el cupo de licencia de ${esc(c, c.d.escuela_id)}`,

  // ── Instituciones ──
  crear_institucion: (c) =>
    `Creó la institución ${str(c.d.nombre) ?? inst(c, c.e.entidad_id)}${str(c.d.tipo) ? ` (${str(c.d.tipo)})` : ''}`,
  editar_institucion: (c) => `Editó la institución ${inst(c, c.e.entidad_id)}`,
  estado_institucion: (c) => {
    const a = str(c.d.a) ?? '';
    const verbo = VERBO_ESTADO_INSTITUCION[a] ?? `Cambió a "${a}" la institución`;
    return `${verbo} ${inst(c, c.e.entidad_id)}`;
  },
  crear_admin_institucion: (c) =>
    `Dio de alta a ${str(c.d.email) ?? 'un admin'} en ${inst(c, c.d.institucion_id)}`,
  suspender_admin_institucion: (c) => `Suspendió al admin de institución ${perf(c, c.e.entidad_id)}`,
  reactivar_admin_institucion: (c) => `Reactivó al admin de institución ${perf(c, c.e.entidad_id)}`,
  asignar_colegio_institucion: (c) =>
    `Asignó ${esc(c, c.e.entidad_id)} a ${inst(c, c.d.a)}`,
  quitar_colegio_institucion: (c) =>
    `Quitó ${esc(c, c.e.entidad_id)} de ${inst(c, c.d.de)}`,

  // ── Poder ──
  crear_admin: (c) =>
    `Creó el admin ${str(c.d.email) ?? '—'}${str(c.d.nivel) ? ` (${str(c.d.nivel)})` : ''}`,
  cambiar_nivel_admin: (c) =>
    `Cambió el nivel de ${perf(c, c.e.entidad_id)} de ${str(c.d.de) ?? '—'} a ${str(c.d.a) ?? '—'}`,
  desactivar_admin: (c) => `Desactivó al admin ${str(c.d.nombre) ?? perf(c, c.e.entidad_id)}`,
  reactivar_admin: (c) => `Reactivó al admin ${str(c.d.nombre) ?? perf(c, c.e.entidad_id)}`,
  ver_como: (c) => `Entró a ver como ${perf(c, c.e.entidad_id)}`,
  crear_anuncio: (c) => {
    const alcance = c.d.escuela_id ? `para ${esc(c, c.d.escuela_id)}` : 'para todos los colegios';
    return `Publicó el anuncio "${str(c.d.titulo) ?? '—'}" ${alcance}`;
  },

  // ── Sistema (rutina) ──
  editar_anuncio: (c) => {
    const campos = lista(c.d.campos);
    return `Editó un anuncio${campos ? ` — ${campos}` : ''}`;
  },
  activar_anuncio: (c) => `Activó el anuncio "${str(c.d.titulo) ?? '—'}"`,
  desactivar_anuncio: (c) => `Desactivó el anuncio "${str(c.d.titulo) ?? '—'}"`,
  borrar_anuncio: (c) => `Borró el anuncio "${str(c.d.titulo) ?? '—'}"`,
  crear_nota: (c) =>
    `Escribió una nota${str(c.d.tipo) ? ` (${str(c.d.tipo)})` : ''} en ${esc(c, c.d.escuela_id)}`,
  borrar_nota: (c) => `Borró una nota de ${esc(c, c.d.escuela_id)}`,
  editar_contacto: (c) => `Actualizó el contacto de ${esc(c, c.e.entidad_id)}`,
  atender_alerta: () => 'Marcó una alerta como atendida',
  nap_revision_fijar: () => 'Revisó el mapeo NAP de un nodo',
  nap_backfill: (c) => {
    const m = typeof c.d.mapeados === 'number' ? c.d.mapeados : null;
    const s = typeof c.d.sin_tema === 'number' ? c.d.sin_tema : null;
    return m === null
      ? 'Corrió el backfill del mapeo NAP'
      : `Corrió el backfill NAP — ${m} mapeados, ${s ?? 0} sin tema`;
  },
  recalcular_alertas: () => 'Recalculó las alertas del operador',
  job_nocturno: () => 'Corrió el job nocturno',
};

// Titular en castellano de UN evento. Una acción sin redactor cae al slug
// crudo más la entidad: nunca se rompe la pantalla y nunca se oculta un
// evento por no saber cómo escribirlo (D4).
export function redactar(
  e: EventoAuditoria,
  nombres: Nombres = {},
  consentimientos: Consentimientos = {},
): string {
  const d = (e.detalle && typeof e.detalle === 'object' ? e.detalle : {}) as Record<string, unknown>;
  const redactor = REDACTORES[e.accion];
  if (!redactor) return e.entidad ? `${e.accion} · ${e.entidad}` : e.accion;
  try {
    return redactor({ e, d, n: nombres, c: consentimientos });
  } catch {
    // Un detalle con un shape inesperado no puede tumbar el feed entero.
    return e.entidad ? `${e.accion} · ${e.entidad}` : e.accion;
  }
}

// ── Cadenas (D5) ───────────────────────────────────────────────────────────

// Solo estas dos entidades agrupan: son las únicas donde un hecho del mundo
// real deja varios registros a lo largo del tiempo. `alumno_transferido_activado`
// dice entidad 'transferencia' pero guarda el id de la MATRÍCULA (D6.1), así
// que queda afuera y se muestra como fila propia.
const ENTIDADES_CADENA: ReadonlySet<string> = new Set(['transferencia', 'arco_caso']);
const FUERA_DE_CADENA: ReadonlySet<string> = new Set(['alumno_transferido_activado']);

const ACTOR_SIN_CUENTA = '00000000-0000-0000-0000-000000000000';

function agrupable(e: EventoAuditoria): boolean {
  return (
    !!e.entidad && ENTIDADES_CADENA.has(e.entidad)
    && !!e.entidad_id
    && !FUERA_DE_CADENA.has(e.accion)
  );
}

// Quién protagoniza un evento.
//
// El uuid de ceros NO significa "la familia": es el centinela genérico de
// "sin actor humano" y aparece también en matricula_abierta/cerrada y
// alumno_transicion, que escriben triggers. Solo en `transferencia_confirmada`
// quiere decir que confirmó el adulto por link (D6.2).
//
// Los eventos de trigger sí traen un `actor_id` real pero sin email (la base no
// lo tiene a mano): si ese id resuelve a una docente, se muestra su nombre.
export function actorDe(e: EventoAuditoria, nombres: Nombres = {}): string {
  if (e.actor_email) return e.actor_email;
  if (e.actor_id === ACTOR_SIN_CUENTA) {
    return e.accion === 'transferencia_confirmada' ? 'La familia' : 'El sistema';
  }
  return nombres.perfiles?.[e.actor_id] ?? idCorto(e.actor_id);
}

function textoPaso(e: EventoAuditoria, nombres: Nombres, cons: Consentimientos): string {
  if (e.accion === 'transferencia_confirmada') {
    return `${actorDe(e, nombres)} confirmó el pase`;
  }
  return `${actorDe(e, nombres)}: ${redactar(e, nombres, cons)}`;
}

// El consentimiento no es una fila de `auditoria` — vive en su propia tabla y
// entra a la cadena como un paso más, que es donde se lee la respuesta a
// "¿quién autorizó esto?" (D2).
function pasoConsentimiento(transferenciaId: string, c: Consentimiento): PasoCadena {
  const vinculo = VINCULO[c.adulto_vinculo] ?? c.adulto_vinculo;
  const via = VIA[c.via] ?? c.via;
  return {
    id: `consentimiento:${transferenciaId}`,
    fecha: c.otorgado_at ?? '',
    texto: `Autorizó ${c.adulto_nombre} (${vinculo}), ${via}`,
  };
}

const ts = (iso: string): number => {
  const v = new Date(iso).getTime();
  return Number.isNaN(v) ? 0 : v;
};

// Convierte los eventos crudos de UNA página en las filas del feed: agrupa las
// cadenas, redacta el titular y ordena por fecha descendente.
//
// Se agrupa solo dentro de la página (D5): una cadena partida entre dos
// páginas deja un huérfano, que se muestra solo con su propio titular.
export function armarFeed(
  eventos: EventoAuditoria[],
  nombres: Nombres = {},
  consentimientos: Consentimientos = {},
): ItemAuditoria[] {
  const sueltos: EventoAuditoria[] = [];
  const cadenas = new Map<string, EventoAuditoria[]>();

  for (const e of eventos ?? []) {
    if (!e) continue;
    if (!agrupable(e)) { sueltos.push(e); continue; }
    const clave = `${e.entidad}:${e.entidad_id}`;
    const previos = cadenas.get(clave);
    if (previos) previos.push(e);
    else cadenas.set(clave, [e]);
  }

  const items: ItemAuditoria[] = sueltos.map((e) => ({
    id: e.id,
    fecha: e.created_at,
    titular: redactar(e, nombres, consentimientos),
    importancia: importanciaDe(e.accion),
    categoria: categoriaDe(e.accion),
    eventos: [e],
    pasos: [],
  }));

  for (const grupo of cadenas.values()) {
    const orden = [...grupo].sort((a, b) => ts(a.created_at) - ts(b.created_at));
    const ultimo = orden[orden.length - 1];
    const transferenciaId = ultimo.entidad === 'transferencia' ? ultimo.entidad_id : null;

    const pasos: PasoCadena[] = orden.map((e) => ({
      id: e.id,
      fecha: e.created_at,
      texto: textoPaso(e, nombres, consentimientos),
    }));

    const cons = transferenciaId ? consentimientos[transferenciaId] : undefined;
    if (cons) {
      const paso = pasoConsentimiento(transferenciaId as string, cons);
      // Se inserta en su lugar cronológico; sin fecha, antes de la confirmación.
      // `>=` y no `>`: autorizar precede a confirmar, y en un pase por link
      // ambos hechos comparten el mismo instante.
      const at = paso.fecha ? ts(paso.fecha) : 0;
      const idx = paso.fecha
        ? pasos.findIndex((p) => ts(p.fecha) >= at)
        : Math.max(0, pasos.length - 1);
      if (idx === -1) pasos.push(paso);
      else pasos.splice(idx, 0, paso);
    }

    // La importancia de la cadena es la más alta de sus eventos: un solo hecho
    // clave hace que la fila entera se vea.
    const importancia: Importancia =
      orden.some((e) => importanciaDe(e.accion) === 'clave') ? 'clave' : 'rutina';

    items.push({
      id: ultimo.id,
      fecha: ultimo.created_at, // el ÚLTIMO hecho (D5)
      titular: redactar(ultimo, nombres, consentimientos),
      importancia,
      categoria: categoriaDe(ultimo.accion),
      eventos: orden,
      pasos,
    });
  }

  return items.sort((a, b) => ts(b.fecha) - ts(a.fecha));
}

// Filtro de la VISTA, no del registro (D3): lo rutinario sigue guardado y
// vuelve con el toggle.
export function filtrarFeed(
  items: ItemAuditoria[],
  opts: { verRutina?: boolean; categoria?: string } = {},
): ItemAuditoria[] {
  const { verRutina = false, categoria = '' } = opts;
  return (items ?? []).filter((i) => {
    if (!verRutina && i.importancia === 'rutina') return false;
    if (categoria && i.categoria !== categoria) return false;
    return true;
  });
}
