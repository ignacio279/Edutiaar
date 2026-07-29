// Corrección de respuestas — lógica PURA (Regla 2 del proyecto: la APP corrige, comparando
// contra ejercicio.correcta; SOL NUNCA corrige). Es la ÚNICA puerta de corrección: el front
// llama `esCorrecta`, que ramifica por formato. Sin DOM ni red → unit-testeable.
//
// OJO: `normalizarTexto` está DUPLICADA en supabase/functions/generador-ejercicios/generar.ts
// (runtimes separados). Hay un test espejo (tests/unit/espejos.test.mjs) que compara ambas.

export type Formato = 'opciones' | 'escribir' | 'ordenar' | 'unir';
export type Par = { izq: string; der: string };

// Lo que el chico construyó, discriminado por formato.
export type RespuestaDada =
  | { formato: 'opciones'; opcion: string }
  | { formato: 'escribir'; texto: string }
  | { formato: 'ordenar'; orden: string[] }
  | { formato: 'unir'; pares: Par[] };

export const FORMATOS = ['opciones', 'escribir', 'ordenar', 'unir'] as const;

// El formato del ejercicio; null si es desconocido (front lo filtra con filtrarRenderizables,
// defensa contra skew de versiones). Ejercicios viejos sin columna → 'opciones' (retrocompat).
export function formatoDe(ej: { formato?: string | null }): Formato | null {
  const f = ej.formato ?? 'opciones';
  return (FORMATOS as readonly string[]).includes(f) ? (f as Formato) : null;
}

// Normalización tolerante para texto libre: minúsculas, sin tildes, puntuación → espacio,
// espacios colapsados. La ñ SE PRESERVA ("anio" != "ano"): descomponemos (NFD), sacamos TODOS
// los diacríticos combinantes MENOS U+0303 (la virgulilla de la ñ; en español solo aparece
// ahí), y recomponemos (NFC). Fuente 100% ASCII (escapes \u) para no depender de cómo el
// editor guarde los combinantes. Los nodos de ortografía/tildes usan el flag `estricto`.
export function normalizarTexto(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-̂̄-ͯ]/g, '') // diacríticos combinantes salvo U+0303 (ñ)
    .normalize('NFC') // recompone la ñ (n + U+0303)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // puntuación → espacio
    .replace(/\s+/g, ' ')
    .trim();
}

// Compara texto libre. Por default tolerante (normalizarTexto); `estricto` = solo trim+lower
// (mantiene la tilde/ortografía, para nodos donde ESO es lo que se evalúa).
export function corregirEscrito(dada: string, correcta: string, estricto = false): boolean {
  if (estricto) return String(dada ?? '').trim().toLowerCase() === String(correcta ?? '').trim().toLowerCase();
  return normalizarTexto(dada) === normalizarTexto(correcta);
}

// Compara la secuencia de fichas element-wise (normalizada): mismo largo y cada ficha en su lugar.
export function corregirOrden(dado: string[], correcto: string[]): boolean {
  if (dado.length !== correcto.length) return false;
  return dado.every((f, i) => normalizarTexto(f) === normalizarTexto(correcto[i]));
}

// Compara el emparejamiento (independiente del orden en que el chico armó los pares): cada
// izq debe apuntar a su der. Si hay izq duplicadas tras normalizar, no se puede validar → false.
export function corregirUnir(dados: Par[], esperados: Par[]): boolean {
  if (dados.length !== esperados.length) return false;
  const esperado = new Map(esperados.map((p) => [normalizarTexto(p.izq), normalizarTexto(p.der)]));
  if (esperado.size !== esperados.length) return false; // izq ambigua
  return dados.every((p) => esperado.get(normalizarTexto(p.izq)) === normalizarTexto(p.der));
}

// Representación legible de los pares — para el reveal, el diagnóstico y respuesta.dada en la DB.
export function serializarPares(pares: Par[]): string {
  return pares.map((p) => `${p.izq} → ${p.der}`).join(' · ');
}

// Texto de la respuesta del chico: burbuja del chat + campo respuesta.dada en la DB.
export function respuestaComoTexto(r: RespuestaDada): string {
  switch (r.formato) {
    case 'opciones': return r.opcion;
    case 'escribir': return r.texto;
    case 'ordenar': return r.orden.join(' ');
    case 'unir': return serializarPares(r.pares);
  }
}

// Ejercicio con lo justo para corregir (subset de web/lib/practica.ts Ejercicio).
export type EjercicioCorreccion = {
  formato?: string | null;
  opciones: string[];
  correcta: string;
  datos?: { pares?: Par[]; estricto?: boolean } | null;
};

// Dispatcher único de corrección. `opciones` mantiene igualdad EXACTA (histórico: el chico
// toca la opción textual almacenada). Los demás formatos normalizan.
export function esCorrecta(ej: EjercicioCorreccion, r: RespuestaDada): boolean {
  switch (r.formato) {
    case 'opciones':
      return r.opcion === ej.correcta;
    case 'escribir':
      return corregirEscrito(r.texto, ej.correcta, ej.datos?.estricto ?? false);
    case 'ordenar':
      return corregirOrden(r.orden, ej.opciones); // opciones = fichas en orden correcto
    case 'unir':
      return corregirUnir(r.pares, ej.datos?.pares ?? []);
  }
}

// Mezcla estable seeded por un string (hash fnv-1a + xorshift32). Determinística: misma
// semilla → misma permutación (tests estables y orden consistente al retomar la tanda). Si el
// resultado quedara idéntico al original y hay >1 item, rota 1 → una consigna de 'ordenar'
// nunca se muestra ya resuelta.
export function mezclarDeterminista<T>(items: T[], semilla: string): T[] {
  const a = [...items];
  if (a.length <= 1) return a;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  if (h === 0) h = 1;
  const rand = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.every((x, i) => x === items[i])) return [...a.slice(1), a[0]];
  return a;
}
