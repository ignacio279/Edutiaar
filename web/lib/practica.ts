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
