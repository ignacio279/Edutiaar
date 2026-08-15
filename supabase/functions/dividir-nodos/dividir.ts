// dividir-en-nodos — lógica PURA de la división del contenido en nodos y del perfil
// de especialista de SOL. parseDivision
// valida la salida del modo real. Sin Deno, sin red → unit-testeable desde Node.

export type NodoGen = {
  nombre: string;
  orden: number;
  descripcion: string;
  // Mapeo propuesto al marco curricular NAP (Task 5). null = "no sé": el
  // clasificador puede (y debe, si no hay un encaje claro) decir que no sabe.
  nap_tema_id: string | null;
  nap_confianza: number | null;
};

export type PerfilMateria = {
  system_prompt: string;
  tono: string;
  criterios_eval: string[];
  ejemplos_zona: string[];
};

export type Division = { perfil: PerfilMateria; nodos: NodoGen[] };

// Un tema del catálogo NAP tal como lo necesita el clasificador. `nombre` es
// la etiqueta corta NUESTRA (legible en la UI); `texto_oficial` es la cita
// textual del documento NAP — la fuente de autoridad, lo que de verdad decide
// si un nodo cae adentro. `materia` viaja porque el catálogo que se pasa acá
// NO se filtra por materia (ver catalogoParaPrompt): la docente puede haber
// cargado "Matematicas" y el marco dice "Matemática" — filtrar por nombre
// perdería el catálogo entero y todo mapearía a null en silencio.
export type TemaCatalogo = {
  id: string;
  nombre: string;
  eje: string;
  materia?: string;
  texto_oficial?: string | null;
};

