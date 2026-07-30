// Lógica PURA de LUNA (copiloto de la docente): alertas de rendimiento, métricas
// y resumen del aula, calculadas on-demand al cargar el dashboard. Sin DOM ni
// red → unit-testeable (tests/unit/luna.test.mjs). Toma `now: Date` por
// parámetro: nada de new Date() adentro, así los tests son deterministas.
//
// Standalone a propósito (igual que panel.ts): no importa de otros módulos de
// lib para no chocar la resolución de módulos (Next quiere import sin
// extensión; `node --test` la quiere con .ts). Los umbrales viven acá como
// constantes documentadas.
//
// Desacoplado a propósito: el componente solo junta filas (queries RLS) y llama
// estas funciones. Mover el análisis a un job nocturno es cambiar quién las
// llama, no reescribirlas.

export type Prioridad = 'alta' | 'media' | 'info';

export type TipoAlerta = 'inactividad' | 'caida_precision' | 'evita_tipo' | 'adelantado' | 'sin_arrancar';

export type Alerta = {
  tipo: TipoAlerta;
  prioridad: Prioridad;
  alumnoId: string;
  alumnoNombre: string;
  avatar: string;
  grado: number;
  detalle: string;
  sugerencia: string;
  positiva: boolean;
};

// Subconjuntos de las filas que trae el componente (vía RLS).
export type AlumnoLuna = { id: string; nombre: string; avatar: string | null; grado: number | null };
export type SesionLuna = { alumno_id: string; nodo_id: string; fecha: string; aciertos?: number | null; total?: number | null };
// La página aplana el embed sesion/ejercicio a esta forma.
export type RespuestaLuna = { alumnoId: string; nodoId: string; tipo: string; correcta: boolean; createdAt: string };
export type NodoAlumnoLuna = { alumno_id: string; nodo_id: string; estado: string };
export type NodoLuna = { id: string; nombre: string };
export type BoletinLite = { alumno_id: string; estado: string };

// Umbrales de los detectores (días de calendario / cantidades mínimas).
const DIAS_INACTIVO_MEDIA = 5;
const DIAS_INACTIVO_ALTA = 10;
const VENTANA_RECIENTE_DIAS = 7;
const VENTANA_PREVIA_DIAS = 14; // los 14 días ANTERIORES a la ventana reciente
const MIN_MUESTRA_PRECISION = 6; // respuestas mínimas por ventana para comparar
const CAIDA_PUNTOS = 25; // caída de precisión (en puntos) que dispara la alerta
const VENTANA_EVITA_DIAS = 14;
const MIN_MUESTRA_EVITA = 12;
const TIPO_EVITADO = 'producir'; // el tipo que más cuesta y más se esquiva

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Período MENSUAL del boletín (decisión validada): clave 'YYYY-MM', label
// 'julio 2026' y límites del mes calendario local como instantes ISO.
export function periodoActual(now: Date): { clave: string; label: string; desde: string; hasta: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    clave: `${y}-${String(m + 1).padStart(2, '0')}`,
    label: `${MESES[m]} ${y}`,
    desde: new Date(y, m, 1).toISOString(),
    hasta: new Date(y, m + 1, 1).toISOString(),
  };
}

// Instante "hace N días" (medianoche local de ese día).
function haceDias(now: Date, dias: number): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dias).getTime();
}

function precision(rs: { correcta: boolean }[]): number | null {
  if (!rs.length) return null;
  return Math.round((100 * rs.filter((r) => r.correcta).length) / rs.length);
}

// Días de calendario desde `fecha` hasta `now`.
function diasDesde(fecha: string, now: Date): number {
  const f = new Date(fecha);
  const startF = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
  return Math.round((haceDias(now, 0) - startF) / 86_400_000);
}

function base(a: AlumnoLuna): Pick<Alerta, 'alumnoId' | 'alumnoNombre' | 'avatar' | 'grado'> {
  return { alumnoId: a.id, alumnoNombre: a.nombre, avatar: a.avatar ?? 'fox', grado: a.grado ?? 0 };
}

// Inactividad: practicó alguna vez pero hace ≥5 días que no (media) o ≥10 (alta).
// Nunca practicó → 'sin_arrancar' como info honesta, sin dramatizar.
export function detectarInactividad(a: AlumnoLuna, sesiones: SesionLuna[], now: Date): Alerta | null {
  if (!sesiones.length) {
    return {
      ...base(a), tipo: 'sin_arrancar', prioridad: 'info', positiva: false,
      detalle: 'Todavía no practicó con SOL.',
      sugerencia: 'Acompañalo en su primera práctica para que arranque con confianza.',
    };
  }
  let ultima = sesiones[0].fecha;
  for (const s of sesiones) if (s.fecha > ultima) ultima = s.fecha;
  const dias = diasDesde(ultima, now);
  if (dias < DIAS_INACTIVO_MEDIA) return null;
  const alta = dias >= DIAS_INACTIVO_ALTA;
  return {
    ...base(a), tipo: 'inactividad', prioridad: alta ? 'alta' : 'media', positiva: false,
    detalle: `Hace ${dias} días que no practica.`,
    sugerencia: alta
      ? 'Buscá un momento para retomar juntos con una práctica corta de repaso.'
      : 'Invitalo a una práctica corta para no perder el ritmo.',
  };
}

