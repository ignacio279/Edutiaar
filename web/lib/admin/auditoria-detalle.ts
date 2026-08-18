// Detalle EN PALABRAS de un evento de auditoría (2026-08-18).
//
// El titular ya se lee en castellano (auditoria-relato.ts), pero al abrir un
// evento aparecía el jsonb crudo. Quien opera este panel puede no tener nada de
// oficio con computadoras: dos líneas de JSON no le dicen nada. Acá el mismo
// dato se convierte en (a) un párrafo que explica qué pasó y qué consecuencia
// tuvo, y (b) una lista de "campo: valor" con etiquetas y valores en castellano.
//
// Mismo principio que el relato: se arma al LEER. Sin migración, sin tocar los
// ~65 registrarAuditoria de las 13 fns, y aplica retroactivo a todo lo que ya
// está registrado. Agregar una acción nueva no rompe nada: sin párrafo se
// muestran igual los datos, y una clave sin etiqueta se muestra con su nombre
// tal cual.
//
// PURO: sin React ni Supabase, sin new Date() (las fechas se formatean con
// regex para que no dependan del huso horario). Lo testea Node directo
// (tests/unit/admin-auditoria-detalle.test.mjs).
//
// Privacidad (D2 de la spec de auditoría legible): un alumno se nombra SIEMPRE
// por id corto, nunca por nombre. Acá tampoco se consulta el diccionario de
// perfiles para un alumno.
import { fechaEnPalabras, idCorto, type EventoAuditoria, type Nombres } from './auditoria-relato.ts';

// Vive en el relato porque el titular también la usa (los vencimientos de
// trial); se re-exporta acá para que el detalle sea una sola puerta.
export { fechaEnPalabras };

// ── Salida ─────────────────────────────────────────────────────────────────

export type Dato = { etiqueta: string; valor: string };

export type DetalleLegible = {
  /** Párrafo en castellano: qué pasó y qué consecuencia tuvo. '' si no hay. */
  relato: string;
  /** "Sobre qué" fue la acción, ya resuelto a nombre cuando se puede. */
  sobre: string;
  /** El contenido del jsonb, con etiquetas y valores en palabras. */
  datos: Dato[];
};

// ── Formateo de valores ────────────────────────────────────────────────────

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esUuid = (v: string): boolean => RE_UUID.test(v);

// ── Diccionarios de valores ────────────────────────────────────────────────

const ESTADO_COLEGIO: Record<string, string> = {
  trial: 'probando la plataforma',
  activo: 'activo',
  suspendido: 'suspendido',
  archivado: 'archivado',
};

const ESTADO_INSTITUCION: Record<string, string> = {
  activa: 'activa',
  suspendida: 'suspendida',
  archivada: 'archivada',
};

const ESTADO_ALUMNO: Record<string, string> = {
  activo: 'anotado en un colegio',
  en_transito: 'de viaje entre dos colegios',
  egresado: 'egresado',
  baja: 'dado de baja',
};

const MOTIVO_ALUMNO: Record<string, string> = {
  migracion: 'un pase a otro colegio',
  egreso: 'que terminó la primaria',
  arco_baja: 'un pedido de la familia (derecho ARCO)',
};

const NIVEL_TEXTO: Record<string, string> = {
  super: 'super administrador (puede todo, incluso borrar datos)',
  operativo: 'operativo (opera el día a día, no toca permisos ni borra)',
};

const TIPO_TEXTO: Record<string, string> = {
  rural: 'rural',
  unidocente: 'de una sola maestra',
  plurigrado: 'plurigrado (varios grados en la misma aula)',
  provincia: 'provincia',
  municipio: 'municipio',
  fundacion: 'fundación',
  red: 'red de colegios',
  nota: 'nota suelta',
  contacto: 'contacto',
  acuerdo: 'acuerdo',
};

const PLAN_TEXTO: Record<string, string> = {
  basico: 'Básico (solo SOL, el copiloto de los chicos)',
  docente: 'Docente (SOL + LUNA, la copiloto de la maestra)',
  completo: 'Completo (SOL + LUNA + TERRA)',
  custom: 'a medida (interruptores sueltos, no calza con ningún paquete)',
  prueba: 'de prueba',
  activa: 'activa',
  vencida: 'vencida',
  suspendida: 'suspendida',
};

