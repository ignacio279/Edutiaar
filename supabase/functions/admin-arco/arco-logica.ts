// Lógica PURA de admin-arco (Alumno golondrina — WP-B, derechos ARCO Ley
// 25.326). Módulo hermano de index.ts SIN imports de Deno/supabase: testeable
// desde Node (patrón admin-observatorio/observatorio-logica.ts;
// tests/unit/arco-logica.test.mjs).
//
// Acá vive lo delicado: el snapshot ANÓNIMO pre-borrado (lo único que queda
// del chico después de una cancelación — por eso el test estructural congela
// que no lleve nombre ni uuids), el plan de borrado del dry-run y el diff de
// rectificación (solo identidad editable; el resto del legajo es registro
// histórico de hechos, no rectificable).

// ── Snapshot anónimo ────────────────────────────────────────────────────────
// Se recomputa JUSTO antes de borrar y se guarda en arco_caso.agregado: es el
// registro estadístico que sobrevive ("hubo un alumno de 3° en Salta con N
// sesiones"), sin NADA re-identificable. Las fechas se recortan al día
// (YYYY-MM-DD): la hora exacta de la primera sesión ya es una huella.
export type SnapshotAnonimo = {
  sesiones: number;
  respuestas: number;
  nodos_dominados: number;
  grado: number | null;
  provincia: string | null;
  rango_fechas: { desde: string; hasta: string } | null;
};

const nat = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

export function armarSnapshotAnonimo(datos: {
  fechasSesiones: (string | null | undefined)[];
  respuestas: number;
  nodosDominados: number;
  grado?: number | null;
  provincia?: string | null;
}): SnapshotAnonimo {
  const dias = datos.fechasSesiones
    .filter((f): f is string => typeof f === 'string' && f.length >= 10)
    .map((f) => f.slice(0, 10))
    .sort();
  return {
    sesiones: datos.fechasSesiones.length,
    respuestas: nat(datos.respuestas),
    nodos_dominados: nat(datos.nodosDominados),
    grado: typeof datos.grado === 'number' && Number.isFinite(datos.grado) ? datos.grado : null,
    provincia: typeof datos.provincia === 'string' && datos.provincia.trim() ? datos.provincia : null,
    rango_fechas: dias.length > 0 ? { desde: dias[0], hasta: dias[dias.length - 1] } : null,
  };
}

// ── Plan de borrado (dry-run de la cancelación) ─────────────────────────────
// A partir de conteos ya consultados arma la lista que ve el admin ANTES de
// confirmar ("Esto va a borrar: X sesiones, Y boletines…"). Singular/plural
// separados para que el front no diga "1 sesiones". auditoria y arco_caso NO
// aparecen a propósito: jamás se borran.
export type ItemBorrado = { clave: string; singular: string; plural: string; cantidad: number };

export type ConteosBorrado = {
  sesiones?: number;
  respuestas?: number;
  nodos?: number;
  boletines?: number;
  matriculas?: number;
  consentimientos?: number;
  transferencias?: number;
};

const ETIQUETAS: [keyof ConteosBorrado, string, string][] = [
  ['sesiones', 'sesión de práctica', 'sesiones de práctica'],
  ['respuestas', 'respuesta registrada', 'respuestas registradas'],
  ['nodos', 'nodo con progreso', 'nodos con progreso'],
  ['boletines', 'boletín', 'boletines'],
  ['matriculas', 'matrícula', 'matrículas'],
  ['consentimientos', 'consentimiento', 'consentimientos'],
  ['transferencias', 'transferencia', 'transferencias'],
];

export function planDeBorrado(conteos: ConteosBorrado): ItemBorrado[] {
  return ETIQUETAS.map(([clave, singular, plural]) => ({
    clave,
    singular,
    plural,
    cantidad: nat(conteos[clave]),
  }));
}

// ── Diff de rectificación ───────────────────────────────────────────────────
// El derecho de rectificación toca SOLO la identidad editable del perfil
// (nombre y avatar — no las protege perfil_guard). Sesiones, respuestas y
// progreso son hechos que pasaron: no se "rectifican". El diff {campo:
// {antes, despues}} queda en arco_caso.detalle como constancia.
export const CAMPOS_RECTIFICABLES = ['nombre', 'avatar'] as const;

export type DiffRectificacion = Record<string, { antes: string | null; despues: string }>;

export function diffRectificacion(
  actual: { nombre?: string | null; avatar?: string | null },
  cambios: Record<string, unknown>,
): { ok: true; diff: DiffRectificacion } | { ok: false; error: string } {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) {
    return { ok: false, error: 'sin_cambios' };
  }
  const claves = Object.keys(cambios);
  if (claves.length === 0) return { ok: false, error: 'sin_cambios' };

  const diff: DiffRectificacion = {};
  for (const campo of claves) {
    if (!(CAMPOS_RECTIFICABLES as readonly string[]).includes(campo)) {
      return { ok: false, error: `campo_no_rectificable: ${campo}` };
    }
    const valor = cambios[campo];
    if (typeof valor !== 'string' || valor.trim().length === 0) {
      return { ok: false, error: `valor_invalido: ${campo}` };
    }
    const despues = valor.trim();
    const antes = (actual as Record<string, string | null | undefined>)[campo] ?? null;
    if (antes === despues) continue; // no-op: no ensucia el diff
    diff[campo] = { antes, despues };
  }
  if (Object.keys(diff).length === 0) return { ok: false, error: 'sin_cambios' };
  return { ok: true, diff };
}
