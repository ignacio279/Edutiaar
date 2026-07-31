// Lógica PURA del chat con LUNA (copiloto de la docente). Sin Deno, sin red →
// unit-testeable desde Node (tests/unit/luna-chat.test.mjs), igual que sol-chat.
//
// A diferencia de sol-chat (chat efímero de menores, Regla 5), el hilo de LUNA
// se persiste en luna_mensaje: es la conversación de la seño y necesita
// continuidad entre sesiones. El system = SYSTEM_CHAT (fijo, spec del usuario
// 2026-07-31) + bloque <contexto_del_aula> con datos YA PROCESADOS por el
// backend (datos mínimos: nombre de pila, grado, desempeño — nada de
// identificadores). El backend traduce, el modelo no calcula.

export type LunaMsg = { role: 'user' | 'luna'; content: string };

export type AlumnoCtx = {
  nombre: string;
  grado: number;
  estado: string;           // label ya humanizado ("en camino", "a reforzar"…)
  ultimaPractica: string | null; // "hace 3 días" / null si nunca
  precisionReciente: number | null;
  fortalezas: string[];     // nodos dominados (nombres)
  dificultades: string[];   // nodos a reforzar (nombres)
};

export type MateriaCtx = { nombre: string; avancePct: number; contenidos: string[] };

export type ContextoAula = {
  docenteNombre: string;
  fecha: string;            // "28 de julio de 2026"
  tipoEscuela: string;      // "rural, zona Neuquén, Patagonia"
  gradosConCantidad: { grado: number; cantidad: number }[];
  materias: MateriaCtx[];
  hitos: string;
  alumnos: AlumnoCtx[];
  alertas: { alumno: string; prioridad: string; detalle: string }[];
  momento: string;
};

// System prompt FIJO del chat (spec del usuario, verbatim).
export const SYSTEM_CHAT = `Sos LUNA, la copiloto pedagógica de una maestra dentro de EDUTIA, una
plataforma educativa para escuelas rurales argentinas. Muchas de estas aulas
son plurigrado: una sola docente enseña a chicos de varios grados a la vez.

Tu rol es el de una colega experimentada y cercana: ayudás a planificar
clases, sugerís estrategias didácticas, respondés dudas pedagógicas y ayudás
a interpretar cómo viene cada alumno. Hablás en español rioplatense, con tono
cálido, práctico y directo. Sos concreta: la maestra suele consultarte con
poco tiempo, muchas veces minutos antes de entrar al aula.

Reglas:

1. Basate SIEMPRE en el contexto real del aula que recibís abajo. Si te
   preguntan por un alumno o dato que no está en el contexto, decilo
   honestamente y pedí la información; no inventes.
2. Vos proponés, la maestra decide. Ofrecé opciones y fundamentos, nunca
   impongas. Ella es la autoridad pedagógica.
3. Si el aula es plurigrado y te piden planificar, proponé actividades con
   UN eje temático común y niveles de dificultad diferenciados por grado,
   para que toda el aula trabaje junta y cada chico a su altura.
4. Asumí recursos limitados: proponé actividades realizables con materiales
   simples y sin depender de conectividad, salvo que la maestra diga lo
   contrario.
5. Respuestas cortas por defecto (el equivalente a un mensaje de WhatsApp
   largo). Ofrecé profundizar en vez de escribir de más. Usá listas solo
   cuando ayudan de verdad.
6. Alineá tus sugerencias al programa curricular del contexto cuando sea
   relevante, y decí a qué contenido corresponden.
7. No hagas diagnósticos médicos ni psicológicos sobre ningún alumno. Si la
   maestra plantea una situación que excede lo pedagógico (posible problema
   de salud, situación familiar grave, indicios de maltrato), acompañala con
   respeto y recomendale los canales que correspondan (equipo de orientación,
   supervisión, profesionales de salud). No especules.
8. Nunca hables mal de un alumno ni de una familia. Las dificultades se
   describen como desafíos de aprendizaje, no como defectos del chico.
9. No compartas ni compares datos de un alumno con los de otro salvo que la
   maestra lo pida explícitamente para decisiones de enseñanza.
10. Si una consulta se sale por completo de tu rol pedagógico, redirigila
    con amabilidad a lo que sí podés hacer.`;

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

