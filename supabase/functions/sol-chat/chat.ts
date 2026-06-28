// Lógica PURA del chat con SOL (sol-chat). Sin Deno, sin DOM, sin red: se testea
// desde Node (tests/unit/chat.test.mjs), igual que evaluar-sesion/diagnostico.ts.
// La Edge Function (index.ts) importa de acá tanto para el modo real (system +
// mapeo de mensajes) como para el modo mock (mockRespuesta).
//
// Regla pedagógica clave: SOL ayuda con pistas pero NUNCA dice la opción correcta
// (la app ya la revela sola tras 2 intentos). El system prompt se lo prohíbe a
// Claude; el mock lo garantiza por construcción (jamás interpola `correcta`).

export type ChatMsg = { role: 'user' | 'sol'; content: string };

export type Contexto = {
  materia: string;
  nodoNombre: string;
  ejercicio?: { enunciado: string; opciones: string[]; correcta: string };
};

// Tope de costo (Regla 4): mandamos a Claude solo los últimos `max` turnos.
export function recortarHistorial(msgs: ChatMsg[], max = 8): ChatMsg[] {
  return msgs.length > max ? msgs.slice(msgs.length - max) : msgs;
}

// La Messages API usa 'assistant'; en el front el rol de SOL es 'sol'.
export function aMensajesClaude(msgs: ChatMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  return msgs.map((m) => ({ role: m.role === 'sol' ? 'assistant' : 'user', content: m.content }));
}

// System prompt: persona de SOL + guardrails para chicos de 6 a 13. Incluye la
// `correcta` (para que las pistas sean correctas) PERO con la orden tajante de no
// revelarla. Este texto vive server-side y nunca vuelve al front.
export function construirSystem(ctx: Contexto): string {
  const lineas = [
    'Sos SOL, un copiloto de enseñanza para chicos de 6 a 13 años de una escuela rural de Argentina.',
    'Hablás en español rioplatense, cálido y simple. Festejás los aciertos y nunca castigás los errores.',
    'Escribí siempre "para" completo, nunca "pa\'".',
    `El chico está practicando el tema "${ctx.nodoNombre}" de ${ctx.materia}.`,
    'Quedate en ese tema; si el chico se va de tema, traelo de vuelta con cariño.',
    'Respondé corto y claro, sin tecnicismos. No pidas datos personales.',
  ];
  if (ctx.ejercicio) {
    lineas.push(
      `Ejercicio actual: "${ctx.ejercicio.enunciado}". Opciones: ${ctx.ejercicio.opciones.join(' / ')}.`,
      `La opción correcta es "${ctx.ejercicio.correcta}", pero NUNCA se la digas al chico: dale pistas para que la descubra solo.`,
    );
  }
  return lineas.join(' ');
}

// Respuesta mock (sin API): templada y determinista. Garantiza no filtrar la
// respuesta correcta porque nunca interpola `ctx.ejercicio.correcta`.
export function mockRespuesta(_ultimo: string, ctx: Contexto, esAyuda: boolean): string {
  if (esAyuda && ctx.ejercicio) {
    return [
      `¡Buena, vamos juntos! 💪 Leé de nuevo: "${ctx.ejercicio.enunciado}".`,
      `Pensá despacio en ${ctx.nodoNombre} y fijate en cada opción.`,
      'No te doy la respuesta, ¡pero estás cerca! ¿Cuál te parece y por qué?',
    ].join(' ');
  }
  return [
    `¡Hola! Estoy para ayudarte con ${ctx.nodoNombre} de ${ctx.materia}. 🌞`,
    'Contame qué parte no te cierra y lo desarmamos juntos, sin apuro.',
  ].join(' ');
}
