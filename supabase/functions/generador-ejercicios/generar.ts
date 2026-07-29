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

// ── Formatos de interacción ──────────────────────────────────────────────────
// El `tipo` fija el redactado; el `formato` fija CÓMO responde el chico. 'opciones' es el
// histórico (toca un botón). Qué formatos ve cada banda crece por slice: chiquitos
// (pre-lectores) se quedan SIEMPRE en opciones. Enforcement doble: el prompt no ofrece lo no
// permitido y parseEjercicios descarta lo que igual venga (skew de versiones / alucinación).
export const FORMATOS = ['opciones', 'escribir', 'ordenar', 'unir'] as const;
export type Formato = (typeof FORMATOS)[number];
export type Par = { izq: string; der: string };

export const FORMATOS_BANDA: Record<Banda, Formato[]> = {
  chiquitos: ['opciones'],
  medianos: ['opciones', 'escribir', 'ordenar'],
  grandes: ['opciones', 'escribir', 'ordenar', 'unir'],
};

// ESPEJO de web/lib/correccion.ts serializarPares — representación legible de los pares que se
// guarda en `correcta` (para el reveal y el diagnóstico). El front NO la usa para corregir
// (compara datos.pares), solo para mostrar; deben verse igual → mantené en sync.
export function serializarPares(pares: Par[]): string {
  return pares.map((p) => `${p.izq} → ${p.der}`).join(' · ');
}

// ESPEJO de web/lib/correccion.ts normalizarTexto — mantené en sync (hay test espejo que
// compara ambas). Normalización tolerante: minúsculas, sin tildes, ñ preservada (U+0303 se
// respeta y se recompone con NFC), puntuación → espacio, espacios colapsados.
export function normalizarTexto(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-̂̄-ͯ]/g, '') // diacríticos combinantes salvo U+0303 (ñ)
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

export const POR_CELDA_INICIAL = 3; // pool inicial uniforme (medianos): 3 × 12 celdas = 36
export const LOTE_REPOSICION = 12;

export const CELDAS: Celda[] = TIPOS.flatMap((tipo) => [1, 2, 3].map((dificultad) => ({ tipo, dificultad })));

export const claveCelda = (c: Celda): string => `${c.tipo}|${c.dificultad}`;

// Sesgo del pool inicial por banda: [n_dif1, n_dif2, n_dif3] por CADA tipo. La banda
// fija el REDACTADO (ESTILO_BANDA) y también con cuánta dificultad arranca el chico:
// grandes cargan difícil, chiquitos lo alivian, medianos = uniforme (histórico).
// Total invariante = 4 tipos × (n1+n2+n3) = 36. Toda celda queda con n>=1, así que
// cubreDominio se cumple por construcción (producir suma >=2; dificultad 3 suma >=4).
export const SESGO_BANDA: Record<Banda, [number, number, number]> = {
  chiquitos: [5, 3, 1],
  medianos: [POR_CELDA_INICIAL, POR_CELDA_INICIAL, POR_CELDA_INICIAL],
  grandes: [1, 3, 5],
};

export function celdasIniciales(banda: Banda = 'medianos'): Array<Celda & { n: number }> {
  const sesgo = SESGO_BANDA[banda];
  return CELDAS.map((c) => ({ ...c, n: sesgo[c.dificultad - 1] }));
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
  formato: Formato;
  datos?: { pares?: Par[]; estricto?: boolean }; // extra por formato: pares de 'unir', flag estricto
  imagen?: ClaveImagen; // opcional, solo banda chiquitos y cuando el objeto encaja
};