const VIA_TEXTO: Record<string, string> = {
  link: 'por un link que abrió la familia',
  asistida: 'en persona, con la familia presente en el colegio',
  migracion: 'por una migración de datos',
};

const VINCULO_TEXTO: Record<string, string> = {
  madre: 'la madre',
  padre: 'el padre',
  tutor: 'el tutor o la tutora',
  otro: 'un adulto responsable',
};

// Nombres de campo para las listas de "qué se tocó".
const CAMPO_TEXTO: Record<string, string> = {
  nombre: 'el nombre',
  avatar: 'el dibujito del perfil',
  titulo: 'el título',
  cuerpo: 'el texto',
  escuela_id: 'el colegio',
  desde: 'la fecha de inicio',
  hasta: 'la fecha de fin',
  zona: 'la zona',
  tipo: 'el tipo',
  provincia: 'la provincia',
  contacto: 'los datos de contacto',
  cupos: 'la cantidad de cupos',
  plan: 'el plan',
  fecha_fin: 'la fecha de vencimiento',
  fecha_inicio: 'la fecha de inicio',
  estado: 'el estado',
};

// Nombres de las funciones que se prenden y apagan por colegio.
const FEATURE_TEXTO: Record<string, string> = {
  sol: 'SOL, el copiloto de los chicos',
  terra: 'TERRA, la entrega a las familias',
  'luna.activa': 'LUNA, la copiloto de la maestra',
  'luna.alertas': 'LUNA · avisos de a quién atender',
  'luna.boletines': 'LUNA · boletines mensuales',
  'luna.chat': 'LUNA · chat con la maestra',
};

const TOPE_TEXTO: Record<string, string> = {
  sol_mes: 'ejercicios y correcciones de SOL',
  boletines_mes: 'boletines de LUNA',
  chats_mes: 'chats con LUNA',
};

// Prefijos de la clave de un aviso del panel (_shared/alertas-logica.ts).
// La clave es "<prefijo>:<id>:<fecha o mes>".
const ALERTA_TEXTO: Record<string, string> = {
  trial: 'colegio con la prueba por vencer',
  licencia: 'licencia por vencer',
  inactivo: 'colegio sin actividad',
  costo: 'colegio con el costo disparado',
};

// ── Configuración por clave del jsonb ──────────────────────────────────────

type Diccionario = 'escuelas' | 'perfiles' | 'instituciones' | 'alumno';

type Campo = {
  etiqueta: string;
  /** Traduce el valor crudo a palabras. */
  valores?: Record<string, string>;
  /** Resuelve un uuid contra un diccionario de nombres. */
  dicc?: Diccionario;
  /** Cosas de plomería que no le dicen nada a nadie. */
  oculto?: boolean;
  /** Render propio (flags, topes, listas). */
  render?: (v: unknown, ctx: Ctx) => string | null;
};

