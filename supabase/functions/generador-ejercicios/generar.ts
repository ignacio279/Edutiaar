// Generador de ejercicios — lógica PURA (prompt + validación). La usa el script local
// (motor = suscripción vía Agent SDK) y queda lista para una Edge Function cuando haya
// API key. Sin Deno, sin red → unit-testeable desde Node.

export const TIPOS = ['reconocer', 'completar', 'ordenar', 'producir'] as const;
export type TipoEjercicio = (typeof TIPOS)[number];

export type EjercicioGen = {
  nodo_id: string;
  enunciado: string;
  opciones: string[];
  correcta: string;
  dificultad: number;
  tipo: TipoEjercicio;
};

// Prompt para generar un pool de ejercicios de opción múltiple de un nodo.
export function construirPromptEjercicios(
  materia: string,
  grado: number,
  nodoNombre: string,
  nodoDescripcion: string,
  n = 6,
): { system: string; user: string } {
  const system = [
    `Sos SOL, copiloto de ${materia} para ${grado}° grado en una escuela rural de Argentina.`,
    'Generás ejercicios de OPCIÓN MÚLTIPLE, claros y cálidos, en español rioplatense, con ejemplos de la vida del campo/pueblo cuando sirva.',
    'Reglas: cada ejercicio tiene 4 opciones y UNA correcta (la correcta debe ser EXACTAMENTE una de las opciones, copiada igual).',
    `Variá los tipos: reconocer, completar, ordenar, producir. Incluí al menos 2 de tipo "producir" y al menos 1 de dificultad 3.`,
    'Dificultad en escala 1 (fácil) a 3 (difícil). Nada de respuestas ambiguas ni dos opciones correctas.',
    'Devolvé SOLO un array JSON, sin texto extra, con este shape por ítem:',
    '{"enunciado": str, "opciones": [str,str,str,str], "correcta": str, "dificultad": 1|2|3, "tipo": "reconocer"|"completar"|"ordenar"|"producir"}',
  ].join(' ');
  const user = `Nodo: "${nodoNombre}"${nodoDescripcion ? ` — ${nodoDescripcion}` : ''}.\nGenerá ${n} ejercicios para este nodo.`;
  return { system, user };
}

// Valida y normaliza el array que devuelve Claude. Descarta ítems inválidos; tira si
// no queda ninguno bueno (el shape es el contrato con la tabla ejercicio).
export function parseEjercicios(input: unknown, nodoId: string): EjercicioGen[] {
  const arr = Array.isArray(input) ? input : (input as { ejercicios?: unknown[] })?.ejercicios;
  if (!Array.isArray(arr)) throw new Error('salida_no_es_array');

  const out: EjercicioGen[] = [];
  for (const it of arr) {
    const o = (it ?? {}) as Record<string, unknown>;
    const enunciado = String(o.enunciado ?? '').trim();
    const opciones = Array.isArray(o.opciones) ? o.opciones.map((x) => String(x).trim()).filter(Boolean) : [];
    const correcta = String(o.correcta ?? '').trim();
    if (!enunciado || opciones.length < 2) continue;
    if (!opciones.includes(correcta)) continue; // la correcta tiene que estar entre las opciones
    const dificultad = Math.min(3, Math.max(1, Math.round(Number(o.dificultad) || 1)));
    const tipo = (TIPOS as readonly string[]).includes(String(o.tipo)) ? (o.tipo as TipoEjercicio) : 'reconocer';
    out.push({ nodo_id: nodoId, enunciado, opciones, correcta, dificultad, tipo });
  }
  if (out.length === 0) throw new Error('sin_ejercicios_validos');
  return out;
}

// ¿El pool permite DOMINAR el nodo según la regla (>=2 producir, >=1 difícil)?
export function cubreDominio(ejercicios: EjercicioGen[]): boolean {
  const producir = ejercicios.filter((e) => e.tipo === 'producir').length;
  const dificil = ejercicios.filter((e) => e.dificultad >= 3).length;
  return producir >= 2 && dificil >= 1;
}