export function fechaLarga(now: Date): string {
  return `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
}

// Momento del ciclo lectivo argentino en clave de CUATRIMESTRES (formato del
// spec: "octubre, último tramo del 2° cuatrimestre"). 1er cuatrimestre
// mar–jul, 2° ago–dic, ene–feb receso.
export function momentoDelAnio(now: Date): string {
  const m = now.getMonth(); // 0-11
  const mes = MESES[m];
  if (m === 0 || m === 1) return `${mes}, receso de verano (el ciclo lectivo arranca en marzo)`;
  if (m <= 3) return `${mes}, primer tramo del 1er cuatrimestre`;
  if (m <= 5) return `${mes}, mitad del 1er cuatrimestre`;
  if (m === 6) return `${mes}, último tramo del 1er cuatrimestre (receso invernal cerca)`;
  if (m <= 8) return `${mes}, primer tramo del 2° cuatrimestre`;
  return `${mes}, último tramo del 2° cuatrimestre`;
}

// Bloque <contexto_del_aula> con datos ya procesados. Aula vacía → líneas
// honestas ("todavía no hay…"), nunca inventadas.
export function construirContextoAula(ctx: ContextoAula): string {
  const lineas: string[] = ['<contexto_del_aula>'];
  lineas.push(`Fecha: ${ctx.fecha} — ${ctx.momento}`);
  lineas.push(`Escuela: ${ctx.tipoEscuela}`);
  lineas.push(
    ctx.gradosConCantidad.length
      ? `Grados presentes: ${ctx.gradosConCantidad.map((g) => `${g.grado}° (${g.cantidad})`).join(', ')}`
      : 'Grados presentes: todavía no hay alumnos cargados',
  );
  if (ctx.materias.length) {
    for (const m of ctx.materias) {
      lineas.push(`Materia y programa: ${m.nombre} — avance ${m.avancePct}%. Contenidos en curso: ${m.contenidos.length ? m.contenidos.join(', ') : 'sin actividad todavía'}`);
    }
  } else {
    lineas.push('Materia y programa: todavía no hay materias publicadas');
  }
  lineas.push(`Próximos hitos: ${ctx.hitos}`);
  lineas.push('');
  lineas.push('Estado de los alumnos (resumen por alumno):');
  if (ctx.alumnos.length) {
    for (const a of ctx.alumnos) {
      const partes = [`- ${a.nombre} (${a.grado}°): ${a.estado}`];
      partes.push(a.ultimaPractica ? `última práctica ${a.ultimaPractica}` : 'todavía no practicó');
      if (a.precisionReciente !== null) partes.push(`precisión reciente ${a.precisionReciente}%`);
      if (a.fortalezas.length) partes.push(`fortalezas: ${a.fortalezas.join(', ')}`);
      if (a.dificultades.length) partes.push(`dificultades actuales: ${a.dificultades.join(', ')}`);
      const suyas = ctx.alertas.filter((al) => al.alumno === a.nombre);
      if (suyas.length) partes.push(`alertas: ${suyas.map((al) => al.detalle).join(' / ')}`);
      lineas.push(partes.join('; '));
    }
  } else {
    lineas.push('Todavía no hay alumnos cargados en el aula.');
  }
  lineas.push('');
  lineas.push('Alertas abiertas hoy:');
  lineas.push(
    ctx.alertas.length
      ? ctx.alertas.map((al) => `- [${al.prioridad}] ${al.alumno}: ${al.detalle}`).join('\n')
      : 'Sin alertas abiertas.',
  );
  lineas.push('');
  lineas.push('Últimas planificaciones trabajadas con LUNA:');
  lineas.push('Todavía no hay planificaciones registradas con LUNA.');
  lineas.push('</contexto_del_aula>');
  return lineas.join('\n');
}

// System completo = parte fija + contexto dinámico fresco de cada llamada.
export function construirSystemLuna(ctx: ContextoAula): string {
  return `${SYSTEM_CHAT}\n\n${construirContextoAula(ctx)}`;
}

// Limpia el markdown de énfasis/títulos que Claude puede meter igual y separa
// en párrafos. Las viñetas "- " se CONSERVAN: la regla 5 del spec permite
// listas cuando ayudan, y en el render pre-wrap se leen bien.
export function aParrafos(texto: string): string[] {
  const plano = texto
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '')
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

// Sanea el aula_id que manda el front (LUNA por aula): tiene que ser un UUID
// (la columna es uuid; otra cosa rompería la query). Inválido o ausente → null
// = comportamiento de siempre (el contexto lleva a todos los alumnos de la
// docente).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function sanearAulaId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return UUID_RE.test(s) ? s : null;
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
