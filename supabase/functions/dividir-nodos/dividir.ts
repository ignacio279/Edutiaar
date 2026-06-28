// dividir-en-nodos — lógica PURA de la división del contenido en nodos y del perfil
// de especialista de SOL. El modo mock corre sin Claude (parte el texto); parseDivision
// valida la salida del modo real. Sin Deno, sin red → unit-testeable desde Node.

export type NodoGen = { nombre: string; orden: number; descripcion: string };

export type PerfilMateria = {
  system_prompt: string;
  tono: string;
  criterios_eval: string[];
  ejemplos_zona: string[];
};

export type Division = { perfil: PerfilMateria; nodos: NodoGen[] };

// Parte el contenido del plan en ítems: por líneas, comas y punto y coma. Limpia
// viñetas/guiones al inicio y puntos/espacios al final, descarta vacíos.
export function partirContenido(contenido: string): string[] {
  return (contenido ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^[\s•·\-–—.]+/, '').replace(/[\s.]+$/, '').trim())
    .filter((s) => s.length > 0);
}

function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function perfilDe(materia: string, grado: number): PerfilMateria {
  const m = (materia ?? '').trim() || 'la materia';
  return {
    system_prompt:
      `Sos SOL, copiloto de ${m} para ${grado}° grado en una escuela rural de Argentina. ` +
      'Generás ejercicios claros y alentadores, con ejemplos de la zona del alumno. ' +
      'Trabajás solo sobre los nodos de este programa.',
    tono: 'Español rioplatense, cálido y simple. Festejás los aciertos, nunca castigás los errores.',
    criterios_eval: ['claridad', 'progresión de dificultad', 'cobertura del temario'],
    ejemplos_zona: [],
  };
}

// Modo mock: división determinística sin IA (para demo y tests sin API key).
export function mockDividir(contenido: string, materia: string, grado: number): Division {
  const m = (materia ?? '').trim() || 'la materia';
  const nodos: NodoGen[] = partirContenido(contenido).map((nombre, i) => ({
    nombre: capitalizar(nombre),
    orden: i,
    descripcion: `Práctica de "${nombre}" en ${m}.`,
  }));
  return { perfil: perfilDe(materia, grado), nodos };
}

// Valida y normaliza la salida estructurada del modo real (Claude vía tool).
// Lanza si el shape no calza (el schema es el contrato con la DB).
export function parseDivision(input: unknown, materia: string, grado: number): Division {
  const obj = (input ?? {}) as Record<string, unknown>;
  const rawNodos = Array.isArray(obj.nodos) ? obj.nodos : [];
  if (rawNodos.length === 0) throw new Error('division_sin_nodos');

  const nodos: NodoGen[] = rawNodos.map((n, i) => {
    const o = (n ?? {}) as Record<string, unknown>;
    const nombre = String(o.nombre ?? '').trim();
    if (!nombre) throw new Error(`nodo_${i}_sin_nombre`);
    return {
      nombre,
      orden: typeof o.orden === 'number' ? o.orden : i,
      descripcion: String(o.descripcion ?? ''),
    };
  });

  const pIn = (obj.perfil ?? {}) as Partial<PerfilMateria>;
  const base = perfilDe(materia, grado);
  const perfil: PerfilMateria = {
    system_prompt: pIn.system_prompt || base.system_prompt,
    tono: pIn.tono || base.tono,
    criterios_eval: Array.isArray(pIn.criterios_eval) ? pIn.criterios_eval.map(String) : base.criterios_eval,
    ejemplos_zona: Array.isArray(pIn.ejemplos_zona) ? pIn.ejemplos_zona.map(String) : base.ejemplos_zona,
  };
  return { perfil, nodos };
}

// Prompt del modo real (cuando haya API key): método dividir-en-nodos + tono.
export function construirPromptDivision(materia: string, grado: number, contenido: string): { system: string; user: string } {
  const m = (materia ?? '').trim() || 'la materia';
  const system = [
    `Sos SOL, especialista en ${m} para ${grado}° grado en una escuela rural de Argentina.`,
    'Método: dividí el contenido en NODOS (temas) bien ordenados, de lo simple a lo complejo,',
    'respetando los prerrequisitos. Cada nodo lleva un nombre corto y una descripción de qué cubre.',
    'Tono: español rioplatense, cálido. Devolvé el resultado llamando a la tool guardar_division.',
  ].join(' ');
  const user = `Contenido del programa a dividir en nodos:\n\n${contenido}`;
  return { system, user };
}

// Variante one-shot (sin tools): pide la división como JSON pelado. La usa el script
// local (motor = suscripción vía Agent SDK). parseDivision valida el mismo shape.
export function construirPromptDivisionJSON(materia: string, grado: number, contenido: string): { system: string; user: string } {
  const { system } = construirPromptDivision(materia, grado, contenido);
  const systemJSON = system.replace(
    'Devolvé el resultado llamando a la tool guardar_division.',
    'Devolvé SOLO un JSON {"perfil": {"system_prompt": str, "tono": str, "criterios_eval": [str], "ejemplos_zona": [str]}, "nodos": [{"nombre": str, "orden": int, "descripcion": str}]}, sin texto extra.',
  );
  const user = `Contenido del programa a dividir en nodos:\n\n${contenido}`;
  return { system: systemJSON, user };
}

// Tool del modo real: Claude devuelve la división estructurada vía tool use
// (el input_schema es el contrato; parseDivision lo valida igual por las dudas).
export const TOOL_GUARDAR_DIVISION = {
  name: 'guardar_division',
  description: 'Guarda la división del programa: el perfil del especialista y la lista ordenada de nodos.',
  input_schema: {
    type: 'object',
    properties: {
      perfil: {
        type: 'object',
        properties: {
          system_prompt: { type: 'string' },
          tono: { type: 'string' },
          criterios_eval: { type: 'array', items: { type: 'string' } },
          ejemplos_zona: { type: 'array', items: { type: 'string' } },
        },
      },
      nodos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nombre: { type: 'string' },
            orden: { type: 'number' },
            descripcion: { type: 'string' },
          },
          required: ['nombre'],
        },
      },
    },
    required: ['nodos'],
  },
};
