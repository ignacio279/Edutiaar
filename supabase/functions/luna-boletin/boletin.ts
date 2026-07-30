// Lógica PURA de luna-boletin: resumen de evidencia, prompt y parseo de la tool.
// Sin Deno, sin red → unit-testeable desde Node (tests/unit/luna-boletin.test.mjs),
// igual que evaluar-sesion/diagnostico.ts.
//
// Regla pedagógica clave: el boletín va ANCLADO EN EVIDENCIA. El prompt le
// prohíbe a Claude inventar logros o dificultades que no estén en los datos, y
// a la API van datos mínimos: nombre de pila, grado y desempeño (Regla 5).
// LUNA propone, la docente decide: esto genera BORRADORES, nunca aprueba.

export type SesionBol = { nodo_id: string; fecha: string; aciertos?: number | null; total?: number | null };
export type RespuestaBol = { nodoId: string; tipo: string; correcta: boolean; createdAt: string };
export type NodoBol = { id: string; nombre: string; programa_id: string };
export type MateriaBol = { nombre: string; programa_id: string };
export type EstadoBol = { nodo_id: string; estado: string };

export type TemaResumen = { nombre: string; sesiones: number; precision: number | null; estado: string };

export type ActividadAlumno = {
  nombre: string;
  grado: number;
  periodoLabel: string;
  materias: { materia: string; temas: TemaResumen[] }[];
  evolucion: { mitad1: { sesiones: number; precision: number | null }; mitad2: { sesiones: number; precision: number | null } };
  diasPracticados: number;
  tipos: Record<string, number>;
  totalSesiones: number;
  totalRespuestas: number;
};

export type ContenidoBoletin = {
  materias: { materia: string; texto: string }[];
  actitud: string;
  sugerencia: string;
};

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

function precision(rs: { correcta: boolean }[]): number | null {
  if (!rs.length) return null;
  return Math.round((100 * rs.filter((r) => r.correcta).length) / rs.length);
}

// Colapsa la actividad cruda del período en el bloque compacto de evidencia que
// va al prompt. Solo primer nombre, grado y desempeño: nada de identificadores.
export function resumirActividad(
  nombre: string,
  grado: number,
  periodo: { label: string; desde: string; hasta: string },
  sesiones: SesionBol[],
  respuestas: RespuestaBol[],
  nodos: NodoBol[],
  materias: MateriaBol[],
  estados: EstadoBol[],
): ActividadAlumno {
  const rsPorNodo = new Map<string, RespuestaBol[]>();
  for (const r of respuestas) {
    const g = rsPorNodo.get(r.nodoId) ?? [];
    g.push(r);
    rsPorNodo.set(r.nodoId, g);
  }
  const sesPorNodo = new Map<string, number>();
  for (const s of sesiones) sesPorNodo.set(s.nodo_id, (sesPorNodo.get(s.nodo_id) ?? 0) + 1);
  const estadoDe = new Map(estados.map((e) => [e.nodo_id, e.estado]));

  const materiasOut = materias.map((m) => ({
    materia: m.nombre,
    temas: nodos
      .filter((n) => n.programa_id === m.programa_id)
      .map((n) => ({
        nombre: n.nombre,
        sesiones: sesPorNodo.get(n.id) ?? 0,
        precision: precision(rsPorNodo.get(n.id) ?? []),
        estado: estadoDe.get(n.id) ?? 'no_empezado',
      }))
      .filter((t) => t.sesiones > 0 || t.estado !== 'no_empezado'),
  }));

  const medio = (new Date(periodo.desde).getTime() + new Date(periodo.hasta).getTime()) / 2;
  const mitad = (filtro: (t: number) => boolean) => {
    const ses = sesiones.filter((s) => filtro(new Date(s.fecha).getTime()));
    const rs = respuestas.filter((r) => filtro(new Date(r.createdAt).getTime()));
    return { sesiones: ses.length, precision: precision(rs) };
  };

  const dias = new Set(sesiones.map((s) => {
    const f = new Date(s.fecha);
    return `${f.getFullYear()}-${f.getMonth()}-${f.getDate()}`;
  }));

  const tipos: Record<string, number> = {};
  for (const r of respuestas) tipos[r.tipo] = (tipos[r.tipo] ?? 0) + 1;

  return {
    nombre, grado, periodoLabel: periodo.label,
    materias: materiasOut,
    evolucion: { mitad1: mitad((t) => t < medio), mitad2: mitad((t) => t >= medio) },
    diasPracticados: dias.size,
    tipos,
    totalSesiones: sesiones.length,
    totalRespuestas: respuestas.length,
  };
}