const GENERAL: Record<string, Campo> = {
  alumno_id: { etiqueta: 'Chico', dicc: 'alumno' },
  escuela_id: { etiqueta: 'Colegio', dicc: 'escuelas' },
  escuela_destino_id: { etiqueta: 'Colegio al que va', dicc: 'escuelas' },
  escuela_destino: { etiqueta: 'Colegio al que va', dicc: 'escuelas' },
  institucion_id: { etiqueta: 'Institución', dicc: 'instituciones' },

  // Plomería: identificadores internos que no aportan nada leídos solos.
  matricula_id: { etiqueta: '', oculto: true },
  aula_id: { etiqueta: '', oculto: true },
  licencia_id: { etiqueta: '', oculto: true },
  flags_previos: { etiqueta: '', oculto: true },

  consentimiento_id: {
    etiqueta: 'Autorización de la familia',
    render: (v) => (typeof v === 'string' && v.trim()
      ? 'Sí, quedó registrada'
      : 'No hizo falta: es la primera vez que se anota en un colegio'),
  },

  motivo: { etiqueta: 'Motivo', valores: MOTIVO_ALUMNO },
  inicio: { etiqueta: 'Empieza' },
  fin: { etiqueta: 'Vence' },
  nuevo_fin: { etiqueta: 'Nueva fecha de vencimiento' },
  trial_fin: { etiqueta: 'La prueba vence' },
  fecha_fin: { etiqueta: 'Vence' },
  fecha_inicio: { etiqueta: 'Empieza' },
  dias: { etiqueta: 'Tiempo que se agregó', render: (v) => (typeof v === 'number' ? `${v} días` : null) },

  nombre: { etiqueta: 'Nombre' },
  email: { etiqueta: 'Correo' },
  titulo: { etiqueta: 'Título' },
  tipo: { etiqueta: 'Tipo', valores: TIPO_TEXTO },
  zona: { etiqueta: 'Zona' },
  provincia: { etiqueta: 'Provincia' },
  plan: { etiqueta: 'Plan', valores: PLAN_TEXTO },
  nivel: { etiqueta: 'Nivel de permisos', valores: NIVEL_TEXTO },
  estado: { etiqueta: 'Estado', valores: { ...ESTADO_COLEGIO, ...ESTADO_INSTITUCION } },
  estado_anterior: { etiqueta: 'Estado que tenía antes', valores: ESTADO_COLEGIO },
  cupos: { etiqueta: 'Cupos', render: (v) => (typeof v === 'number' ? `${v} colegios` : null) },
  grado: { etiqueta: 'Grado', render: (v) => (typeof v === 'number' ? `${v}°` : null) },

  via: { etiqueta: 'Cómo se autorizó', valores: VIA_TEXTO },
  adulto_vinculo: { etiqueta: 'Quién de la familia autorizó', valores: VINCULO_TEXTO },

  excluido_procesamiento: {
    etiqueta: 'Queda fuera de los promedios',
    render: (v) => (v === true
      ? 'Sí: sus datos no entran en ningún informe ni promedio'
      : 'No: vuelve a contar en los promedios anónimos'),
  },

  campos: { etiqueta: 'Qué se tocó', render: (v) => listaDeCampos(v) },
  flags: { etiqueta: 'Funciones', render: (v) => listaDeFunciones(v) },
  limites: { etiqueta: 'Topes por mes', render: (v) => listaDeTopes(v) },
  contacto: { etiqueta: 'Contacto', render: (v) => textoDeContacto(v) },

  clave: { etiqueta: 'Aviso', render: (v, c) => textoDeAlerta(v, c) },

  // Resúmenes de los trabajos automáticos.
  mapeados: { etiqueta: 'Temas que se pudieron reconocer' },
  sin_tema: { etiqueta: 'Temas que quedaron sin reconocer' },
  programas: { etiqueta: 'Programas revisados' },
  generadas: { etiqueta: 'Avisos nuevos' },
  borradas: { etiqueta: 'Avisos que ya no hacían falta' },
  confianza_previa: {
    etiqueta: 'Seguridad que tenía SOL',
    render: (v) => (typeof v === 'number' ? `${Math.round(v * 100)} de cada 100` : null),
  },

  // Lo único que queda después de un borrado ARCO: un resumen sin nombres.
  agregado: { etiqueta: 'Resumen anónimo que quedó', render: (v, c) => textoDeAgregado(v, c) },
  sesiones: { etiqueta: 'Veces que practicó' },
  respuestas: { etiqueta: 'Ejercicios que respondió' },
  nodos_dominados: { etiqueta: 'Temas que llegó a dominar' },
  rango_fechas: { etiqueta: 'Practicó entre', render: (v) => textoDeRango(v) },
};

// `de` y `a` significan cosas distintas según la acción: sin esto se leerían
// como "de: activo / a: suspendido" sin decir de qué.
const POR_ACCION: Record<string, Record<string, Campo>> = {
  cambiar_estado_colegio: {
    de: { etiqueta: 'Antes estaba', valores: ESTADO_COLEGIO },
    a: { etiqueta: 'Ahora está', valores: ESTADO_COLEGIO },
  },
  estado_institucion: {
    de: { etiqueta: 'Antes estaba', valores: ESTADO_INSTITUCION },
    a: { etiqueta: 'Ahora está', valores: ESTADO_INSTITUCION },
  },
  alumno_transicion: {
    de: { etiqueta: 'Antes estaba', valores: ESTADO_ALUMNO },
    a: { etiqueta: 'Ahora está', valores: ESTADO_ALUMNO },
  },
  reasignar_maestra: {
    de: { etiqueta: 'Estaba en el colegio', dicc: 'escuelas' },
    a: { etiqueta: 'Pasa al colegio', dicc: 'escuelas' },
  },
  asignar_colegio_institucion: {
    de: { etiqueta: 'Antes dependía de', dicc: 'instituciones' },
    a: { etiqueta: 'Ahora depende de', dicc: 'instituciones' },
  },
  quitar_colegio_institucion: {
    de: { etiqueta: 'Dejó de depender de', dicc: 'instituciones' },
  },
  cambiar_nivel_admin: {
    de: { etiqueta: 'Antes era', valores: NIVEL_TEXTO },
    a: { etiqueta: 'Ahora es', valores: NIVEL_TEXTO },
  },
  nap_revision_fijar: {
    de: { etiqueta: 'Tema que había propuesto SOL' },
    a: { etiqueta: 'Tema que confirmó la persona' },
  },
};

