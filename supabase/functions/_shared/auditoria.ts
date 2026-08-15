// Registro de auditoría de las fns admin-* (Dashboard admin v3).
// Fire-and-forget: una auditoría caída no rompe la operación, pero se loguea.
// Toda acción MUTANTE de un admin debe pasar por acá (quién hizo qué y cuándo).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { AdminCtx } from './admin.ts';

export type EventoAuditoria = {
  accion: string; // 'crear_colegio', 'suspender_maestra', 'set_features', 'ver_como', ...
  entidad?: string; // 'escuela', 'perfil', 'anuncio', ...
  entidad_id?: string;
  detalle?: Record<string, unknown>;
};

// Devuelve la promesa del insert (antes era `void`): los call sites de
// siempre la siguen llamando sin awaitear (fire-and-forget, cero cambio para
// ellos). admin-jobs SÍ la awaitea en su tramo final (nap_backfill): si nada
// queda pendiente después del insert de auditoría, el runtime puede cortar
// la invocación al responder antes de que el fire-and-forget llegue a viajar.
export function registrarAuditoria(sb: SupabaseClient, ctx: AdminCtx, ev: EventoAuditoria): Promise<void> {
  return sb.from('auditoria')
    .insert({
      actor_id: ctx.user.id,
      actor_email: ctx.user.email ?? null,
      nivel: ctx.admin.nivel,
      accion: ev.accion,
      entidad: ev.entidad ?? null,
      entidad_id: ev.entidad_id ?? null,
      detalle: ev.detalle ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('auditoria_fallo', ev.accion, error.message);
    });
}