const ESTADO_TXT: Record<string, string> = {
  no_empezado: 'sin empezar',
  en_construccion: 'en camino',
  a_reforzar: 'a reforzar',
  dominado: 'lo domina',
};

// Serializa la evidencia en líneas etiquetadas (un dato por línea): es lo único
// que Claude sabe del alumno.
export function serializarActividad(d: ActividadAlumno): string {
  const lineas = [
    `Alumno: ${d.nombre} (${d.grado}° grado). Período: ${d.periodoLabel}.`,
    `Práctica total del período: ${d.totalSesiones} sesiones en ${d.diasPracticados} días distintos, ${d.totalRespuestas} ejercicios respondidos.`,
  ];
  for (const m of d.materias) {
    if (!m.temas.length) { lineas.push(`${m.materia}: sin actividad registrada este período.`); continue; }
    lineas.push(`${m.materia}:`);
    for (const t of m.temas) {
      lineas.push(`- ${t.nombre}: ${t.sesiones} sesiones, precisión ${t.precision === null ? 'sin datos' : `${t.precision}%`}, estado "${ESTADO_TXT[t.estado] ?? t.estado}".`);
    }
  }
  const ev = (x: { sesiones: number; precision: number | null }) =>
    `${x.sesiones} sesiones${x.precision === null ? '' : ` con ${x.precision}% de aciertos`}`;
  lineas.push(`Evolución: primera mitad del mes ${ev(d.evolucion.mitad1)}; segunda mitad ${ev(d.evolucion.mitad2)}.`);
  const tipos = Object.entries(d.tipos).map(([t, n]) => `${t}: ${n}`).join(', ');
  if (tipos) lineas.push(`Ejercicios por tipo: ${tipos}.`);
  return lineas.join('\n');
}

// System prompt del boletín: persona LUNA + anclaje en evidencia + tono familia.
export function construirPromptBoletin(d: ActividadAlumno): { system: string; user: string } {
  const system = [
    'Sos LUNA, copiloto pedagógico de una docente de escuela primaria rural de Argentina.',
    'Vas a redactar el BORRADOR del boletín del período para la familia de un alumno; la docente lo revisa, lo edita si quiere y decide si lo aprueba.',
    'Escribí en español rioplatense cálido, constructivo y profesional, dirigido a la familia; nada infantilizado ni burocrático.',
    'Usá SOLO los datos de actividad que te paso: NO inventes logros, temas, anécdotas ni avances que no estén en los datos.',
    'Cada afirmación sobre el desempeño tiene que apoyarse en un dato concreto de los provistos (tema, precisión, evolución, constancia, cantidad de práctica).',
    'Si la actividad del período es poca, decilo con honestidad y en positivo, sin inflar ni dramatizar.',
    'Las dificultades se presentan como oportunidades de crecimiento, jamás como reproche al chico ni a la familia.',
    'Nada de jerga estadística ni tecnicismos: nombrá los temas tal como figuran en los datos y traducí los porcentajes a lenguaje cotidiano.',
    'Usá la herramienta escribir_boletin exactamente UNA vez: un texto por materia trabajada, un párrafo sobre la actitud frente al aprendizaje y una sugerencia concreta para el próximo período.',
  ].join(' ');
  return { system, user: serializarActividad(d) };
}

export const TOOL_ESCRIBIR_BOLETIN = {
  name: 'escribir_boletin',
  description: 'Guarda el borrador del boletín: un texto por materia, la actitud frente al aprendizaje y una sugerencia para el próximo período.',
  input_schema: {
    type: 'object',
    properties: {
      materias: {
        type: 'array',
        items: {
          type: 'object',
          properties: { materia: { type: 'string' }, texto: { type: 'string' } },
          required: ['materia', 'texto'],
        },
      },
      actitud: { type: 'string' },
      sugerencia: { type: 'string' },
    },
    required: ['materias', 'actitud', 'sugerencia'],
  },
};

// Valida la salida estructurada (el schema es el contrato con la DB). Nunca
// tira: defaults vacíos y descarta materias malformadas.
export function parseBoletin(input: unknown): ContenidoBoletin {
  const o = (input ?? {}) as Record<string, unknown>;
  const materias = Array.isArray(o.materias)
    ? (o.materias as Record<string, unknown>[])
        .map((m) => ({ materia: String(m?.materia ?? '').trim(), texto: String(m?.texto ?? '').trim() }))
        .filter((m) => m.materia && m.texto)
    : [];
  return {
    materias,
    actitud: String(o.actitud ?? '').trim(),
    sugerencia: String(o.sugerencia ?? '').trim(),
  };
}
