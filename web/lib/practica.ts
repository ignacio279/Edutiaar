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
export function elegirEjercicios(pool: Ejercicio[], historial: HistorialEjercicio[] = [], max = 8): Ejercicio[] {
  const nivel = nivelAdaptativo(historial, pool);
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
