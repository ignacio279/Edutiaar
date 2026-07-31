// Lógica PURA de luna-boletin: evidencia resumida, prompt y parseo del JSON.
// Sin Deno, sin red → unit-testeable desde Node (tests/unit/luna-boletin.test.mjs).
//
// Spec de prompts 2026-07-31: system fijo (SYSTEM_BOLETIN) + bloque
// <datos_del_alumno> con datos YA PROCESADOS (el backend traduce — precisiones,
// evoluciones, rachas — el modelo no calcula). Salida: JSON crudo validado por
// parseBoletin, con UN retry si no parsea (patrón generador-ejercicios).
// A la API van datos mínimos: nombre de pila, grado y desempeño (Regla 5).
// LUNA propone, la docente decide: esto genera BORRADORES, nunca aprueba.

export type SesionBol = { nodo_id: string; fecha: string; aciertos?: number | null; total?: number | null };
export type RespuestaBol = { nodoId: string; tipo: string; correcta: boolean; createdAt: string; reintentos?: number };
export type NodoBol = { id: string; nombre: string; programa_id: string };
export type MateriaBol = { nombre: string; programa_id: string };

export type Evolucion = 'mejoró' | 'estable' | 'bajó' | 'sin datos suficientes';

export type TemaResumen = {
  materia: string;
  tema: string;
  cantidad: number;
  precision: number | null;
  evolucion: Evolucion;
  observaciones: string[];
};

export type ActividadAlumno = {
  nombre: string;
  grado: number;
  periodoLabel: string;
  fechaInicio: string;
  fechaFin: string;
  diasActivos: number;
  diasHabiles: number;
  rachaMaxima: number;
  totalEjercicios: number;
  totalSesiones: number;
  temas: TemaResumen[];
  comparacionAnterior: string;
  alertasPeriodo: string[];
};

export type ContenidoBoletin = {
  secciones: { titulo: string; texto: string }[];
  actitud: string;
  sugerencia_proximo_periodo: string;
};

// System prompt FIJO del boletín (spec del usuario, verbatim).
export const SYSTEM_BOLETIN = `Sos LUNA, asistente pedagógica de EDUTIA. Tu tarea es redactar el BORRADOR
del boletín de un alumno para que su maestra lo revise, lo ajuste y lo
apruebe. El destinatario final del texto es la familia del alumno.

Reglas de contenido:

1. EVIDENCIA OBLIGATORIA: cada afirmación debe surgir de los datos del
   período que recibís abajo. Prohibido inventar logros, dificultades,
   anécdotas o actitudes que no estén respaldadas por los datos. Si para
   alguna sección no hay datos suficientes, escribí una observación breve y
   honesta (ej: "En este período hubo poca actividad registrada en esta
   área") en lugar de rellenar.
2. Tono: cálido, constructivo, profesional y cercano. Español rioplatense.
   Lenguaje llano: la familia puede tener cualquier nivel educativo. Nada de
   jerga técnica ni porcentajes crudos; traducí los datos a observaciones
   pedagógicas ("resolvió con seguridad los problemas de suma" en vez de
   "82% de precisión").
3. Estructura de cada dificultad: siempre en clave de proceso y próximo
   paso. Primero qué logró, después qué está en construcción, y cómo se lo
   va a acompañar. Nunca en clave de déficit del chico.
4. No compares al alumno con sus compañeros ni con promedios del aula.
   Compará solo contra su propio recorrido.
5. No menciones datos sensibles, situaciones familiares ni nada externo al
   aprendizaje.
6. Nombrá al alumno por su nombre de pila.
7. Longitud: cada sección entre 40 y 80 palabras. Boletín completo legible
   en 2 minutos.

Formato de salida: respondé ÚNICAMENTE con un JSON válido, sin texto antes
ni después, sin markdown, con esta forma exacta:

{
  "secciones": [
    { "titulo": "...", "texto": "..." }
  ],
  "actitud": "...",
  "sugerencia_proximo_periodo": "..."
}

Incluí una sección por cada materia presente en los datos. "actitud" resume
la disposición del alumno frente al aprendizaje (constancia, reacción al
error, autonomía) según los datos. "sugerencia_proximo_periodo" propone 1 o 2
focos concretos de acompañamiento.`;

