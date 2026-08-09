// Lógica PURA de métricas del panel admin (WP5, Dashboard admin v3): adopción,
// uso, funnel de onboarding por colegio, comparativa y feed de actividad.
// Patrón de web/lib/luna.ts: recibe filas ya traídas + `now: Date` inyectado
// (nada de new Date() adentro) → determinística y unit-testeable con
// node --test (tests/unit/admin-metricas.test.mjs). Standalone a propósito:
// cero imports de otros libs (Next quiere import sin extensión; node --test la
// quiere con .ts). Quien llama a la DB es la Edge Function admin-metricas o la
// página; acá NUNCA se toca la red.
//
// APROXIMACIONES DOCUMENTADAS:
// - "Maestra activa (7 días)": activa = login en los últimos 7 días
//   (`last_sign_in_at` real de Supabase Auth, lo trae admin-metricas) O rastro
//   de trabajo: un boletín tocado (creado, editado o aprobado), un mensaje
//   propio en el chat de LUNA o una llamada registrada en uso_api. Los rastros
//   se mantienen porque cubren sesiones largas sin re-login (el
//   last_sign_in_at no se refresca mientras la sesión sigue viva).
// - `perfil` no tiene created_at (0001): la etapa "maestras invitadas" del
//   funnel puede quedar hecha pero SIN fecha, y el feed no puede mostrar altas
//   de maestra hasta que exista ese timestamp.
// - uso_api se llena recién en la Fase final del dashboard: hasta entonces
//   todo lo que dependa de ella degrada elegante a 0 / "sin datos aún".
//
// Toda función con listas vacías devuelve ceros / listas vacías, nunca NaN.

const DIA_MS = 86_400_000;

// Timestamp en ms de un ISO, o NaN si falta o es inválido (las comparaciones
// con NaN dan false → la fila rara queda afuera sin romper nada).
function ts(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const v = new Date(iso).getTime();
  return Number.isFinite(v) ? v : NaN;
}

// ── Tipos de las filas que llegan (subconjuntos de las tablas) ──────────────

export type EscuelaFila = { id: string; nombre?: string | null; estado?: string | null; created_at?: string | null };
export type DocenteFila = { id: string; created_at?: string | null; last_sign_in_at?: string | null };
export type SesionFila = { alumno_id: string; fecha: string; aciertos?: number | null; total?: number | null };
export type BoletinFila = {
  docente_id?: string | null;
  estado?: string | null;
  version?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  aprobado_at?: string | null;
};
export type MensajeFila = { docente_id?: string | null; role?: string | null; created_at?: string | null };
export type UsoApiFila = { perfil_id?: string | null; created_at?: string | null };

export type Rango = { desde: Date; hasta: Date };

// ── Resumen de adopción (home del admin) ────────────────────────────────────

export type DatosAdopcion = {
  escuelas: EscuelaFila[];
  docentes: DocenteFila[];
  alumnos?: { id: string }[]; // opcional: hoy no hace falta para el resumen
  sesiones: SesionFila[];
  boletines: BoletinFila[];
  mensajes: MensajeFila[];
  usoApi?: UsoApiFila[]; // opcional: se llena en la Fase final
};

export type ResumenAdopcion = {
  colegiosActivos: number;
  maestrasActivas7d: number;
  alumnosActivos7d: number;
  sesionesHoy: number;
};

// Colegio "activo" = operando (estado trial o activo); suspendido/archivado no
// cuentan. "Hoy" = el día calendario local de `now`.
export function resumenAdopcion(datos: DatosAdopcion, now: Date): ResumenAdopcion {
  const nowMs = now.getTime();
  const corte7 = nowMs - 7 * DIA_MS;
  const en7 = (iso?: string | null) => {
    const v = ts(iso);
    return v >= corte7 && v <= nowMs;
  };

  const colegiosActivos = (datos.escuelas ?? [])
    .filter((e) => e.estado === 'activo' || e.estado === 'trial').length;

  // Documentado arriba: activa = login real en los últimos 7 días
  // (last_sign_in_at) O rastro de trabajo (boletín tocado, chat, uso_api).
  const docIds = new Set((datos.docentes ?? []).map((d) => d.id));
  const activas = new Set<string>();
  for (const d of datos.docentes ?? []) {
    if (en7(d.last_sign_in_at)) activas.add(d.id);
  }
  for (const b of datos.boletines ?? []) {
    if (b.docente_id && docIds.has(b.docente_id)
      && (en7(b.updated_at) || en7(b.created_at) || en7(b.aprobado_at))) activas.add(b.docente_id);
  }
  for (const m of datos.mensajes ?? []) {
    if (m.docente_id && docIds.has(m.docente_id) && m.role === 'user' && en7(m.created_at)) activas.add(m.docente_id);
  }
  for (const u of datos.usoApi ?? []) {
    if (u.perfil_id && docIds.has(u.perfil_id) && en7(u.created_at)) activas.add(u.perfil_id);
  }

  const hoyIni = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const alumnos7 = new Set<string>();
  let sesionesHoy = 0;
  for (const s of datos.sesiones ?? []) {
    const v = ts(s.fecha);
    if (Number.isNaN(v)) continue;
    if (v >= corte7 && v <= nowMs) alumnos7.add(s.alumno_id);
    if (v >= hoyIni && v < hoyIni + DIA_MS) sesionesHoy += 1;
  }

  return {
    colegiosActivos,
    maestrasActivas7d: activas.size,
    alumnosActivos7d: alumnos7.size,
    sesionesHoy,
  };
}

