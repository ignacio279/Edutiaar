// Diagnóstico cualitativo de una sesión — lógica PURA. El modo mock lo arma sin IA
// (cuenta y resume); parseEval valida la salida del modo real. SOLO diagnóstico:
// NO decide el estado del nodo (eso es la regla de dominio, web/lib/dominio.ts).
// Sin Deno, sin red → unit-testeable desde Node.

export type RespuestaDiag = {
  enunciado: string;
  dada: string;
  esperaba: string;
  correcta: boolean;
  reintentos: number;
  tipo: string;
};

export type Diagnostico = {
  resumen: string;
  errores: { pregunta: string; respondio: string; esperaba: string }[];
  a_reforzar: string[];
};

// Modo mock: diagnóstico determinístico sin IA (demo y tests sin API key).
export function mockDiagnostico(nodo: string, rs: RespuestaDiag[]): Diagnostico {
  const total = rs.length;
  const aciertos = rs.filter((r) => r.correcta).length;
  const primer = rs.filter((r) => r.correcta && r.reintentos === 0).length;
  const errados = rs.filter((r) => !r.correcta);
  const tasa = total ? aciertos / total : 0;
  const cierre = tasa >= 0.8 ? '¡Muy bien!' : tasa >= 0.5 ? 'Va bien, con algunos tropiezos.' : 'Le costó; conviene reforzar.';
  const resumen = total === 0
    ? `No registró respuestas en ${nodo}.`
    : `Practicó ${nodo}: acertó ${aciertos} de ${total} (${primer} al primer intento). ${cierre}`;
  const errores = errados.map((e) => ({ pregunta: e.enunciado, respondio: e.dada, esperaba: e.esperaba }));
  const a_reforzar = total > 0 && tasa < 0.6 ? [nodo] : [];
  return { resumen, errores, a_reforzar };
}

// Prompt del modo real (con API key): método evaluar-sesion + tono SOL.
export function construirPromptEval(nodo: string, rs: RespuestaDiag[]): { system: string; user: string } {
  const system = [
    'Sos SOL, copiloto de una escuela rural de Argentina. Evaluás una sesión de práctica de un chico.',
    'Mirá las respuestas, detectá patrones de error (ej: confunde b/d, falla en las difíciles) y',
    'devolvé un diagnóstico CUALITATIVO breve y cálido (nunca castiga) llamando a la tool escribir_evaluacion.',
    'NO decidas si domina el nodo: eso lo hace la app. Solo diagnosticás.',
  ].join(' ');
  const detalle = rs.map((r, i) => `${i + 1}. [${r.tipo}] "${r.enunciado}" → respondió "${r.dada}" (esperaba "${r.esperaba}") ${r.correcta ? 'OK' : 'MAL'}${r.reintentos ? ` (${r.reintentos} reintentos)` : ''}`).join('\n');
  const user = `Nodo: ${nodo}\nRespuestas:\n${detalle}`;
  return { system, user };
}

export const TOOL_ESCRIBIR_EVALUACION = {
  name: 'escribir_evaluacion',
  description: 'Guarda el diagnóstico cualitativo de la sesión (resumen para la seño/el chico, errores detectados, nodos a reforzar).',
  input_schema: {
    type: 'object',
    properties: {
      resumen: { type: 'string' },
      errores: { type: 'array', items: { type: 'object', properties: { pregunta: { type: 'string' }, respondio: { type: 'string' }, esperaba: { type: 'string' } } } },
      a_reforzar: { type: 'array', items: { type: 'string' } },
    },
    required: ['resumen'],
  },
};

// Valida la salida estructurada del modo real (el schema es el contrato con la DB).
export function parseEval(input: unknown): Diagnostico {
  const o = (input ?? {}) as Record<string, unknown>;
  return {
    resumen: String(o.resumen ?? '').trim() || 'Sesión practicada.',
    errores: Array.isArray(o.errores)
      ? (o.errores as Record<string, unknown>[]).map((e) => ({
          pregunta: String(e?.pregunta ?? ''), respondio: String(e?.respondio ?? ''), esperaba: String(e?.esperaba ?? ''),
        }))
      : [],
    a_reforzar: Array.isArray(o.a_reforzar) ? (o.a_reforzar as unknown[]).map(String) : [],
  };
}
