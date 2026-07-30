// Lógica PURA de "LUNA por aula": resolver qué aula queda activa a partir del
// searchParam `?aula=` y las aulas de la docente, armar los links internos de
// la sección propagando esa aula y acotar la lista de alumnos. Sin DOM ni red
// → unit-testeable (tests/unit/luna-aula.test.mjs).
//
// Reglas:
// - Param válido (una de MIS aulas) → esa aula queda activa.
// - Sin param (o param inválido) y UNA sola aula → auto-selección, sin selector.
// - Sin param (o param inválido) y 0 o 2+ aulas → selector.

export type AulaLite = { id: string; nombre: string; codigo: string };

export type ResolucionAula =
  | { modo: 'selector' }
  | { modo: 'aula'; aula: AulaLite };

export function resolverAula(param: string | null | undefined, aulas: AulaLite[]): ResolucionAula {
  const elegida = param ? aulas.find((a) => a.id === param) : undefined;
  if (elegida) return { modo: 'aula', aula: elegida };
  if (aulas.length === 1) return { modo: 'aula', aula: aulas[0] };
  return { modo: 'selector' };
}

// Link interno de la sección LUNA propagando el aula activa. Sin aula → la
// ruta pelada (que en /docente/luna es el selector o la auto-selección).
export function linkLuna(ruta: string, aulaId: string | null | undefined): string {
  return aulaId ? `${ruta}?aula=${encodeURIComponent(aulaId)}` : ruta;
}

// "Cambiar de aula" solo tiene sentido con 2 o más aulas: con una sola, el
// selector nunca se muestra (auto-selección) y el link sería un loop.
export function puedeCambiarAula(aulas: AulaLite[]): boolean {
  return aulas.length >= 2;
}

// Alumnos que pertenecen al aula activa (los que no tienen aula no entran a
// ninguna: mejor no mostrarlos que adivinar).
export function enAula<T extends { aula_id: string | null }>(alumnos: T[], aulaId: string): T[] {
  return alumnos.filter((a) => a.aula_id === aulaId);
}
