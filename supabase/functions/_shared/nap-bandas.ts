// Bandas de confianza del mapeo NAP (feature "auto-triage por banda",
// 2026-08-18). La clasificación de SOL (dividir-nodos / nap_backfill) queda
// escrita tal cual en la base; estas bandas son INTERPRETACIÓN al leer, nunca
// se escribe nada por estar en una banda (mismo principio que el relato de la
// auditoría: cambiar el criterio es editar este archivo, y aplica retroactivo).
//
// - confiable  (>= UMBRAL_CONFIABLE): cuenta en el Observatorio sin pasar por
//   la cola de revisión.
// - revisar    ([UMBRAL_DESCARTE, UMBRAL_CONFIABLE) o tema sin confianza): la
//   cola del admin. Pendiente = indeciso: NO cuenta hasta que alguien confirme.
// - descartado (< UMBRAL_DESCARTE o sin propuesta): fuera del marco efectivo.
//   No cuenta ni aparece en la cola por defecto, pero es RECUPERABLE — el
//   toggle "descartados" de la pantalla lo lista y confirmar lo rescata.
//
// La decisión humana (nap_revisado = true) siempre manda sobre la banda.
//
// Espejo en web/lib/admin/nap-bandas.ts con test de paridad
// (tests/unit/nap-bandas.test.mjs) — si se despegan, el copy del front miente.

export const UMBRAL_CONFIABLE = 0.75;
export const UMBRAL_DESCARTE = 0.60;

export type BandaNap = 'confiable' | 'revisar' | 'descartado';

export type NodoBandeable = {
  nap_tema_id?: string | null;
  nap_confianza?: number | null;
  nap_revisado?: boolean | null;
};

export function bandaNap(n: NodoBandeable): BandaNap {
  if (!n.nap_tema_id) return 'descartado';
  const conf = n.nap_confianza;
  // Mapeo sin respaldo (tema puesto, confianza nunca registrada — el schema
  // de la tool no la exige): lo mira un humano, jamás se descarta solo.
  if (conf === null || conf === undefined) return 'revisar';
  if (conf >= UMBRAL_CONFIABLE) return 'confiable';
  if (conf >= UMBRAL_DESCARTE) return 'revisar';
  return 'descartado';
}

// ¿Este mapeo entra al agregado del Observatorio? Revisado: vale la decisión
// humana (tema puesto = sí, fuera del marco = no). Sin revisar: solo la banda
// confiable — un pendiente o descartado no suma al dato provincial.
export function mapeoCuenta(n: NodoBandeable): boolean {
  if (n.nap_revisado) return Boolean(n.nap_tema_id);
  return bandaNap(n) === 'confiable';
}