// Caída de precisión por tema: últimos 7 días vs los 14 anteriores, ambas
// ventanas con muestra mínima y caída ≥25 puntos. Devuelve la peor caída.
export function detectarCaidaPrecision(
  a: AlumnoLuna,
  respuestas: RespuestaLuna[],
  nodos: NodoLuna[],
  now: Date,
): Alerta | null {
  const corteReciente = haceDias(now, VENTANA_RECIENTE_DIAS);
  const cortePrevio = haceDias(now, VENTANA_RECIENTE_DIAS + VENTANA_PREVIA_DIAS);
  const porNodo = new Map<string, { rec: RespuestaLuna[]; prev: RespuestaLuna[] }>();
  for (const r of respuestas) {
    if (r.alumnoId !== a.id) continue;
    const t = new Date(r.createdAt).getTime();
    const g = porNodo.get(r.nodoId) ?? { rec: [], prev: [] };
    if (t >= corteReciente) g.rec.push(r);
    else if (t >= cortePrevio) g.prev.push(r);
    porNodo.set(r.nodoId, g);
  }
  let peor: { nodoId: string; antes: number; ahora: number } | null = null;
  for (const [nodoId, g] of porNodo) {
    if (g.rec.length < MIN_MUESTRA_PRECISION || g.prev.length < MIN_MUESTRA_PRECISION) continue;
    const antes = precision(g.prev)!;
    const ahora = precision(g.rec)!;
    if (antes - ahora < CAIDA_PUNTOS) continue;
    if (!peor || antes - ahora > peor.antes - peor.ahora) peor = { nodoId, antes, ahora };
  }
  if (!peor) return null;
  const nombre = nodos.find((n) => n.id === peor!.nodoId)?.nombre ?? 'un tema';
  return {
    ...base(a), tipo: 'caida_precision', prioridad: 'alta', positiva: false,
    detalle: `Bajó la precisión en ${nombre}: ${peor.antes}% → ${peor.ahora}%.`,
    sugerencia: `Repasá ${nombre} con él en persona; algo de lo nuevo no le está cerrando.`,
  };
}

// Evitación de tipo: en 14 días respondió bastante (≥12) pero NADA de 'producir'
// (el tipo que exige generar la respuesta, no solo reconocerla).
export function detectarEvitaTipo(a: AlumnoLuna, respuestas: RespuestaLuna[], now: Date): Alerta | null {
  const corte = haceDias(now, VENTANA_EVITA_DIAS);
  const rs = respuestas.filter((r) => r.alumnoId === a.id && new Date(r.createdAt).getTime() >= corte);
  if (rs.length < MIN_MUESTRA_EVITA) return null;
  if (rs.some((r) => r.tipo === TIPO_EVITADO)) return null;
  return {
    ...base(a), tipo: 'evita_tipo', prioridad: 'media', positiva: false,
    detalle: `Viene esquivando los ejercicios de ${TIPO_EVITADO} (${rs.length} respuestas sin ninguno).`,
    sugerencia: `Proponele en el aula una consigna corta de ${TIPO_EVITADO}, con vos al lado.`,
  };
}

// Adelantado (señal positiva): más de la mitad de sus nodos dominados y ninguno
// a reforzar.
export function detectarAdelantado(a: AlumnoLuna, nodosAlumno: NodoAlumnoLuna[]): Alerta | null {
  const mios = nodosAlumno.filter((n) => n.alumno_id === a.id);
  if (!mios.length) return null;
  if (mios.some((n) => n.estado === 'a_reforzar')) return null;
  const dominados = mios.filter((n) => n.estado === 'dominado').length;
  if (dominados <= mios.length / 2) return null;
  return {
    ...base(a), tipo: 'adelantado', prioridad: 'info', positiva: true,
    detalle: `Va muy bien: dominó ${dominados} de ${mios.length} temas.`,
    sugerencia: 'Dale material de enriquecimiento o proponele ayudar a un compañero.',
  };
}

const ORDEN_PRIORIDAD: Prioridad[] = ['alta', 'media', 'info'];

// Corre todos los detectores por alumno y ordena: alta → media → info, con las
// señales positivas al final. Aula vacía → lista vacía (nunca inventa).
export function alertasAula(
  alumnos: AlumnoLuna[],
  sesiones: SesionLuna[],
  respuestas: RespuestaLuna[],
  nodosAlumno: NodoAlumnoLuna[],
  nodos: NodoLuna[],
  now: Date,
): Alerta[] {
  const alertas: Alerta[] = [];
  for (const a of alumnos) {
    const susSesiones = sesiones.filter((s) => s.alumno_id === a.id);
    for (const al of [
      detectarInactividad(a, susSesiones, now),
      detectarCaidaPrecision(a, respuestas, nodos, now),
      detectarEvitaTipo(a, respuestas, now),
      detectarAdelantado(a, nodosAlumno),
    ]) if (al) alertas.push(al);
  }
  return alertas.sort((x, y) => {
    const px = ORDEN_PRIORIDAD.indexOf(x.prioridad) * 2 + (x.positiva ? 1 : 0);
    const py = ORDEN_PRIORIDAD.indexOf(y.prioridad) * 2 + (y.positiva ? 1 : 0);
    return px - py;
  });
}