// Orden de lectura: primero de quién/dónde se habla, después el cambio.
const ORDEN = [
  'alumno_id', 'nombre', 'email', 'grado', 'escuela_id', 'escuela_destino_id',
  'escuela_destino', 'institucion_id', 'tipo', 'zona', 'provincia',
  'de', 'a', 'estado', 'estado_anterior', 'motivo',
  'plan', 'flags', 'limites', 'cupos', 'nivel',
  'inicio', 'fin', 'nuevo_fin', 'trial_fin', 'fecha_inicio', 'fecha_fin', 'dias',
  'via', 'adulto_vinculo', 'consentimiento_id',
  'campos', 'titulo', 'contacto', 'clave', 'excluido_procesamiento',
  'confianza_previa', 'programas', 'mapeados', 'sin_tema', 'generadas', 'borradas',
  'agregado',
];

const posicion = (k: string): number => {
  const i = ORDEN.indexOf(k);
  return i === -1 ? ORDEN.length : i;
};

// ── Renderers propios ──────────────────────────────────────────────────────

type Ctx = { n: Nombres };

function listaDeCampos(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map((k) => CAMPO_TEXTO[String(k)] ?? String(k)).join(', ');
}

// Aplana el shape de flags (con LUNA anidada) a "prendido / apagado" por
// función. Cuando LUNA entera está apagada se dice una sola vez: enumerar sus
// cuatro sub-funciones apagadas confunde más de lo que aclara.
function listaDeFunciones(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const filas: string[] = [];
  const marca = (clave: string, on: unknown) =>
    filas.push(`${FEATURE_TEXTO[clave] ?? clave}: ${on === true ? 'prendida' : 'apagada'}`);

  if ('sol' in o) marca('sol', o.sol);
  const luna = o.luna;
  if (luna && typeof luna === 'object' && !Array.isArray(luna)) {
    const l = luna as Record<string, unknown>;
    marca('luna.activa', l.activa);
    if (l.activa === true) {
      for (const sub of ['alertas', 'boletines', 'chat']) {
        if (sub in l) marca(`luna.${sub}`, l[sub]);
      }
    }
  } else if (luna !== undefined) {
    marca('luna.activa', luna);
  }
  if ('terra' in o) marca('terra', o.terra);
  return filas.length ? filas.join(' · ') : null;
}

function listaDeTopes(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return 'Vuelve a los topes de siempre';
  }
  const o = v as Record<string, unknown>;
  const filas = Object.entries(o)
    .filter(([, n]) => typeof n === 'number')
    .map(([k, n]) => `hasta ${n} ${TOPE_TEXTO[k] ?? k} por mes`);
  return filas.length ? filas.join(' · ') : 'Vuelve a los topes de siempre';
}

function textoDeContacto(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const partes = Object.values(o)
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return partes.length ? partes.join(' · ') : null;
}

// La clave de un aviso del panel es "<prefijo>:<id>:<fecha o mes>". El id es
// de un colegio (o de una licencia): se resuelve a nombre cuando se puede.
function textoDeAlerta(v: unknown, ctx: Ctx): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const [prefijo, id, cuando] = v.trim().split(':');
  const que = ALERTA_TEXTO[prefijo] ?? prefijo;
  const quien = id ? (ctx.n.escuelas?.[id] ?? `identificador ${idCorto(id)}`) : '';
  const fecha = cuando ? (fechaEnPalabras(cuando) ?? cuando) : '';
  return [que, quien, fecha].filter(Boolean).join(' — ');
}