// Parte el contenido del plan en ítems: por líneas, comas y punto y coma. Limpia
// viñetas/guiones al inicio y puntos/espacios al final, descarta vacíos.
export function partirContenido(contenido: string): string[] {
  return (contenido ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.replace(/^[\s•·\-–—.]+/, '').replace(/[\s.]+$/, '').trim())
    .filter((s) => s.length > 0);
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

// Arma el bloque del catálogo NAP para el prompt: una lista `- <id> · <materia>
// · <eje> → <nombre>` con el texto oficial de cada tema (lo que decide de
// verdad). No filtra por materia — recibe el catálogo de las CUATRO materias
// del grado y se lo dice al modelo, porque el nombre que cargó la docente
// puede no calzar con el nombre oficial del marco.
export function catalogoParaPrompt(materia: string, grado: number, temas: TemaCatalogo[]): string {
  const m = (materia ?? '').trim() || 'la materia';
  if (!temas || temas.length === 0) {
    return `No hay catálogo NAP cargado para ${grado}° grado: dejá nap_tema_id en null en todos los nodos.`;
  }
  const encabezado =
    `Catálogo del marco curricular NAP para ${grado}° grado — las CUATRO materias, no solo ` +
    `"${m}" (el nombre de materia que cargó la docente puede no calzar exacto con el nombre ` +
    'oficial del marco; elegí por lo que el nodo enseña, no por el rótulo de materia):';
  const lineas = temas.map((t) => {
    const pref = t.materia ? `${t.materia} · ` : '';
    const oficial = t.texto_oficial ? ` — NAP: "${t.texto_oficial}"` : '';
    return `- ${t.id} · ${pref}${t.eje} → ${t.nombre}${oficial}`;
  });
  return [encabezado, ...lineas].join('\n');
}

// Acota la confianza a 0..1 y descarta basura (no-números, NaN, Infinity).
function normalizarConfianza(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

// Valida y normaliza la salida estructurada del modo real (Claude vía tool).
// Lanza si el shape no calza (el schema es el contrato con la DB).
// `temas` es el catálogo NAP contra el que se valida nap_tema_id: un id que
// no está en la lista cae a null, nunca se guarda inventado. La clasificación
// nunca puede romper la publicación — por eso `temas` tiene default `[]` y,
// sin catálogo, todo mapeo queda null en vez de lanzar.
export function parseDivision(
  input: unknown, materia: string, grado: number, temas: TemaCatalogo[] = [],
): Division {
  const obj = (input ?? {}) as Record<string, unknown>;
  const rawNodos = Array.isArray(obj.nodos) ? obj.nodos : [];
  if (rawNodos.length === 0) throw new Error('division_sin_nodos');

  const idsValidos = new Set(temas.map((t) => t.id));

  const nodos: NodoGen[] = rawNodos.map((n, i) => {
    const o = (n ?? {}) as Record<string, unknown>;
    const nombre = String(o.nombre ?? '').trim();
    if (!nombre) throw new Error(`nodo_${i}_sin_nombre`);
    const nap_tema_id = typeof o.nap_tema_id === 'string' && idsValidos.has(o.nap_tema_id)
      ? o.nap_tema_id
      : null;
    return {
      nombre,
      orden: typeof o.orden === 'number' ? o.orden : i,
      descripcion: String(o.descripcion ?? ''),
      nap_tema_id,
      // Sin tema, la confianza no significa nada: queda null también.
      nap_confianza: nap_tema_id === null ? null : normalizarConfianza(o.nap_confianza),
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

// Instrucción de clasificación NAP — el criterio en sí (comparar contra el
// texto_oficial, preferir null antes que forzar un encaje). Exportada para que
// el backfill de los nodos ya publicados (Task 6, scripts/backfill-nap.mjs) la
// reuse tal cual: si el backfill clasificara con una redacción distinta a la
// de publicar, el catálogo terminaría con dos criterios y nadie sabría cuál
// mapeo mirar.
export const NAP_INSTRUCCION = [
  'Además, para cada nodo proponé a qué tema del marco curricular NAP corresponde',
  '(nap_tema_id) junto con tu confianza de 0 a 1 (nap_confianza). Elegí comparando lo que el',
  'nodo enseña contra el "NAP" (texto oficial) de cada tema listado abajo — esa cita manda,',
  'no la etiqueta corta. Si un nodo no corresponde con claridad a ninguno de estos temas,',
  'devolvé nap_tema_id: null. Es preferible dejarlo sin clasificar antes que forzar un encaje.',
].join(' ');

// Prompt del modo real (cuando haya API key): método dividir-en-nodos + tono +
// (Task 5) clasificación de cada nodo contra el catálogo NAP del grado.
export function construirPromptDivision(
  materia: string, grado: number, contenido: string, temas: TemaCatalogo[] = [],
): { system: string; user: string } {
  const m = (materia ?? '').trim() || 'la materia';
  const intro = [
    `Sos SOL, especialista en ${m} para ${grado}° grado en una escuela rural de Argentina.`,
    'Método: dividí el contenido en NODOS (temas) bien ordenados, de lo simple a lo complejo,',
    'respetando los prerrequisitos. Cada nodo lleva un nombre corto y una descripción de qué cubre.',
    'Tono: español rioplatense, cálido. Devolvé el resultado llamando a la tool guardar_division.',
  ].join(' ');
  const system = [intro, NAP_INSTRUCCION, catalogoParaPrompt(m, grado, temas)].join('\n\n');
  // Sin texto pegado (la seño subió solo un PDF): el contenido va como bloque document.
  const user = (contenido ?? '').trim()
    ? `Contenido del programa a dividir en nodos:\n\n${contenido}`
    : 'El programa a dividir en nodos está en el documento PDF adjunto.';
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
            nap_tema_id: {
              type: ['string', 'null'],
              description:
                'id del tema del catálogo NAP (de la lista del prompt) al que corresponde este ' +
                'nodo, o null si ninguno calza con claridad. Preferí null antes que forzar un encaje.',
            },
            nap_confianza: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confianza de 0 a 1 en el mapeo de nap_tema_id. Sin sentido si nap_tema_id es null.',
            },
          },
          required: ['nombre'],
        },
      },
    },
    required: ['nodos'],
  },
};
