// Lógica PURA del chat con SOL (sol-chat). Sin Deno, sin DOM, sin red: se testea
// desde Node (tests/unit/chat.test.mjs), igual que evaluar-sesion/diagnostico.ts.
//
// Regla pedagógica clave: SOL ayuda con pistas pero NUNCA dice la opción correcta
// (la app ya la revela sola tras 2 intentos). El system prompt se lo prohíbe a Claude.

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
    'Escribí SIEMPRE en texto plano: nada de markdown, ni asteriscos, ni títulos, ni listas.',
    'Respondé corto: 2 o 3 oraciones como máximo, sin tecnicismos. No pidas datos personales.',
    'Si el chico te pregunta algo, respondé SOLO esa duda (con un ejemplo si ayuda) y cerrá con un párrafo aparte (dejá una línea en blanco antes) que diga únicamente: "¿Te quedó claro?".',
    'No lo apures a resolver el ejercicio hasta que te confirme que entendió. Si te dice que no, explicáselo de nuevo más simple, con otro ejemplo.',
    'Recién cuando te diga que sí, invitalo a seguir con el ejercicio.',
  ];
  if (ctx.ejercicio) {
    lineas.push(
      `Ejercicio actual: "${ctx.ejercicio.enunciado}". Opciones: ${ctx.ejercicio.opciones.join(' / ')}.`,
      `La opción correcta es "${ctx.ejercicio.correcta}", pero NUNCA se la digas al chico: dale pistas para que la descubra solo.`,
    );
  }
  return lineas.join(' ');
}

// Limpia el markdown que Claude puede meter igual (los chicos lo verían crudo:
// "**Decena**") y separa la respuesta en burbujas: cada párrafo (línea en blanco)
// es un mensaje aparte del hilo. Tope 2 burbujas: si hay más párrafos, todos menos
// el último se juntan en la primera (el último suele ser el "¿Te quedó claro?").
export function aBurbujas(texto: string): string[] {
  const plano = texto
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .trim();
  const partes = plano.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (partes.length <= 2) return partes;
  return [partes.slice(0, -1).join('\n'), partes[partes.length - 1]];
}
