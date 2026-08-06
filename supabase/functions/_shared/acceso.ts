// Enforcement de acceso, trials y topes mensuales (Dashboard admin v3, WP3).
// Cara I/O de _shared/acceso-logica.ts (que es pura y testeada desde Node).
//
// ── CONTRATO para la Fase final (cableado en las 10 fns existentes) ─────────
// Cada Edge Function existente, DESPUÉS de autenticar al caller y ANTES de
// operar, agrega SOLO esto (sb = cliente service_role):
//
//   import { verificarAcceso } from '../_shared/acceso.ts';
//   const v = await verificarAcceso(sb, user.id, { genera: true, feature: 'sol' });
//   if (!v.permitido) return json({ error: v.motivo }, v.status);
//   // v.escuelaId queda listo para instrumentar uso_api (F2).
//
// `genera`: true si la acción crea contenido / gasta IA (generar ejercicios,
//   dividir nodos, evaluar, chatear, boletines). Lecturas → genera:false: el
//   corte del trial es SUAVE y en solo_lectura las lecturas siguen pasando.
// `feature`: 'sol' | 'luna.alertas' | 'luna.boletines' | 'luna.chat'. Omitir
//   si la acción no cuelga de ningún toggle (ej. gestion-alumnos).
// Veredictos (motivo → status): colegio_suspendido / cuenta_suspendida /
//   sin_perfil / sin_escuela / trial_vencido / feature_apagada → 403 ·
//   tope_excedido → 429 · acceso_no_disponible (falló la RPC) → 500 ·
//   permitido → { permitido: true, motivo: null, status: 200 }.
//
// La fuente de verdad del ESTADO es la RPC acceso_de (SECURITY DEFINER, solo
// service_role — migración 0018); acá solo se le suma el conteo de uso_api del
// mes calendario UTC contra escuela.limites (?? LIMITES_DEFAULT).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  type Acceso,
  type Feature,
  type Veredicto,
  claveTope,
  decidirAcceso,
  FUNCIONES_POR_FEATURE,
  inicioMesUTC,
} from './acceso-logica.ts';

export type VeredictoConEscuela = Veredicto & { escuelaId: string | null };

export async function verificarAcceso(
  sb: SupabaseClient,
  perfilId: string,
  opts: { genera: boolean; feature?: string },
): Promise<VeredictoConEscuela> {
  const { data: acc, error } = await sb.rpc('acceso_de', { p_perfil: perfilId });
  if (error || !acc) {
    return { permitido: false, motivo: 'acceso_no_disponible', status: 500, escuelaId: null };
  }
  const acceso = acc as Acceso;

  const { data: perfil } = await sb.from('perfil').select('escuela_id').eq('id', perfilId).maybeSingle();
  const escuelaId = (perfil as { escuela_id?: string } | null)?.escuela_id ?? null;

  // Primer veredicto sin tocar uso_api: estado + feature ya resuelven casi todo.
  const base = decidirAcceso({ acceso, genera: opts.genera, feature: opts.feature });
  if (!base.permitido) return { ...base, escuelaId };

  // Tope mensual: solo si la acción genera y la feature tiene tope.
  const clave = claveTope(opts.feature);
  if (opts.genera && clave && escuelaId) {
    const funciones = FUNCIONES_POR_FEATURE[opts.feature as Feature] ?? [];
    const [{ data: esc }, { count }] = await Promise.all([
      sb.from('escuela').select('limites').eq('id', escuelaId).maybeSingle(),
      sb.from('uso_api')
        .select('id', { count: 'exact', head: true })
        .eq('escuela_id', escuelaId)
        .in('funcion', [...funciones])
        .gte('created_at', inicioMesUTC()),
    ]);
    const v = decidirAcceso({
      acceso,
      genera: opts.genera,
      feature: opts.feature,
      usoMes: count ?? 0,
      limites: (esc as { limites?: Record<string, number | null> } | null)?.limites ?? null,
    });
    return { ...v, escuelaId };
  }

  return { ...base, escuelaId };
}