// ── Métricas de uso en un rango ─────────────────────────────────────────────

export type DatosUso = {
  sesiones?: SesionFila[]; // aceptado por simetría; el shape de salida no lo usa
  respuestas: { created_at?: string | null }[];
  boletines: BoletinFila[];
  mensajes: MensajeFila[];
  ejerciciosCreados: { created_at?: string | null }[];
};

export type MetricasUso = {
  ejerciciosRespondidos: number;
  ejerciciosGenerados: number;
  boletinesGenerados: number;
  boletinesAprobadosSinEditar: number;
  chats: number;
};

// Rango semiabierto [desde, hasta). "Aprobado sin editar" = salió perfecto de
// LUNA: estado 'aprobado' y version === 1 (la versión sube al regenerar o
// corregir, 0016).
export function metricasUso(datos: DatosUso, rango: Rango): MetricasUso {
  const d = rango.desde.getTime();
  const h = rango.hasta.getTime();
  const en = (iso?: string | null) => {
    const v = ts(iso);
    return v >= d && v < h;
  };
  const bols = (datos.boletines ?? []).filter((b) => en(b.created_at));
  return {
    ejerciciosRespondidos: (datos.respuestas ?? []).filter((r) => en(r.created_at)).length,
    ejerciciosGenerados: (datos.ejerciciosCreados ?? []).filter((e) => en(e.created_at)).length,
    boletinesGenerados: bols.length,
    boletinesAprobadosSinEditar: bols.filter((b) => b.estado === 'aprobado' && b.version === 1).length,
    chats: (datos.mensajes ?? []).filter((m) => m.role === 'user' && en(m.created_at)).length,
  };
}

// ── Funnel de onboarding por colegio ────────────────────────────────────────

export type ClaveEtapa = 'creado' | 'maestras_invitadas' | 'primera_actividad' | 'primer_boletin_aprobado';
export type EtapaFunnel = { clave: ClaveEtapa; label: string; hecho: boolean; fecha: string | null };

export type DatosFunnel = {
  escuela: EscuelaFila;
  // Acepta la lista de docentes (con created_at si algún día existe) o
  // directamente el count que devuelve la Edge Function.
  docentes: number | DocenteFila[];
  primeraSesion?: string | null;
  primerBoletinAprobado?: string | null;
};

// Etapas fijas del onboarding. "Maestras invitadas" queda hecha con al menos
// una docente; su fecha suele ser null porque perfil no tiene created_at
// (aproximación documentada arriba).
export function funnelColegio(datos: DatosFunnel): EtapaFunnel[] {
  const lista = Array.isArray(datos.docentes) ? datos.docentes : [];
  const cantidad = Array.isArray(datos.docentes) ? datos.docentes.length : (datos.docentes ?? 0);
  let primeraDocente: string | null = null;
  for (const d of lista) {
    if (d.created_at && (!primeraDocente || d.created_at < primeraDocente)) primeraDocente = d.created_at;
  }
  return [
    { clave: 'creado', label: 'Colegio creado', hecho: true, fecha: datos.escuela?.created_at ?? null },
    { clave: 'maestras_invitadas', label: 'Maestras invitadas', hecho: cantidad > 0, fecha: primeraDocente },
    { clave: 'primera_actividad', label: 'Primera actividad', hecho: !!datos.primeraSesion, fecha: datos.primeraSesion ?? null },
    { clave: 'primer_boletin_aprobado', label: 'Primer boletín aprobado', hecho: !!datos.primerBoletinAprobado, fecha: datos.primerBoletinAprobado ?? null },
  ];
}

// ── Comparativa entre colegios ──────────────────────────────────────────────

export type ColegioComparado = {
  escuelaId: string;
  nombre?: string | null;
  estado?: string | null;
  alumnosActivos?: number | null;
  sesiones?: number | null;
  aciertos?: number | null;
  total?: number | null;
  boletinesAprobados?: number | null;
};

export type FilaComparativa = {
  escuelaId: string;
  nombre: string;
  estado: string | null;
  alumnosActivos: number;
  sesiones: number;
  precision: number | null; // % de aciertos; null si no hubo respuestas
  boletinesAprobados: number;
};