export type MetricasAula = { activosSemana: number; ejerciciosSemana: number; progresoPct: number; alertasAbiertas: number };

// Métricas de la cabecera. `nodosEsperados` = Σ por alumno de los nodos de su
// grado (lo calcula el componente, que conoce programa.grado); 0 → progreso 0.
// "Abiertas" = alta + media (las info no piden acción).
export function metricasAula(
  alumnos: AlumnoLuna[],
  sesiones: SesionLuna[],
  nodosAlumno: NodoAlumnoLuna[],
  nodosEsperados: number,
  alertas: Alerta[],
  now: Date,
): MetricasAula {
  const corte = haceDias(now, 7);
  const semana = sesiones.filter((s) => new Date(s.fecha).getTime() >= corte);
  const dominados = nodosAlumno.filter((n) => n.estado === 'dominado').length;
  return {
    activosSemana: new Set(semana.map((s) => s.alumno_id)).size,
    ejerciciosSemana: semana.reduce((acc, s) => acc + (s.total ?? 0), 0),
    progresoPct: nodosEsperados > 0 ? Math.round((100 * dominados) / nodosEsperados) : 0,
    alertasAbiertas: alertas.filter((a) => a.prioridad !== 'info').length,
  };
}

// Código de error de las Edge Functions de LUNA → copy cálido para la seño
// (patrón mensajeErrorSol de autoria.ts).
export function mensajeErrorLuna(codigo: string | undefined): string {
  switch (codigo) {
    case 'sin_actividad':
      return 'Todavía no practicó en este período, así que no hay datos para un boletín honesto.';
    case 'boletin_ya_aprobado':
      return 'El boletín de este período ya está aprobado. Si querés cambiarlo, usá «Corregir».';
    case 'tope_diario_boletin':
      return 'Por hoy LUNA ya escribió mucho 🌙 Mañana podés seguir generando boletines.';
    case 'tope_diario_chat':
      return 'Por hoy charlamos bastante 🌙 Mañana LUNA te espera de nuevo.';
    case 'falta_anthropic_api_key':
      return 'Falta configurar la clave de LUNA en el servidor. Avisale al equipo.';
    case 'timeout':
      return 'LUNA tardó demasiado. Fijate la conexión y probá de nuevo.';
    default:
      return 'LUNA no pudo responder ahora. Probá de nuevo en un ratito.';
  }
}

export type ResumenAula = {
  temaMasTrabajado: string | null;
  temaMasDificil: string | null;
  boletinesPendientes: number;
  hito: string | null;
};

const MIN_MUESTRA_DIFICIL = 8; // respuestas mínimas para señalar un tema difícil

// Resumen del aula: tema con más sesiones (14 días), tema con peor precisión
// (con muestra mínima), boletines del mes que faltan aprobar y próximo hito.
export function resumenAula(
  sesiones: SesionLuna[],
  respuestas: RespuestaLuna[],
  nodos: NodoLuna[],
  boletines: BoletinLite[],
  alumnos: AlumnoLuna[],
  now: Date,
): ResumenAula {
  const corte = haceDias(now, 14);
  const nombreDe = (id: string) => nodos.find((n) => n.id === id)?.nombre ?? null;

  const sesionesPorNodo = new Map<string, number>();
  for (const s of sesiones) {
    if (new Date(s.fecha).getTime() < corte) continue;
    sesionesPorNodo.set(s.nodo_id, (sesionesPorNodo.get(s.nodo_id) ?? 0) + 1);
  }
  let masTrabajado: string | null = null;
  let maxSes = 0;
  for (const [id, n] of sesionesPorNodo) if (n > maxSes) { maxSes = n; masTrabajado = id; }

  const respPorNodo = new Map<string, { ok: number; total: number }>();
  for (const r of respuestas) {
    if (new Date(r.createdAt).getTime() < corte) continue;
    const g = respPorNodo.get(r.nodoId) ?? { ok: 0, total: 0 };
    g.total += 1;
    if (r.correcta) g.ok += 1;
    respPorNodo.set(r.nodoId, g);
  }
  let masDificil: string | null = null;
  let peor = 101;
  for (const [id, g] of respPorNodo) {
    if (g.total < MIN_MUESTRA_DIFICIL) continue;
    const p = Math.round((100 * g.ok) / g.total);
    if (p < peor) { peor = p; masDificil = id; }
  }

  const aprobados = new Set(boletines.filter((b) => b.estado === 'aprobado').map((b) => b.alumno_id));
  const periodo = periodoActual(now);
  return {
    temaMasTrabajado: masTrabajado ? nombreDe(masTrabajado) : null,
    temaMasDificil: masDificil ? nombreDe(masDificil) : null,
    boletinesPendientes: alumnos.filter((a) => !aprobados.has(a.id)).length,
    hito: alumnos.length ? `Cierre de boletines de ${periodo.label}` : null,
  };
}