function textoDeRango(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const d = typeof o.desde === 'string' ? fechaEnPalabras(o.desde) : null;
  const h = typeof o.hasta === 'string' ? fechaEnPalabras(o.hasta) : null;
  if (!d && !h) return null;
  return `${d ?? '—'} y ${h ?? '—'}`;
}

// El snapshot anónimo del borrado ARCO se aplana en una sola línea legible.
function textoDeAgregado(v: unknown, ctx: Ctx): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const filas: string[] = [];
  for (const [k, val] of Object.entries(o)) {
    if (val === null || val === undefined) continue;
    const cfg = GENERAL[k];
    const texto = cfg?.render ? cfg.render(val, ctx) : valorSimple(val, cfg, ctx);
    if (texto) filas.push(`${cfg?.etiqueta ?? k}: ${texto}`);
  }
  return filas.length ? filas.join(' · ') : null;
}

// ── Valor de una clave cualquiera ──────────────────────────────────────────

function resolverDicc(dicc: Diccionario, v: string, ctx: Ctx): string {
  // Un alumno nunca se nombra (D2), aunque el diccionario lo tuviera.
  if (dicc === 'alumno') return `alumno ${idCorto(v)}`;
  const mapa = dicc === 'escuelas' ? ctx.n.escuelas
    : dicc === 'perfiles' ? ctx.n.perfiles
      : ctx.n.instituciones;
  return mapa?.[v] ?? `identificador ${idCorto(v)}`;
}

function valorSimple(v: unknown, cfg: Campo | undefined, ctx: Ctx): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const partes = v.map((x) => String(x)).filter((s) => s.length > 0);
    return partes.length ? partes.join(', ') : null;
  }
  if (typeof v === 'object') return null; // los objetos van por render propio
  const s = String(v).trim();
  if (!s) return null;
  if (cfg?.valores?.[s]) return cfg.valores[s];
  if (cfg?.dicc) return resolverDicc(cfg.dicc, s, ctx);
  const fecha = fechaEnPalabras(s);
  if (fecha) return fecha;
  // Un uuid suelto sin diccionario: nunca se escupe entero.
  if (esUuid(s)) return `identificador ${idCorto(s)}`;
  return s;
}

// ── El párrafo: qué pasó y qué consecuencia tuvo ───────────────────────────

type CtxRelato = { d: Record<string, unknown> };

