// admin-jobs (fase Observatorio y avisos): jobs de mantenimiento del panel.
// Lo llaman DOS calladores distintos, y el guard es dual:
//   1. El CRON (pg_cron → llamar_admin_jobs, migración 0021): Authorization
//      Bearer con el SERVICE_ROLE key → ctx = null (sin admin humano).
//   2. Un ADMIN desde el panel ("Recalcular ahora"): sesión normal →
//      verificarAdmin como cualquier fn admin-*.
// Misma ruta de código para ambos → cero divergencia entre el job nocturno y
// el botón manual.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin, type AdminCtx } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { costosPorMes, evaluarAlertas, type AlertaAdmin, type EscuelaAlerta } from '../_shared/alertas-logica.ts';
import { planSnapshotAlertas } from './nocturno-logica.ts';

// Actor sentinel del cron en la auditoría (no hay admin humano detrás).
const CRON_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

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
      // Corrida nocturna (o "Recalcular ahora"): junta los MISMOS insumos que
      // juntaba admin-crm alertas_listar cuando calculaba on-demand, corre la
      // lógica pura y deja admin_alerta igual al resultado (upsert + borrado
      // de claves resueltas).
      case 'nocturno': {
        const now = new Date();
        const { data: escData, error: escErr } = await sb
          .from('escuela')
          .select('id, nombre, estado, trial_fin, limites')
          .neq('estado', 'archivado');
        if (escErr) throw escErr;
        const escuelas = (escData ?? []) as EscuelaAlerta[];

        // Última sesión por escuela: max(fecha) de sesion → perfil del alumno.
        // Iterar escuelas está bien para el volumen del MVP (pocas decenas).
        const ultimaSesionPorEscuela: Record<string, string | null> = {};
        for (const e of escuelas) {
          const { data: s } = await sb
            .from('sesion')
            .select('fecha, alumno:alumno_id!inner(escuela_id)')
            .eq('alumno.escuela_id', e.id)
            .order('fecha', { ascending: false })
            .limit(1);
          ultimaSesionPorEscuela[e.id] = (s?.[0] as { fecha?: string } | undefined)?.fecha ?? null;
        }

        // Costos del mes actual y el anterior desde uso_api (vacía → todo 0).
        const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const { data: usos } = await sb
          .from('uso_api')
          .select('escuela_id, costo_usd, created_at')
          .gte('created_at', inicioMesAnterior);
        const { mesActual, mesAnterior } = costosPorMes(
          (usos ?? []) as { escuela_id: string | null; costo_usd: number; created_at: string }[],
          now,
        );

        const { data: at } = await sb.from('admin_alerta_atendida').select('clave');
        const atendidas = ((at ?? []) as { clave: string }[]).map((a) => a.clave);

        const nuevas = evaluarAlertas({
          escuelas,
          ultimaSesionPorEscuela,
          costoMesPorEscuela: mesActual,
          costoMesAnteriorPorEscuela: mesAnterior,
          atendidas,
        }, now);

        // Plan contra el snapshot actual: upsert idempotente por clave +
        // borrado de las claves cuyo hecho ya se resolvió.
        const { data: exData, error: exErr } = await sb.from('admin_alerta').select('clave');
        if (exErr) throw exErr;
        const { upsert, borrar } = planSnapshotAlertas(nuevas, (exData ?? []) as { clave: string }[]);

        if (upsert.length > 0) {
          const corridaAt = now.toISOString();
          const { error: upErr } = await sb
            .from('admin_alerta')
            .upsert(upsert.map((a: AlertaAdmin) => ({
              clave: a.clave,
              tipo: a.tipo,
              prioridad: a.prioridad,
              escuela_id: a.escuelaId,
              escuela_nombre: a.escuelaNombre,
              titulo: a.titulo,
              detalle: a.detalle,
              generada_at: corridaAt,
            })), { onConflict: 'clave' });
          if (upErr) throw upErr;
        }
        if (borrar.length > 0) {
          const { error: delErr } = await sb.from('admin_alerta').delete().in('clave', borrar);
          if (delErr) throw delErr;
        }

        // Auditoría: manual = recalcular_alertas con el admin; cron =
        // job_nocturno con el actor sentinel (fire-and-forget con catch).
        const detalle = { generadas: upsert.length, borradas: borrar.length };
        if (ctx) {
          registrarAuditoria(sb, ctx, { accion: 'recalcular_alertas', detalle });
        } else {
          sb.from('auditoria')
            .insert({
              actor_id: CRON_ACTOR_ID,
              actor_email: 'cron@edutia',
              nivel: null,
              accion: 'job_nocturno',
              detalle,
            })
            .then(({ error }) => {
              if (error) console.error('auditoria_fallo', 'job_nocturno', error.message);
            });
        }

        return json({ ok: true, generadas: upsert.length, borradas: borrar.length, corrida_at: now.toISOString() });
      }

      // accion 'luna_nocturno': job de alertas de LUNA (pendiente del ROADMAP) — se cuelga acá.

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