// Descripción de cada formato para el prompt (se emiten SOLO los formatos permitidos por banda).
const FORMATO_DESC: Record<Formato, string> = {
  opciones: '- "opciones": 4 opciones y UNA correcta (la correcta copiada EXACTAMENTE igual a una de las opciones). Ej: {"formato":"opciones","opciones":["a","b","c","d"],"correcta":"a"}.',
  escribir: '- "escribir": el chico TIPEA la respuesta. "correcta" es la respuesta esperada, CORTA (1 a 3 palabras). "opciones" va vacío []. Si el ejercicio evalúa tildes u ortografía, agregá "estricto": true. Ej: {"formato":"escribir","opciones":[],"correcta":"la vaca"}.',
  ordenar: '- "ordenar": fichas que el chico ordena para armar una oración. "opciones" = las fichas EN EL ORDEN CORRECTO (la app las mezcla al mostrar), 3 a 8 fichas. "correcta" = la oración completa (las fichas unidas por espacios). Ej: {"formato":"ordenar","opciones":["El","perro","corre"],"correcta":"El perro corre"}.',
  unir: '- "unir": pares para unir tocando. "pares" = 3 a 5 pares {"izq","der"}, sin repetir izq ni der. No lleva "opciones" ni "correcta". Ej: {"formato":"unir","pares":[{"izq":"vaca","der":"ternero"},{"izq":"oveja","der":"cordero"}]}.',
};