const RELATOS: Record<string, (c: CtxRelato) => string> = {
  // ── Chicos ──
  transferencia_solicitada: () =>
    'Se pidió el pase de un chico a otro colegio. El pase todavía NO está hecho: primero un adulto de la familia tiene que autorizarlo. Hasta entonces el chico sigue igual donde estaba.',
  transferencia_confirmada: () =>
    'La familia autorizó el pase. El chico deja de figurar en el colegio anterior y queda esperando a que la maestra del colegio nuevo lo anote en su aula. Todo lo que aprendió viaja con él: el colegio nuevo ve su historia completa.',
  transferencia_asistida: () =>
    'El pase se registró con la familia presente en el colegio, en vez de por un link. Queda igual de autorizado que cualquier otro: sin autorización no hay pase.',
  transferencia_denegada: () =>
    'Se canceló un pedido de pase. El chico se queda donde estaba y no se cambió ninguno de sus datos.',
  alumno_transferido_activado: () =>
    'La maestra del colegio nuevo le dio aula, grado y una clave nueva al chico que llegó por un pase. Desde ahora puede entrar a practicar.',
  arco_acceso_exportado: () =>
    'Se armó el legajo completo de un chico para entregárselo a su familia. Es un derecho que da la ley 25.326: la familia puede pedir ver todo lo que guardamos. Mirar el legajo no cambia nada de sus datos.',
  arco_rectificacion: () =>
    'Se corrigieron datos de identidad de un chico a pedido de su familia. Solo se pueden corregir el nombre y el dibujito del perfil: el resto del legajo es el registro de lo que efectivamente pasó y no se toca.',
  arco_cancelacion_solicitada: () =>
    'Una familia pidió que borremos todos los datos de su chico. Todavía no se borró nada: hace falta que un super administrador lo revise y lo confirme en un segundo paso.',
  arco_cancelacion_ejecutada: () =>
    'Se borraron para siempre todos los datos del chico. Es el único borrado de verdad de toda la plataforma y no se puede deshacer. Lo único que quedó es un resumen sin nombre ni identificador, y este registro.',
  arco_cancelacion_rechazada: () =>
    'Se rechazó un pedido de borrado. Los datos del chico quedan tal como estaban.',
  arco_oposicion: (c) => (c.d.excluido_procesamiento === false
    ? 'Se dio marcha atrás con el pedido de la familia: los datos del chico vuelven a contar en los promedios anónimos por provincia y por tema.'
    : 'La familia pidió que los datos del chico no entren en los promedios ni en los informes por provincia. El chico sigue usando la plataforma exactamente igual: solo deja de contar en las estadísticas.'),
  alumno_transicion: (c) => {
    switch (String(c.d.a ?? '')) {
      case 'en_transito':
        return 'El chico dejó de estar anotado en su colegio. No se borró nada: su historia de aprendizaje queda guardada y lo espera en el colegio al que llegue.';
      case 'activo':
        return 'El chico quedó anotado y activo en un colegio. Desde ahora puede entrar a practicar y su maestra lo ve en la lista de su aula.';
      case 'egresado':
        return 'El chico terminó la primaria. Deja de practicar, pero su legajo queda guardado.';
      case 'baja':
        return 'El chico quedó dado de baja. Es un estado del que no se vuelve, y solo llega por un pedido de la familia.';
      default:
        return 'Cambió la situación del chico dentro de la plataforma.';
    }
  },
  matricula_abierta: () =>
    'Quedó registrado que el chico se anota en este colegio. Es la anotación formal: es lo que hace que su maestra lo vea y que él pueda entrar.',
  matricula_cerrada: () =>
    'Se cerró la anotación del chico en ese colegio. El colegio deja de verlo en el momento, pero no se borró nada de lo que hizo.',

  // ── Maestras ──
  crear_maestra: () =>
    'Se creó la cuenta de una maestra. Se le entrega un link de invitación y una contraseña temporal que sirve una sola vez: cuando entra, se pone la suya.',
  docente_creado: () =>
    'Se creó la cuenta de una maestra desde el panel de la institución. Se le entrega un link de invitación y una contraseña temporal de una sola vez.',
  borrar_maestra: () =>
    'Se dio de baja la cuenta de una maestra. Sus alumnos y todo lo que hicieron quedan guardados; lo que se corta es el acceso de ella.',
  reset_password_maestra: () =>
    'Se le generó una contraseña nueva y temporal a una maestra, porque no podía entrar. La anterior deja de servir.',
  suspender_maestra: () =>
    'Se le cortó el acceso a una maestra. No puede entrar hasta que la reactiven. Nada de lo suyo se borró.',
  reactivar_maestra: () =>
    'Una maestra que estaba suspendida volvió a tener acceso, con todo lo suyo como lo dejó.',
  activar_maestra: () =>
    'Una maestra que estaba suspendida volvió a tener acceso, con todo lo suyo como lo dejó.',
  reasignar_maestra: () =>
    'Se mudó a una maestra de un colegio a otro. Los chicos no se mudan con ella: siguen anotados donde están.',

  // ── Colegios ──
  crear_colegio: () =>
    'Se dio de alta un colegio nuevo en la plataforma. Todavía no tiene maestras ni chicos: eso se carga después.',
  editar_colegio: () =>
    'Se corrigieron los datos de un colegio. Es un cambio de ficha: no toca ni a las maestras ni a los chicos.',
  cambiar_estado_colegio: (c) => {
    switch (String(c.d.a ?? '')) {
      case 'activo':
        return 'El colegio pasó a estar activo: sus maestras y sus chicos pueden usar todo lo que tengan habilitado.';
      case 'trial':
        return 'El colegio pasó a estar probando la plataforma. Cuando la prueba se vence no se borra nada: queda pudiendo mirar todo lo que ya hizo, pero sin generar cosas nuevas.';
      case 'suspendido':
        return 'Se suspendió el colegio: nadie de ahí puede entrar hasta que lo reactiven. Todos los datos quedan intactos.';
      case 'archivado':
        return 'Se archivó el colegio: sale del día a día pero no se borra nada.';
      default:
        return 'Cambió la situación del colegio en la plataforma.';
    }
  },

  // ── Acceso ──
  set_trial: () =>
    'Se fijó hasta cuándo puede probar gratis. Cuando la prueba se vence NO se borra nada: queda en modo solo lectura, o sea que puede ver todo lo que ya hizo pero no generar cosas nuevas.',
  extender_trial: () =>
    'Se le dio más tiempo de prueba. Si estaba vencido, vuelve a funcionar completo desde este momento.',
  finalizar_trial: () =>
    'Se terminó el período de prueba y el colegio pasó a ser cliente activo.',
  set_limites: () =>
    'Se cambió cuánto puede usar la inteligencia artificial ese colegio en un mes. Sirve para que el costo no se dispare: al llegar al tope se corta lo que genera cosas nuevas, no lo que ya está hecho.',
  set_features: () =>
    'Se cambió qué funciones tiene prendidas el colegio. Apagar una la esconde de las maestras al toque; nada de lo hecho se pierde y se puede volver a prender.',
  aplicar_preset: () =>
    'Se aplicó un paquete de funciones ya armado, en vez de prender una por una. Es lo mismo que tocar cada interruptor a mano.',
  crear_licencia: () =>
    'Se creó una licencia. La licencia es lo que gobierna el acceso: mientras está al día todo funciona, y si se vence el colegio queda en modo solo lectura. Nunca se borra nada por falta de pago.',
  editar_licencia: () =>
    'Se cambiaron las condiciones de una licencia.',
  asignar_cupo: () =>
    'Se le dio a un colegio uno de los cupos de una licencia comprada por una institución. Con el cupo, ese colegio pasa a estar cubierto.',
  quitar_cupo: () =>
    'Se le sacó a un colegio el cupo de la licencia de la institución. El colegio no pierde nada de lo hecho, pero deja de estar cubierto por esa licencia.',

  // ── Instituciones ──
  crear_institucion: () =>
    'Se creó una institución: un paraguas que agrupa varios colegios (una provincia, un municipio, una fundación o una red). La institución nunca ve chicos de a uno: solo números del conjunto.',
  editar_institucion: () => 'Se corrigieron los datos de una institución.',
  estado_institucion: () => 'Cambió la situación de una institución en la plataforma.',
  crear_admin_institucion: () =>
    'Se dio de alta a una persona para que administre una institución. Ve los números de sus colegios, nunca a un chico en particular.',
  suspender_admin_institucion: () =>
    'Se le cortó el acceso a quien administraba una institución. Sus colegios siguen funcionando igual.',
  reactivar_admin_institucion: () =>
    'Volvió a tener acceso quien administra una institución.',
  asignar_colegio_institucion: () =>
    'Un colegio pasó a depender de una institución. Desde ahora suma a los números de esa institución.',
  quitar_colegio_institucion: () =>
    'Un colegio dejó de depender de una institución. Deja de sumar a sus números; el colegio sigue igual.',

  // ── Poder ──
  crear_admin: () =>
    'Se dio de alta a una persona nueva para administrar la plataforma. Es de lo más delicado que se puede hacer acá: elegir el nivel decide qué puede tocar.',
  cambiar_nivel_admin: () =>
    'Se cambió qué puede hacer un administrador. El nivel super es el único que puede borrar datos de un chico.',
  desactivar_admin: () =>
    'Se le sacó el acceso al panel a un administrador. Todo lo que hizo queda registrado igual.',
  reactivar_admin: () => 'Un administrador volvió a tener acceso al panel.',
  ver_como: () =>
    'Se entró a mirar la plataforma con los ojos de una maestra, para poder ayudarla. Es solo mirar: desde ahí no se puede cambiar nada, y nunca se usa su cuenta.',
  crear_anuncio: () =>
    'Se publicó un aviso que las maestras van a ver arriba de su pantalla cuando entren.',

  // ── Rutina ──
  editar_anuncio: () => 'Se corrigió un aviso que ven las maestras.',
  activar_anuncio: () => 'Se volvió a mostrar un aviso a las maestras.',
  desactivar_anuncio: () => 'Se dejó de mostrar un aviso. El texto queda guardado por si hace falta de nuevo.',
  borrar_anuncio: () => 'Se borró un aviso a las maestras.',
  crear_nota: () => 'Se escribió una nota interna sobre un colegio. La ve solo quien administra la plataforma.',
  borrar_nota: () => 'Se borró una nota interna sobre un colegio.',
  editar_contacto: () => 'Se actualizó a quién llamar en un colegio.',
  atender_alerta: () =>
    'Alguien marcó un aviso como atendido. Ese aviso no vuelve a aparecer.',
  nap_revision_fijar: () =>
    'Una persona confirmó a mano contra qué tema del programa oficial del Ministerio corresponde un tema cargado por una maestra. La decisión de la persona manda siempre sobre lo que había propuesto SOL.',
  nap_backfill: () =>
    'Se pasó SOL por los temas que las maestras venían cargando, para ubicar cada uno dentro del programa oficial del Ministerio. Los que quedan dudosos van a una cola para que los mire una persona.',
  recalcular_alertas: () =>
    'Se volvieron a calcular los avisos del panel con los datos del momento.',
  job_nocturno: () =>
    'Corrió el trabajo automático de todas las noches: recalcula avisos, vence los pases que nadie autorizó y saca la foto del día.',
};