// Normaliza y ordena por actividad: sesiones desc, después alumnos activos,
// después nombre. Sin respuestas en el rango → precisión null ("sin datos"),
// nunca NaN.
export function compararColegios(porColegio: ColegioComparado[]): FilaComparativa[] {
  return (porColegio ?? [])
    .map((c) => {
      const total = c.total ?? 0;
      return {
        escuelaId: c.escuelaId,
        nombre: c.nombre ?? '',
        estado: c.estado ?? null,
        alumnosActivos: c.alumnosActivos ?? 0,
        sesiones: c.sesiones ?? 0,
        precision: total > 0 ? Math.round((100 * (c.aciertos ?? 0)) / total) : null,
        boletinesAprobados: c.boletinesAprobados ?? 0,
      };
    })
    .sort((a, b) => (b.sesiones - a.sesiones)
      || (b.alumnosActivos - a.alumnosActivos)
      || a.nombre.localeCompare(b.nombre));
}

// ── Feed de actividad ───────────────────────────────────────────────────────

export type TipoEvento = 'sesion' | 'boletin_aprobado' | 'alta_maestra' | 'alta_colegio';

export type EventoFeed = {
  tipo: TipoEvento;
  fecha: string;
  alumno?: string | null; // nombre (acá se recorta al nombre de pila, Regla 5)
  nodo?: string | null; // nombre del tema practicado
  escuela?: string | null; // nombre del colegio
  nombre?: string | null; // alta_colegio / alta_maestra
};

export type ItemFeed = { tipo: TipoEvento; fecha: string; texto: string };

// Nombre de pila: al feed del admin va lo mínimo (Regla 5).
function pila(nombre?: string | null): string {
  return (nombre ?? '').trim().split(/\s+/)[0] || 'Alguien';
}

function textoEvento(e: EventoFeed): string {
  const enEscuela = e.escuela ? ` en ${e.escuela}` : '';
  switch (e.tipo) {
    case 'sesion':
      return `${pila(e.alumno)} practicó${e.nodo ? ` ${e.nodo}` : ''}${enEscuela}`;
    case 'boletin_aprobado':
      return `Boletín de ${pila(e.alumno)} aprobado${enEscuela}`;
    case 'alta_maestra':
      return `Se sumó la maestra ${pila(e.nombre)}${enEscuela}`;
    case 'alta_colegio':
      return `Se sumó el colegio ${e.nombre ?? 'nuevo'}`;
    default:
      return 'Actividad en la plataforma';
  }
}

// Mergea eventos heterogéneos, arma el texto de cada uno, ordena por fecha
// descendente y trunca. Fechas inválidas quedan afuera.
export function armarFeed(eventos: EventoFeed[], limite = 30): ItemFeed[] {
  return (eventos ?? [])
    .filter((e) => !Number.isNaN(ts(e.fecha)))
    .map((e) => ({ tipo: e.tipo, fecha: e.fecha, texto: textoEvento(e) }))
    .sort((a, b) => ts(b.fecha) - ts(a.fecha))
    .slice(0, Math.max(0, limite));
}

// Fecha relativa cortita para el feed: "recién", "hace 30 min", "hace 2 h",
// "ayer", "hace 12 días". Fechas futuras o inválidas → sin drama.
export function fechaRelativa(fecha: string, now: Date): string {
  const v = ts(fecha);
  if (Number.isNaN(v)) return '';
  const dif = now.getTime() - v;
  if (dif < 45_000) return 'recién';
  const min = Math.round(dif / 60_000);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(dif / 3_600_000);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(dif / DIA_MS);
  return dias <= 1 ? 'ayer' : `hace ${dias} días`;
}

// ── Serie semanal (adopción y tab Uso de la ficha de colegio) ───────────────

export type SemanaSerie = { desde: string; hasta: string; sesiones: number; alumnosActivos: number };

// Baldes de 7 días contando hacia atrás desde `now` (la última semana termina
// en now). Devuelve de la más vieja a la más nueva; rango vacío → un balde en
// cero.
export function serieSemanal(
  sesiones: { alumno_id?: string | null; fecha: string }[],
  rangoDias: number,
  now: Date,
): SemanaSerie[] {
  const semanas = Math.max(1, Math.ceil((rangoDias || 0) / 7));
  const fin = now.getTime();
  const out: SemanaSerie[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const hasta = fin - i * 7 * DIA_MS;
    const desde = hasta - 7 * DIA_MS;
    const delBalde = (sesiones ?? []).filter((s) => {
      const v = ts(s.fecha);
      return v > desde && v <= hasta;
    });
    out.push({
      desde: new Date(desde).toISOString(),
      hasta: new Date(hasta).toISOString(),
      sesiones: delBalde.length,
      alumnosActivos: new Set(delBalde.map((s) => s.alumno_id).filter(Boolean)).size,
    });
  }
  return out;
}
