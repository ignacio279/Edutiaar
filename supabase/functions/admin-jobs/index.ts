// admin-jobs (fase Observatorio y avisos): jobs de mantenimiento del panel.
// Lo llaman DOS calladores distintos, y el guard es dual:
//   1. El CRON (pg_cron → llamar_admin_jobs, migración 0021): Authorization
//      Bearer con el SERVICE_ROLE key → ctx = null (sin admin humano).
//   2. Un ADMIN desde el panel ("Recalcular ahora"): sesión normal →
//      verificarAdmin como cualquier fn admin-*.
// Misma ruta de código para ambos → cero divergencia entre el job nocturno y
// el botón manual.
// Slot futuro documentado: accion 'luna_nocturno' (job de alertas de LUNA,
// pendiente del ROADMAP) se cuelga de este mismo switch y del mismo cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin, type AdminCtx } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Guard dual: el cron manda el service key tal cual; un humano, su JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    let ctx: AdminCtx | null = null;
    if (authHeader !== `Bearer ${srKey}`) {
      const r = await verificarAdmin(req);
      if (r instanceof Response) return r;
      ctx = r;
    }
    const sb = ctx?.sb ?? createClient(url, srKey);

    const { accion } = await req.json();
    switch (accion) {
      case 'nocturno': {
        // Esqueleto de fundaciones — WP-B lo reemplaza por la corrida real
        // (evaluarAlertas → planSnapshotAlertas → upsert/delete en admin_alerta).
        void sb; // el cliente queda listo para WP-B
        return json({ ok: true, nota: 'esqueleto' });
      }
      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
