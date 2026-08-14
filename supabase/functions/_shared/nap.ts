// Catálogo NAP (Núcleos de Aprendizajes Prioritarios, Nivel Primario) — la vara
// fija contra la que el observatorio mide el aprendizaje.
//
// OJO: el catálogo arranca VACÍO a propósito. Se llena transcribiéndolo de las
// resoluciones del Consejo Federal de Educación, con la fuente a la vista —
// NUNCA generado por un modelo ni de memoria. Un catálogo inventado invalida
// todo lo que se construya encima.
//
// Espejado en web/lib/admin/nap.ts (test de paridad en
// tests/unit/nap-catalogo.test.mjs), mismo patrón que provincias.ts y planes.ts.

export const MATERIAS_NAP = ['Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales'] as const;

export type TemaNap = { nombre: string; grado: number; orden: number };
export type EjeNap = { materia: string; nombre: string; orden: number; temas: TemaNap[] };

export const CATALOGO_NAP: EjeNap[] = [];