// ── Sobre qué fue la acción ────────────────────────────────────────────────

const ENTIDAD_TEXTO: Record<string, string> = {
  escuela: 'Colegio',
  perfil: 'Maestra',
  transferencia: 'Pase de un chico',
  arco_caso: 'Pedido de la familia (derecho ARCO)',
  licencia: 'Licencia',
  institucion: 'Institución',
  plataforma_admin: 'Administrador de la plataforma',
  anuncio: 'Aviso a las maestras',
  escuela_nota: 'Nota interna',
  nodo: 'Tema de una materia',
  matricula: 'Anotación de un chico en un colegio',
  institucion_admin: 'Quien administra una institución',
  admin_alerta_atendida: 'Aviso del panel',
};

// En estas dos acciones `entidad` dice 'perfil' pero el id es el del ALUMNO
// (las escriben triggers de la base). Sin esto se leería "Maestra".
const ENTIDAD_ES_ALUMNO: ReadonlySet<string> = new Set(['alumno_transicion', 'arco_oposicion']);

export function sobreQue(e: EventoAuditoria, nombres: Nombres = {}): string {
  const id = typeof e.entidad_id === 'string' ? e.entidad_id.trim() : '';
  if (!id) return 'No apunta a ningún registro en particular';

  if (ENTIDAD_ES_ALUMNO.has(e.accion)) return `Un chico — alumno ${idCorto(id)}`;

  const etiqueta = ENTIDAD_TEXTO[e.entidad ?? ''] ?? 'Registro';
  const mapa = e.entidad === 'escuela' ? nombres.escuelas
    : e.entidad === 'perfil' || e.entidad === 'plataforma_admin' ? nombres.perfiles
      : e.entidad === 'institucion' ? nombres.instituciones
        : undefined;
  const nombre = mapa?.[id];
  return nombre ? `${etiqueta} — ${nombre}` : `${etiqueta} — identificador ${idCorto(id)}`;
}

