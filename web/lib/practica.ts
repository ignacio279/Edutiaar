// Lógica PURA de la práctica (web/lib/practica.ts): elección de ejercicios y
// resumen de la sesión. Sin DOM ni red → unit-testeable (igual que art.ts).

export type Ejercicio = {
  id: string;
  enunciado: string;
  opciones: string[];
  correcta: string;
  dificultad: number;
  tipo: string;
};

export type RespuestaReg = {
  ejercicio_id: string;
  dada: string;
  correcta: boolean;
  reintentos: number;
  tiempo_seg: number;
};

export const ORDEN_TIPO = ['reconocer', 'completar', 'ordenar', 'producir'] as const;

// Una respuesta previa del chico en el nodo (más reciente primero).
export type HistorialEjercicio = { correcta: boolean; reintentos: number; tipo: string; dificultad: number };

const esPrimerIntento = (h: HistorialEjercicio) => h.correcta && h.reintentos === 0;

// Dificultad objetivo (adaptativa): sube con racha de aciertos al 1er intento, baja si los 2
// más recientes fallaron. Arranca en la dificultad más baja del pool. Clamp a [min,max] del pool.
export function nivelAdaptativo(historial: HistorialEjercicio[], pool: Ejercicio[]): number {
  const difs = pool.map((e) => e.dificultad);
  const min = difs.length ? Math.min(...difs) : 1;
  const max = difs.length ? Math.max(...difs) : 1;
  if (historial.length === 0) return min;
  const ultimaDif = historial[0].dificultad;
  let racha = 0;
  for (const h of historial) { if (esPrimerIntento(h)) racha++; else break; }
  const dosUltimasMal = historial.length >= 2 && !esPrimerIntento(historial[0]) && !esPrimerIntento(historial[1]);
  let nivel = ultimaDif;
  if (racha >= 2) nivel = ultimaDif + 1;
  else if (dosUltimasMal) nivel = ultimaDif - 1;
  return Math.min(max, Math.max(min, nivel));
}

// Sirve hasta `max` ejercicios del pool, de menor a mayor dificultad (la "escalera":
// arranca fácil y sube). Determinístico para que los tests sean estables.
export function elegirEjercicios(pool: Ejercicio[], max = 8): Ejercicio[] {
  return [...pool].sort((a, b) => a.dificultad - b.dificultad).slice(0, max);
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
