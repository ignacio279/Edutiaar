// Validadores PUROS de admin-anuncios (banner in-app a maestras — Dashboard
// admin v3, WP8). Sin Deno, sin DOM: se testean desde Node
// (tests/unit/admin-anuncios.test.mjs). La Edge Function (index.ts) los
// importa y es la FUENTE DE VERDAD; la UI solo da feedback.
// Errores como códigos snake_case ({error:'codigo'}): el front los mapea a copy.

export const TITULO_MAX = 120;
export const CUERPO_MAX = 500;

export type Resultado = { ok: true } | { ok: false; error: string };

export type DatosAnuncio = {
  titulo?: unknown;
  cuerpo?: unknown;
  desde?: unknown; // ISO / yyyy-mm-dd / null (sin límite)
  hasta?: unknown;
};

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

// null/undefined/'' = "sin fecha" (legal). Si vino algo, tiene que parsear.
function parseFecha(v: unknown): { ok: boolean; fecha: Date | null } {
  if (v === undefined || v === null || v === '') return { ok: true, fecha: null };
  if (typeof v !== 'string') return { ok: false, fecha: null };
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? { ok: false, fecha: null } : { ok: true, fecha: d };
}

export function validarAnuncio(d: DatosAnuncio): Resultado {
  if (!noVacio(d.titulo)) return { ok: false, error: 'titulo_vacio' };
  if (d.titulo.trim().length > TITULO_MAX) return { ok: false, error: 'titulo_largo' };
  if (!noVacio(d.cuerpo)) return { ok: false, error: 'cuerpo_vacio' };
  if (d.cuerpo.trim().length > CUERPO_MAX) return { ok: false, error: 'cuerpo_largo' };
  const desde = parseFecha(d.desde);
  if (!desde.ok) return { ok: false, error: 'desde_invalida' };
  const hasta = parseFecha(d.hasta);
  if (!hasta.ok) return { ok: false, error: 'hasta_invalida' };
  if (desde.fecha && hasta.fecha && hasta.fecha.getTime() <= desde.fecha.getTime()) {
    return { ok: false, error: 'fechas_invertidas' };
  }
  return { ok: true };
}

// ¿El anuncio se muestra AHORA? Espejo exacto de la policy
// anuncio_select_docente (activo + ventana desde/hasta). `now` inyectado →
// determinístico y testeable; lo usan los tests y el front (vigencia en la
// lista del admin).
export function estaVigente(
  a: { activo?: boolean; desde?: string | null; hasta?: string | null },
  now: Date,
): boolean {
  if (!a.activo) return false;
  const t = now.getTime();
  if (a.desde && new Date(a.desde).getTime() > t) return false;
  if (a.hasta && new Date(a.hasta).getTime() < t) return false;
  return true;
}
