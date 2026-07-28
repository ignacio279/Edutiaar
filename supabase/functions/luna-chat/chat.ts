// Lógica PURA del chat con LUNA (copiloto de la docente). Sin Deno, sin red →
// unit-testeable desde Node (tests/unit/luna-chat.test.mjs), igual que sol-chat.
//
// A diferencia de sol-chat (chat efímero de menores, Regla 5), el hilo de LUNA
// se persiste en luna_mensaje: es la conversación de la seño y necesita
// continuidad entre sesiones. El system lleva el contexto REAL del aula
// (datos mínimos: nombre de pila, grado, desempeño — nada de identificadores).

export type LunaMsg = { role: 'user' | 'luna'; content: string };

export type AlumnoCtx = {
  nombre: string;
  grado: number;
  estado: string;           // label ya humanizado ("en camino", "a reforzar"…)
  ultimaPractica: string | null; // "hace 3 días" / null si nunca
  precisionReciente: number | null;
};

export type ContextoAula = {
  docenteNombre: string;
  grados: number[];
  alumnos: AlumnoCtx[];
  alertas: { alumno: string; prioridad: string; detalle: string }[];
  programa: { materia: string; nodos: string[] }[];
  momento: string;
};

// Tope de costo (Regla 4): a Claude van solo los últimos `max` turnos. Más
// generoso que sol-chat (8): las consultas docentes hilan más largo.
export function recortarHistorial(msgs: LunaMsg[], max = 12): LunaMsg[] {
  return msgs.length > max ? msgs.slice(msgs.length - max) : msgs;
}

// La Messages API usa 'assistant'; en la DB el rol de LUNA es 'luna'.
export function aMensajesClaude(msgs: LunaMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  return msgs.map((m) => ({ role: m.role === 'luna' ? 'assistant' : 'user', content: m.content }));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Momento del ciclo lectivo argentino (marzo–diciembre), para que LUNA sitúe
// sus sugerencias ("estamos cerca del receso", "cierre de año", etc.).
export function momentoDelAnio(now: Date): string {
  const m = now.getMonth(); // 0-11
  const mes = `${MESES[m]} de ${now.getFullYear()}`;
  if (m === 0 || m === 1) return `${mes}, receso de verano (el ciclo lectivo arranca en marzo)`;
  if (m <= 4) return `${mes}, primera parte del ciclo lectivo`;
  if (m === 5 || m === 6) return `${mes}, mitad del ciclo lectivo (receso invernal cerca o en curso)`;
  if (m <= 9) return `${mes}, segunda parte del ciclo lectivo`;
  return `${mes}, cierre del ciclo lectivo`;
}

// System prompt: persona LUNA + guardrails + contexto real del aula.
export function construirSystemLuna(ctx: ContextoAula): string {
  const grados = ctx.grados.length ? ctx.grados.map((g) => `${g}°`).join(', ') : 'sin grados cargados';
  const lineas = [
    `Sos LUNA, copiloto pedagógico 24/7 de la docente ${ctx.docenteNombre} en una escuela primaria rural de Argentina.`,
    'La ayudás con planificación de clases, estrategias didácticas y la lectura del estado real de su aula.',
    'Respondé en español rioplatense, profesional y cercano, con sugerencias concretas y accionables, nunca genéricas.',
    'Escribí en texto plano, en párrafos cortos: nada de markdown, ni asteriscos, ni títulos, ni viñetas.',
    'Basate SOLO en el contexto del aula que sigue; si un dato no está, decilo con honestidad y no inventes.',
    'Si el aula todavía no tiene actividad registrada, decí que no hay datos aún en lugar de suponer.',
    `El aula es plurigrado: hay chicos de ${grados}. Si te pide planificar, proponé UN eje común y actividades en varios niveles de dificultad, un nivel por cada grado presente.`,
    'No hagas diagnósticos clínicos ni etiquetes chicos: hablá de señales observadas y de próximos pasos posibles.',
    'La decisión final es siempre de la docente: vos proponés.',
    `Momento del año: ${ctx.momento}.`,
  ];
  if (ctx.alumnos.length) {
    const filas = ctx.alumnos.map((a) => {
      const partes = [`${a.nombre} (${a.grado}°)`, a.estado];
      partes.push(a.ultimaPractica ? `última práctica ${a.ultimaPractica}` : 'todavía no practicó');
      if (a.precisionReciente !== null) partes.push(`precisión reciente ${a.precisionReciente}%`);
      return partes.join(', ');
    });
    lineas.push(`Alumnos del aula: ${filas.join(' · ')}.`);
  } else {
    lineas.push('El aula todavía no tiene alumnos cargados.');
  }
  lineas.push(
    ctx.alertas.length
      ? `Alertas activas: ${ctx.alertas.map((a) => `[${a.prioridad}] ${a.alumno}: ${a.detalle}`).join(' · ')}.`
      : 'Sin alertas activas.',
  );
  for (const p of ctx.programa) {
    lineas.push(`Programa de ${p.materia}: ${p.nodos.join(', ')}.`);
  }
  return lineas.join(' ');
}

// Limpia el markdown que Claude puede meter igual y separa en párrafos (a
// diferencia de sol-chat NO capea a 2 burbujas: la seño banca respuestas largas).
export function aParrafos(texto: string): string[] {
  const plano = texto
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '')
    // solo espacios de la MISMA línea antes de la viñeta: \s* se tragaría la
    // línea en blanco anterior y fundiría párrafos (bug heredado de aBurbujas).
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .trim();
  return plano.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// "hoy" / "ayer" / "hace N días" — misma fórmula que web/lib/panel.ts
// (duplicada a propósito: los módulos puros no se importan entre árboles).
export function haceCuanto(fecha: Date | string, now: Date): string {
  const f = new Date(fecha);
  const startF = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
  const startN = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dias = Math.round((startN - startF) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

// Sanea las alertas que manda el front (client-computed): tope y truncado.
export function sanearAlertas(input: unknown, maxItems = 10, maxLen = 200): { alumno: string; prioridad: string; detalle: string }[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, maxItems).map((a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const corta = (v: unknown) => String(v ?? '').slice(0, maxLen);
    return { alumno: corta(o.alumno), prioridad: corta(o.prioridad), detalle: corta(o.detalle) };
  }).filter((a) => a.detalle);
}
