// Lógica PURA del job nocturno de alertas (fase Observatorio y avisos).
// Sin imports de Deno ni supabase: la testea Node directo
// (tests/unit/admin-jobs.test.mjs). Hermana de _shared/alertas-logica.ts:
// evaluarAlertas decide QUÉ alertas están vigentes; acá se decide qué hacer
// con el snapshot persistido en admin_alerta para que quede igual a eso.
import type { AlertaAdmin } from '../_shared/alertas-logica.ts';

// Plan del snapshot: `upsert` = TODAS las nuevas (la clave determinística hace
// el upsert idempotente — misma clave, misma alerta); `borrar` = claves que
// están en la tabla pero ya no salen de evaluarAlertas (el hecho se resolvió:
// trial extendido → la clave vieja muere, colegio reactivado, cambió el mes).
// Determinístico: mismo input → mismo plan, en el mismo orden.
export function planSnapshotAlertas(
  nuevas: AlertaAdmin[],
  existentes: { clave: string }[],
): { upsert: AlertaAdmin[]; borrar: string[] } {
  const vigentes = new Set(nuevas.map((a) => a.clave));
  return {
    upsert: nuevas,
    borrar: existentes.map((e) => e.clave).filter((clave) => !vigentes.has(clave)),
  };
}
