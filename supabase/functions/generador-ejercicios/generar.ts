// Generador de ejercicios — lógica PURA (prompt + validación). La usan la Edge
// Function generador-ejercicios y el script local (motor = suscripción vía Agent
// SDK). Sin Deno, sin red → unit-testeable desde Node.

export const TIPOS = ['reconocer', 'completar', 'ordenar', 'producir'] as const;
export type TipoEjercicio = (typeof TIPOS)[number];

// ── Bandas de grado (DP7): la banda fija CÓMO se redacta; el puntaje del chico
// fija QUÉ dificultad se le sirve. Cero datos nuevos del menor.
export type Banda = 'chiquitos' | 'medianos' | 'grandes';

export function bandaDeGrado(grado: number): Banda {
  if (grado <= 2) return 'chiquitos';
  if (grado <= 4) return 'medianos';
  return 'grandes';
}

export const ESTILO_BANDA: Record<Banda, string> = {
  chiquitos: 'Consignas de UNA oración corta y directa, vocabulario cotidiano de un chico de 1° o 2° grado, opciones bien distintas entre sí.',
  medianos: 'Consignas de una o dos oraciones, vocabulario escolar de 3° o 4° grado.',
  grandes: 'Consignas que pueden llevar más de una oración, vocabulario rico de 5° a 7° grado, distractores finos que obligan a pensar.',
};

// ── Imágenes para pre-lectores (accesibilidad 1°-2°) ─────────────────────────
// Set FIJO de dibujos que sabe pintar web/lib/art.ts item(). El generador solo
// puede elegir una de estas claves (whitelist); nada de URLs ni imágenes por IA.
export const CLAVES_IMAGEN = ['apples3', 'stars4', 'solcito', 'arbol', 'oveja', 'uva'] as const;
export type ClaveImagen = (typeof CLAVES_IMAGEN)[number];

const IMAGEN_DESC: Record<ClaveImagen, string> = {
  apples3: '3 manzanas',
  stars4: '4 estrellas',
  solcito: 'un sol',
  arbol: 'un árbol',
  oveja: 'una oveja',
  uva: 'un racimo de uvas',
};

// ── Estratos del pool (DP6): celda = tipo × dificultad. ──────────────────────
export type Celda = { tipo: TipoEjercicio; dificultad: number };

export const POR_CELDA_INICIAL = 3; // pool inicial: 3 × 12 celdas = 36
export const LOTE_REPOSICION = 12;

export const CELDAS: Celda[] = TIPOS.flatMap((tipo) => [1, 2, 3].map((dificultad) => ({ tipo, dificultad })));

export const claveCelda = (c: Celda): string => `${c.tipo}|${c.dificultad}`;

export function celdasIniciales(): Array<Celda & { n: number }> {
  return CELDAS.map((c) => ({ ...c, n: POR_CELDA_INICIAL }));
}

// Reparte un lote priorizando las celdas con menos ejercicios sin ver para el
// chico (spec: "priorizando los estratos que escaseen"). Determinístico.
export function celdasParaLote(sinVerPorCelda: Map<string, number>, lote = LOTE_REPOSICION): Array<Celda & { n: number }> {
  const estado = CELDAS.map((c) => ({ ...c, n: 0, sinVer: sinVerPorCelda.get(claveCelda(c)) ?? 0 }));
  for (let i = 0; i < lote; i++) {
    estado.sort((a, b) => a.sinVer + a.n - (b.sinVer + b.n) || a.dificultad - b.dificultad || a.tipo.localeCompare(b.tipo));
    estado[0].n++;
  }
  return estado.filter((c) => c.n > 0).map(({ tipo, dificultad, n }) => ({ tipo, dificultad, n }));
}

export type EjercicioGen = {
  nodo_id: string;
  enunciado: string;
  opciones: string[];
  correcta: string;
  dificultad: number;
  tipo: TipoEjercicio;
  imagen?: ClaveImagen; // opcional, solo banda chiquitos y cuando el objeto encaja
};

// Prompt para generar un pool de ejercicios de opción múltiple de un nodo.
export function construirPromptEjercicios(
  materia: string,
  grado: number,
  nodoNombre: string,
  nodoDescripcion: string,
  n = 6,
  celdas?: Array<Celda & { n: number }>,
): { system: string; user: string } {
  const banda = bandaDeGrado(grado);
  const system = [
    `Sos SOL, copiloto de ${materia} para ${grado}° grado en una escuela rural de Argentina.`,
    'Generás ejercicios de OPCIÓN MÚLTIPLE, claros y cálidos, en español rioplatense, con ejemplos de la vida del campo/pueblo cuando sirva.',
    ESTILO_BANDA[banda],
    'Reglas: cada ejercicio tiene 4 opciones y UNA correcta (la correcta debe ser EXACTAMENTE una de las opciones, copiada igual).',
    `Variá los tipos: reconocer, completar, ordenar, producir. Incluí al menos 2 de tipo "producir" y al menos 1 de dificultad 3.`,
    'Dificultad en escala 1 (fácil) a 3 (difícil). Nada de respuestas ambiguas ni dos opciones correctas.',
    'Devolvé SOLO un array JSON, sin texto extra, con este shape por ítem:',
    '{"enunciado": str, "opciones": [str,str,str,str], "correcta": str, "dificultad": 1|2|3, "tipo": "reconocer"|"completar"|"ordenar"|"producir"}',
    // Pre-lectores: dibujo opcional solo para los más chicos.
    ...(banda === 'chiquitos'
      ? [
          `Estos chicos todavía no leen bien. Cuando el ejercicio sea de CONTAR o RECONOCER uno de estos objetos, agregá el campo "imagen" con la clave del dibujo, para que SOL lo muestre. Claves: ${CLAVES_IMAGEN.map((k) => `"${k}" (${IMAGEN_DESC[k]})`).join(', ')}.`,
          'Si el ejercicio no es sobre ninguno de esos objetos, NO incluyas "imagen".',
        ]
      : []),
  ].join(' ');
  const pedido = celdas && celdas.length
    ? `Generá EXACTAMENTE: ${celdas.map((c) => `${c.n} de tipo "${c.tipo}" con dificultad ${c.dificultad}`).join(', ')}.`
    : `Generá ${n} ejercicios para este nodo.`;
  const user = `Nodo: "${nodoNombre}"${nodoDescripcion ? ` — ${nodoDescripcion}` : ''}.\n${pedido}`;
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
    // Imagen: solo si es una clave del set fijo (whitelist); cualquier otra cosa se descarta.
    const imagen = (CLAVES_IMAGEN as readonly string[]).includes(String(o.imagen)) ? (o.imagen as ClaveImagen) : undefined;
    out.push({ nodo_id: nodoId, enunciado, opciones, correcta, dificultad, tipo, ...(imagen ? { imagen } : {}) });
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
