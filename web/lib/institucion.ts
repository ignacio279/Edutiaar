// Lógica PURA del panel institucional (alumno golondrina, migración 0025).
// Sin DOM ni imports: la testea Node directo.
//
// REGLA: acá nunca entra un dato de alumno individual. Todo lo que se formatea
// son NÚMEROS ya agregados por institucion-panel.

export type FilaColegio = {
  escuela_id: string;
  nombre: string;
  provincia?: string | null;
  sesiones?: number;
  alumnos_activos_7d?: number;
  costo_mes_usd?: number;
};

// ── Desempeño contra el marco NAP ───────────────────────────────────────────
// El aprendizaje se mide contra la vara fija de los NAP, NO comparando la
// precisión cruda entre colegios: distintos grados, distintos nodos y
// dificultad adaptativa por chico la vuelven incomparable (misma doctrina que
// retiró ese número de /admin/metricas el 2026-08-17).

// Las cuatro materias del marco. Duplicadas a propósito de web/lib/admin/nap.ts
// para no arrastrar el catálogo de 289 temas al bundle de esta página; un test
// de paridad (institucion-nap.test.mjs) impide que diverjan.
export const MATERIAS_PANEL = ['Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales'] as const;
export const GRADOS_PRIMARIA = [1, 2, 3, 4, 5, 6, 7] as const;

// Cobertura: cuántos de MIS colegios dieron el tema. Se dice SIEMPRE — sin
// esto, un tema que dio un solo colegio se lee como un dato de toda la red.
export function copyCobertura(conTema: number, total: number): string {
  const n = Number(conTema) || 0;
  const m = Number(total) || 0;
  if (m === 0) return 'todavía sin práctica';
  if (n === 0) return 'ningún colegio dio este tema';
  return `${n} de ${m} colegios`;
}

// Copy del desempeño respetando el k-anonimato: si la muestra es chica se dice
// por qué no hay número; nunca se inventa ni se muestra igual.
export function copyDesempenoTema(t: {
  alumnos?: number; dominioPromedio?: number | null; muestraInsuficiente?: boolean;
}): string {
  if (!t.alumnos) return 'todavía sin práctica';
  if (t.muestraInsuficiente || t.dominioPromedio === null || t.dominioPromedio === undefined) {
    return 'muestra chica: no se muestra';
  }
  return `${t.dominioPromedio}% de dominio`;
}

// Totales de la institución. Los agregados de desempeño NO se promedian entre
// colegios (sería un promedio de promedios): solo se suma lo que es volumen.
export function totalesInstitucion(filas: FilaColegio[]): {
  colegios: number; sesiones: number; activos: number; costo: number;
} {
  return (filas ?? []).reduce(
    (acc, f) => ({
      colegios: acc.colegios + 1,
      sesiones: acc.sesiones + (Number(f.sesiones) || 0),
      activos: acc.activos + (Number(f.alumnos_activos_7d) || 0),
      costo: acc.costo + (Number(f.costo_mes_usd) || 0),
    }),
    { colegios: 0, sesiones: 0, activos: 0, costo: 0 },
  );
}

export const copyCosto = (usd: number): string => `US$ ${(Number(usd) || 0).toFixed(2)}`;

// Deuda de consentimientos de un colegio (solo el número, nunca los nombres).
export function copyDeuda(pendientes: number): string {
  const n = Number(pendientes) || 0;
  if (n <= 0) return 'Consentimientos al día';
  return n === 1 ? '1 consentimiento pendiente' : `${n} consentimientos pendientes`;
}