// Pedido del retry único cuando la primera respuesta no parseó (spec: "si
// falla, reintentá una vez pidiendo solo el JSON corregido").
export const PROMPT_REINTENTO_JSON =
  'La respuesta anterior no fue un JSON válido con el esquema pedido. Respondé ahora ÚNICAMENTE con el JSON corregido, sin ningún otro texto.';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Período MENSUAL (decisión validada). Duplicado a propósito de web/lib/luna.ts:
// los módulos puros no se importan entre árboles (Next quiere import sin
// extensión; node --test la quiere con .ts). Un test cruzado verifica que
// coincidan.
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

// 'YYYY-MM' → mismo shape que periodoActual. Clave inválida → null.
export function periodoDesdeClave(clave: string): { clave: string; label: string; desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(clave ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return {
    clave,
    label: `${MESES[mes - 1]} ${y}`,
    desde: new Date(y, mes - 1, 1).toISOString(),
    hasta: new Date(y, mes, 1).toISOString(),
  };
}

// Clave del mes anterior a una clave 'YYYY-MM' ('2026-01' → '2025-12').
export function claveAnterior(clave: string): string | null {
  const p = periodoDesdeClave(clave);
  if (!p) return null;
  const [y, m] = clave.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function precision(rs: { correcta: boolean }[]): number | null {
  if (!rs.length) return null;
  return Math.round((100 * rs.filter((r) => r.correcta).length) / rs.length);
}

const diaLocal = (iso: string) => {
  const f = new Date(iso);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate());
};

// Días hábiles (lun–vie) del período [desde, hasta).
export function diasHabilesDelPeriodo(desde: string, hasta: string): number {
  let n = 0;
  for (let d = diaLocal(desde); d < new Date(hasta); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return n;
}

// Máxima cantidad de días de calendario CONSECUTIVOS con práctica.
export function rachaMaxima(fechas: string[]): number {
  const dias = [...new Set(fechas.map((f) => diaLocal(f).getTime()))].sort((a, b) => a - b);
  let max = 0;
  let actual = 0;
  let previo: number | null = null;
  for (const d of dias) {
    actual = previo !== null && d - previo === 86_400_000 ? actual + 1 : 1;
    if (actual > max) max = actual;
    previo = d;
  }
  return max;
}

const MIN_MITAD = 4; // respuestas mínimas por quincena para hablar de evolución
const UMBRAL_EVOLUCION = 10; // puntos de precisión

// Evolución del tema dentro del período: 2ª quincena vs 1ª.
export function evolucionTema(rs: RespuestaBol[], desde: string, hasta: string): Evolucion {
  const medio = (new Date(desde).getTime() + new Date(hasta).getTime()) / 2;
  const m1 = rs.filter((r) => new Date(r.createdAt).getTime() < medio);
  const m2 = rs.filter((r) => new Date(r.createdAt).getTime() >= medio);
  if (m1.length < MIN_MITAD || m2.length < MIN_MITAD) return 'sin datos suficientes';
  const dif = precision(m2)! - precision(m1)!;
  if (dif >= UMBRAL_EVOLUCION) return 'mejoró';
  if (dif <= -UMBRAL_EVOLUCION) return 'bajó';
  return 'estable';
}

const MIN_EVITA_TEMA = 8; // respuestas del tema para hablar de evitación
const MIN_FALLADAS_REINTENTO = 3;

// Observaciones de comportamiento del tema (spec: "evita el tema, reintenta
// tras el error, etc."), derivadas SOLO de los datos.
export function observacionesTema(rs: RespuestaBol[]): string[] {
  const obs: string[] = [];
  if (rs.length >= MIN_EVITA_TEMA && !rs.some((r) => r.tipo === 'producir')) {
    obs.push('evita los ejercicios de producir');
  }
  const falladas = rs.filter((r) => !r.correcta);
  if (falladas.length >= MIN_FALLADAS_REINTENTO) {
    const conReintento = falladas.filter((r) => (r.reintentos ?? 0) > 0).length;
    if (conReintento / falladas.length >= 0.5) obs.push('reintenta tras el error');
  }
  return obs;
}

// Comparación intra-alumno con el mes anterior (nunca contra compañeros).
export function compararPeriodos(
  actual: { sesiones: number; precision: number | null },
  anterior: { sesiones: number; precision: number | null } | null,
  labelAnterior: string | null,
): string {
  if (!anterior || anterior.sesiones === 0) return 'Primer período con actividad registrada; todavía no hay período anterior para comparar.';
  const partes: string[] = [];
  if (actual.sesiones > anterior.sesiones) partes.push(`practicó más que en ${labelAnterior} (${actual.sesiones} vs ${anterior.sesiones} sesiones)`);
  else if (actual.sesiones < anterior.sesiones) partes.push(`practicó menos que en ${labelAnterior} (${actual.sesiones} vs ${anterior.sesiones} sesiones)`);
  else partes.push(`mantuvo el ritmo de práctica de ${labelAnterior} (${actual.sesiones} sesiones)`);
  if (actual.precision !== null && anterior.precision !== null) {
    const dif = actual.precision - anterior.precision;
    if (dif >= UMBRAL_EVOLUCION) partes.push('su precisión subió');
    else if (dif <= -UMBRAL_EVOLUCION) partes.push('su precisión bajó');
    else partes.push('su precisión se mantuvo estable');
  }
  return `${partes.join(' y ')}.`;
}

// Colapsa la actividad cruda del período en el bloque compacto de evidencia.
export function resumirActividad(
  nombre: string,
  grado: number,
  periodo: { label: string; desde: string; hasta: string },
  sesiones: SesionBol[],
  respuestas: RespuestaBol[],
  nodos: NodoBol[],
  materias: MateriaBol[],
  anterior: { sesiones: SesionBol[]; respuestas: RespuestaBol[]; label: string } | null = null,
): ActividadAlumno {
  const rsPorNodo = new Map<string, RespuestaBol[]>();
  for (const r of respuestas) {
    const g = rsPorNodo.get(r.nodoId) ?? [];
    g.push(r);
    rsPorNodo.set(r.nodoId, g);
  }
  const materiaDe = new Map(materias.map((m) => [m.programa_id, m.nombre]));

  const temas: TemaResumen[] = nodos
    .map((n) => {
      const rs = rsPorNodo.get(n.id) ?? [];
      return {
        materia: materiaDe.get(n.programa_id) ?? 'Materia',
        tema: n.nombre,
        cantidad: rs.length,
        precision: precision(rs),
        evolucion: evolucionTema(rs, periodo.desde, periodo.hasta),
        observaciones: observacionesTema(rs),
      };
    })
    .filter((t) => t.cantidad > 0);

  const alertasPeriodo: string[] = [];
  for (const t of temas) {
    if (t.evolucion === 'bajó') alertasPeriodo.push(`Bajó la precisión en ${t.tema} durante el período.`);
    if (t.observaciones.includes('evita los ejercicios de producir')) alertasPeriodo.push(`Evitó los ejercicios de producir en ${t.tema}.`);
  }

  const finVisible = new Date(new Date(periodo.hasta).getTime() - 86_400_000);
  const fmt = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

  return {
    nombre, grado,
    periodoLabel: periodo.label,
    fechaInicio: fmt(diaLocal(periodo.desde)),
    fechaFin: fmt(finVisible),
    diasActivos: new Set(sesiones.map((s) => diaLocal(s.fecha).getTime())).size,
    diasHabiles: diasHabilesDelPeriodo(periodo.desde, periodo.hasta),
    rachaMaxima: rachaMaxima(sesiones.map((s) => s.fecha)),
    totalEjercicios: respuestas.length,
    totalSesiones: sesiones.length,
    temas,
    comparacionAnterior: compararPeriodos(
      { sesiones: sesiones.length, precision: precision(respuestas) },
      anterior ? { sesiones: anterior.sesiones.length, precision: precision(anterior.respuestas) } : null,
      anterior?.label ?? null,
    ),
    alertasPeriodo,
  };
}

// Serializa la evidencia en el bloque <datos_del_alumno> del spec: es lo único
// que el modelo sabe del alumno.
export function serializarActividad(d: ActividadAlumno): string {
  const lineas = [
    '<datos_del_alumno>',
    `Alumno: ${d.nombre} — ${d.grado}° grado`,
    `Período: ${d.periodoLabel} (del ${d.fechaInicio} al ${d.fechaFin})`,
    '',
    'Actividad del período:',
    `- Días activos: ${d.diasActivos} de ${d.diasHabiles} hábiles — racha máxima: ${d.rachaMaxima} ${d.rachaMaxima === 1 ? 'día' : 'días'} seguidos`,
    `- Ejercicios resueltos: ${d.totalEjercicios} (en ${d.totalSesiones} sesiones)`,
    '',
    'Desempeño por materia y tema:',
  ];
  if (d.temas.length) {
    for (const t of d.temas) {
      const partes = [`- ${t.materia} — ${t.tema}: ${t.cantidad} ejercicios`, `precisión ${t.precision === null ? 'sin datos' : `${t.precision}%`}`, `evolución: ${t.evolucion}`];
      if (t.observaciones.length) partes.push(`observaciones: ${t.observaciones.join(', ')}`);
      lineas.push(partes.join(', '));
    }
  } else {
    lineas.push('Sin actividad registrada por tema en este período.');
  }
  lineas.push('');
  lineas.push('Comparación con el período anterior (solo del propio alumno):');
  lineas.push(d.comparacionAnterior);
  lineas.push('');
  lineas.push('Alertas del período (si hubo):');
  lineas.push(d.alertasPeriodo.length ? d.alertasPeriodo.map((a) => `- ${a}`).join('\n') : 'Sin alertas en el período.');
  lineas.push('</datos_del_alumno>');
  return lineas.join('\n');
}

export function construirPromptBoletin(d: ActividadAlumno): { system: string; user: string } {
  return { system: SYSTEM_BOLETIN, user: serializarActividad(d) };
}

// Recorta el JSON de la respuesta (del primer { al último }) y parsea.
// Inválido → null, nunca tira (patrón generador-ejercicios).
export function extraerJson(texto: string): unknown | null {
  const desde = texto.indexOf('{');
  const hasta = texto.lastIndexOf('}');
  if (desde < 0 || hasta <= desde) return null;
  try {
    return JSON.parse(texto.slice(desde, hasta + 1));
  } catch {
    return null;
  }
}

// Valida/coacciona al esquema del spec. Nunca tira: defaults vacíos y descarta
// secciones malformadas (esBoletinValido decide después si amerita retry).
export function parseBoletin(input: unknown): ContenidoBoletin {
  const o = (input ?? {}) as Record<string, unknown>;
  const secciones = Array.isArray(o.secciones)
    ? (o.secciones as Record<string, unknown>[])
        .map((s) => ({ titulo: String(s?.titulo ?? '').trim(), texto: String(s?.texto ?? '').trim() }))
        .filter((s) => s.titulo && s.texto)
    : [];
  return {
    secciones,
    actitud: String(o.actitud ?? '').trim(),
    sugerencia_proximo_periodo: String(o.sugerencia_proximo_periodo ?? '').trim(),
  };
}

// ¿La salida alcanza para mostrar un borrador? (decide el retry único)
export function esBoletinValido(c: ContenidoBoletin): boolean {
  return c.secciones.length > 0 && c.actitud.length > 0 && c.sugerencia_proximo_periodo.length > 0;
}
