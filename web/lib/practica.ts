// Lógica PURA de la práctica (web/lib/practica.ts): elección de ejercicios y
// resumen de la sesión. Sin DOM ni red → unit-testeable (igual que art.ts).

export type Ejercicio = {
  id: string;
  enunciado: string;
  opciones: string[];
  correcta: string;
  dificultad: number;
  tipo: string;
  formato?: string | null; // 'opciones' (default) | 'escribir' | 'ordenar' | 'unir'
  datos?: { pares?: { izq: string; der: string }[]; estricto?: boolean } | null;
  imagen?: string | null; // clave de dibujo (art.ts item()) para pre-lectores
};

// Formatos que el front sabe PINTAR hoy (crece con el widget, slice por slice). Defensa contra
// skew de versiones: si el server sirviera un formato que este front todavía no renderiza,
// filtrarRenderizables lo saca del pool en vez de romper la práctica con una tanda vacía.
export const FORMATOS_RENDERIZABLES = ['opciones', 'escribir', 'ordenar', 'unir'] as const;

export function filtrarRenderizables(pool: Ejercicio[]): Ejercicio[] {
  return pool.filter((e) => (FORMATOS_RENDERIZABLES as readonly string[]).includes(e.formato ?? 'opciones'));
}

export type RespuestaReg = {
  ejercicio_id: string;
  dada: string;
  correcta: boolean;
  reintentos: number;
  tiempo_seg: number;
};

export const ORDEN_TIPO = ['reconocer', 'completar', 'ordenar', 'producir'] as const;

// ── Bandas de grado (espejo de generador-ejercicios/generar.ts) ──────────────
// Mantené bandaDeGrado en sync con el server; hay un test espejo que importa
// ambas y las compara para grados 1..7.
export type Banda = 'chiquitos' | 'medianos' | 'grandes';

export function bandaDeGrado(grado: number): Banda {
  if (grado <= 2) return 'chiquitos';
  if (grado <= 4) return 'medianos';
  return 'grandes';
}

// Piso de dificultad para el arranque EN FRÍO (sin historia en el nodo): los grandes
// (5°-7°) empiezan en dificultad 2, el resto en 1. Con historia manda la escalera
// adaptativa, que puede bajar del piso si el chico se traba.
export function pisoBanda(banda: Banda): number {
  return banda === 'grandes' ? 2 : 1;
}

// Una respuesta previa del chico en el nodo (más reciente primero).
export type HistorialEjercicio = { correcta: boolean; reintentos: number; tipo: string; dificultad: number };

const esPrimerIntento = (h: HistorialEjercicio) => h.correcta && h.reintentos === 0;

// Dificultad objetivo (adaptativa): sube con racha de aciertos al 1er intento, baja si los 2
// más recientes fallaron. En frío arranca en el piso (por banda), acotado al rango del pool.
// Clamp a [min,max] del pool.
export function nivelAdaptativo(historial: HistorialEjercicio[], pool: Ejercicio[], piso = 1): number {
  const difs = pool.map((e) => e.dificultad);
  const min = difs.length ? Math.min(...difs) : 1;
  const max = difs.length ? Math.max(...difs) : 1;
  if (historial.length === 0) return Math.min(max, Math.max(min, piso));
  const ultimaDif = historial[0].dificultad;
  let racha = 0;
  for (const h of historial) { if (esPrimerIntento(h)) racha++; else break; }
  const dosUltimasMal = historial.length >= 2 && !esPrimerIntento(historial[0]) && !esPrimerIntento(historial[1]);
  let nivel = ultimaDif;
  if (racha >= 2) nivel = ultimaDif + 1;
  else if (dosUltimasMal) nivel = ultimaDif - 1;
  return Math.min(max, Math.max(min, nivel));
}

// Tipos que el chico todavía NO demostró al primer intento, en orden de demanda creciente
// (reconocer→producir). Es la "escalera de cobertura": empuja hacia lo que le falta cubrir.
export function tiposPendientes(historial: HistorialEjercicio[]): string[] {
  const dominados = new Set(historial.filter(esPrimerIntento).map((h) => h.tipo));
  return ORDEN_TIPO.filter((t) => !dominados.has(t));
}

// Sirve hasta `max` ejercicios del pool, personalizados a la historia del chico en el nodo:
// (1) ESCALERA DE COBERTURA: prioriza los tipos que le faltan demostrar (reconocer→producir).
// (2) DIFICULTAD ADAPTATIVA: dentro de eso, acerca la dificultad al nivel adaptativo (sube si
//     viene acertando, baja si falla). Determinístico (tests estables): desempata por dificultad e id.
export function elegirEjercicios(pool: Ejercicio[], historial: HistorialEjercicio[] = [], max = 8, piso = 1): Ejercicio[] {
  const nivel = nivelAdaptativo(historial, pool, piso);
  const pendientes = tiposPendientes(historial);
  const prioridadTipo = (t: string) => {
    const i = pendientes.indexOf(t);
    return i === -1 ? ORDEN_TIPO.length : i; // pendientes primero, en orden de demanda
  };
  return [...pool]
    .sort(
      (a, b) =>
        prioridadTipo(a.tipo) - prioridadTipo(b.tipo) ||
        Math.abs(a.dificultad - nivel) - Math.abs(b.dificultad - nivel) ||
        a.dificultad - b.dificultad ||
        a.id.localeCompare(b.id),
    )
    .slice(0, max);
}

// Resumen de la sesión: aciertos finales, total y aciertos al PRIMER intento
// (correcta sin reintentos) — este último es lo que mira la regla de dominio.
export function resumen(respuestas: RespuestaReg[]): { aciertos: number; total: number; primerIntento: number } {
  return {
    total: respuestas.length,
    aciertos: respuestas.filter((r) => r.correcta).length,
    primerIntento: respuestas.filter((r) => r.correcta && r.reintentos === 0).length,
  };
}

// ── Nunca repetir (DP5) + gatillo de reposición (DP6) ─────────────────────────
// Un chico nunca vuelve a ver un ejercicio que ya respondió. El reintento
// inmediato dentro del ejercicio NO es repetición (es el mismo intento).

export const UMBRAL_REPOSICION = 16; // ~2 sesiones de margen sin ver

export function filtrarNoVistos(pool: Ejercicio[], vistosIds: Iterable<string>): Ejercicio[] {
  const vistos = new Set(vistosIds);
  return pool.filter((e) => !vistos.has(e.id));
}

export function necesitaReposicion(noVistos: number): boolean {
  return noVistos < UMBRAL_REPOSICION;
}