// Prompt para generar un pool de ejercicios de un nodo. Para chiquitos (solo 'opciones') el
// prompt queda IDÉNTICO al histórico (cero churn); las bandas con más formatos suman un bloque
// que los explica y cambian la línea del shape para incluir "formato".
export function construirPromptEjercicios(
  materia: string,
  grado: number,
  nodoNombre: string,
  nodoDescripcion: string,
  n = 6,
  celdas?: Array<Celda & { n: number }>,
): { system: string; user: string } {
  const banda = bandaDeGrado(grado);
  const formatos = FORMATOS_BANDA[banda];
  const multi = formatos.length > 1; // ¿ofrecemos formatos más allá de opción múltiple?
  const enumFormato = formatos.map((f) => `"${f}"`).join('|');
  const system = [
    `Sos SOL, copiloto de ${materia} para ${grado}° grado en una escuela rural de Argentina.`,
    multi
      ? 'Generás ejercicios claros y cálidos, en español rioplatense, con ejemplos de la vida del campo/pueblo cuando sirva.'
      : 'Generás ejercicios de OPCIÓN MÚLTIPLE, claros y cálidos, en español rioplatense, con ejemplos de la vida del campo/pueblo cuando sirva.',
    ESTILO_BANDA[banda],
    multi
      ? `Cada ejercicio lleva un "formato" de interacción. Formatos permitidos: ${formatos.join(', ')}. Variá los formatos: aproximadamente la mitad "opciones" y el resto entre los otros permitidos, según encaje con el tema.`
      : 'Reglas: cada ejercicio tiene 4 opciones y UNA correcta (la correcta debe ser EXACTAMENTE una de las opciones, copiada igual).',
    ...(multi ? ['Detalle de cada formato:', ...formatos.map((f) => FORMATO_DESC[f])] : []),
    `Variá los tipos: reconocer, completar, ordenar, producir. Incluí al menos 2 de tipo "producir" y al menos 1 de dificultad 3.`,
    'Dificultad en escala 1 (fácil) a 3 (difícil). Nada de respuestas ambiguas ni dos opciones correctas.',
    'Devolvé SOLO un array JSON, sin texto extra, con este shape por ítem:',
    multi
      ? `{"enunciado": str, "opciones": [str,...], "correcta": str, "dificultad": 1|2|3, "tipo": "reconocer"|"completar"|"ordenar"|"producir", "formato": ${enumFormato}}`
      : '{"enunciado": str, "opciones": [str,str,str,str], "correcta": str, "dificultad": 1|2|3, "tipo": "reconocer"|"completar"|"ordenar"|"producir"}',
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
// no queda ninguno bueno (el shape es el contrato con la tabla ejercicio). `banda`
// (obligatoria) es la del grado del programa: enforcement server-side de que la imagen
// SOLO viaja para pre-lectores (chiquitos), aunque el modelo la emita en otro grado.
export function parseEjercicios(input: unknown, nodoId: string, banda: Banda): EjercicioGen[] {
  const arr = Array.isArray(input) ? input : (input as { ejercicios?: unknown[] })?.ejercicios;
  if (!Array.isArray(arr)) throw new Error('salida_no_es_array');
  const permitidos = FORMATOS_BANDA[banda];

  const out: EjercicioGen[] = [];
  for (const it of arr) {
    const o = (it ?? {}) as Record<string, unknown>;
    const enunciado = String(o.enunciado ?? '').trim();
    if (!enunciado) continue;
    const dificultad = Math.min(3, Math.max(1, Math.round(Number(o.dificultad) || 1)));
    const tipo = (TIPOS as readonly string[]).includes(String(o.tipo)) ? (o.tipo as TipoEjercicio) : 'reconocer';
    const formato: Formato = (FORMATOS as readonly string[]).includes(String(o.formato)) ? (o.formato as Formato) : 'opciones';
    if (!permitidos.includes(formato)) continue; // enforcement: formato no permitido para la banda
    // Imagen: solo para chiquitos Y solo si es una clave del set fijo (whitelist).
    // Cualquier otra cosa (URL, clave rara, banda que no sea chiquitos) se descarta.
    const imagen = banda === 'chiquitos' && (CLAVES_IMAGEN as readonly string[]).includes(String(o.imagen))
      ? (o.imagen as ClaveImagen)
      : undefined;
    const base = { nodo_id: nodoId, enunciado, dificultad, tipo, ...(imagen ? { imagen } : {}) };

    if (formato === 'escribir') {
      // El chico tipea: correcta corta y no vacía; opciones va vacío. Preserva flag estricto.
      const correcta = String(o.correcta ?? '').trim();
      if (!correcta || correcta.length > 40) continue;
      const estricto = typeof o.datos === 'object' && o.datos !== null && (o.datos as { estricto?: unknown }).estricto === true;
      out.push({ ...base, formato, opciones: [], correcta, ...(estricto ? { datos: { estricto: true } } : {}) });
      continue;
    }

    if (formato === 'ordenar') {
      // Fichas EN ORDEN CORRECTO (3-8); la app las mezcla al mostrar. La oración completa
      // (correcta) tiene que coincidir con las fichas unidas — si no, no confiamos en el orden.
      const fichas = Array.isArray(o.opciones) ? o.opciones.map((x) => String(x).trim()).filter(Boolean) : [];
      const correcta = String(o.correcta ?? '').trim();
      if (fichas.length < 3 || fichas.length > 8 || !correcta) continue;
      if (normalizarTexto(fichas.join(' ')) !== normalizarTexto(correcta)) continue;
      out.push({ ...base, formato, opciones: fichas, correcta });
      continue;
    }

    if (formato === 'unir') {
      // Pares para unir tocando (3-5). izq/der no vacíos y únicos tras normalizar (si no, el
      // emparejamiento sería ambiguo). `correcta` la CONSTRUÍMOS acá (no se confía al modelo).
      const paresRaw = Array.isArray(o.pares)
        ? o.pares
        : (Array.isArray((o.datos as { pares?: unknown[] })?.pares) ? (o.datos as { pares: unknown[] }).pares : []);
      const pares: Par[] = [];
      for (const p of paresRaw) {
        const izq = String((p as { izq?: unknown })?.izq ?? '').trim();
        const der = String((p as { der?: unknown })?.der ?? '').trim();
        if (izq && der) pares.push({ izq, der });
      }
      if (pares.length < 3 || pares.length > 5) continue;
      const izqs = new Set(pares.map((p) => normalizarTexto(p.izq)));
      const ders = new Set(pares.map((p) => normalizarTexto(p.der)));
      if (izqs.size !== pares.length || ders.size !== pares.length) continue; // ambiguo
      out.push({ ...base, formato, opciones: [], correcta: serializarPares(pares), datos: { pares } });
      continue;
    }

    // Cualquier formato estructurado que se cuele sin rama se descarta antes de llegar acá
    // (no permitido para la banda).
    if (formato !== 'opciones') continue;
    const opciones = Array.isArray(o.opciones) ? o.opciones.map((x) => String(x).trim()).filter(Boolean) : [];
    const correcta = String(o.correcta ?? '').trim();
    if (opciones.length < 2 || !opciones.includes(correcta)) continue; // la correcta debe estar entre las opciones
    out.push({ ...base, formato: 'opciones', opciones, correcta });
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
