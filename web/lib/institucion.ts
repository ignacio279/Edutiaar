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
  precision?: number | null;
  muestraInsuficiente?: boolean;
  costo_mes_usd?: number;
};

// Copy del desempeño respetando el k-anonimato: si la muestra es chica, se
// dice por qué no hay número — nunca se inventa ni se muestra igual.
export function copyPrecision(fila: {
  precision?: number | null; muestraInsuficiente?: boolean;
}): string {
  if (fila.muestraInsuficiente) return 'Muestra chica: no se muestra';
  if (fila.precision === null || fila.precision === undefined) return 'Sin práctica todavía';
  return `${fila.precision}% de aciertos`;
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
