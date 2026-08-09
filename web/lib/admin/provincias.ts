// Espejo exacto: supabase/functions/_shared/provincias.ts ↔ web/lib/admin/provincias.ts
// — el test de paridad (tests/unit/admin-provincias.test.mjs) los compara byte a byte.
// Las 24 jurisdicciones argentinas, en el MISMO orden que el check constraint de
// escuela.provincia (migración 0021). La validación es EXACTA (la UI usa un
// select, nunca tipea); un valor fuera de la lista es error del caller.
export const PROVINCIAS = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
  'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
] as const;

export type Provincia = (typeof PROVINCIAS)[number];

export function esProvinciaValida(p: unknown): p is Provincia {
  return typeof p === 'string' && (PROVINCIAS as readonly string[]).includes(p);
}