// ── Armado ─────────────────────────────────────────────────────────────────

// Todo lo que sabemos de UN evento, escrito para que lo lea cualquiera.
// Una acción sin párrafo devuelve relato '' y muestra igual sus datos; una
// clave sin etiqueta se muestra con su nombre crudo, nunca se esconde.
export function describir(e: EventoAuditoria, nombres: Nombres = {}): DetalleLegible {
  const ctx: Ctx = { n: nombres };
  const d = (e.detalle && typeof e.detalle === 'object' && !Array.isArray(e.detalle)
    ? e.detalle
    : {}) as Record<string, unknown>;

  let relato = '';
  const escritor = RELATOS[e.accion];
  if (escritor) {
    try {
      relato = escritor({ d });
    } catch {
      relato = ''; // un detalle con shape raro no puede tumbar la pantalla
    }
  }

  const porAccion = POR_ACCION[e.accion] ?? {};
  const datos: Dato[] = [];
  for (const clave of Object.keys(d).sort((a, b) => posicion(a) - posicion(b))) {
    const cfg = porAccion[clave] ?? GENERAL[clave];
    if (cfg?.oculto) continue;
    const bruto = d[clave];
    let valor: string | null = null;
    try {
      valor = cfg?.render ? cfg.render(bruto, ctx) : valorSimple(bruto, cfg, ctx);
    } catch {
      valor = null;
    }
    if (!valor) continue;
    datos.push({ etiqueta: cfg?.etiqueta || clave, valor });
  }

  return { relato, sobre: sobreQue(e, nombres), datos };
}
