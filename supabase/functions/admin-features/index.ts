// admin-features (WP4, Dashboard admin v3): toggles SOL/LUNA/TERRA por colegio.
// Guard verificarAdmin (plataforma_admin, _shared/admin.ts); escritura SOLO acá
// — la docente apenas LEE su fila de escuela_feature por RLS (D5 de la spec).
// Los presets escriben los mismos flags; `plan` se deriva con detectarPlan.
// Toda mutación audita (set_features / aplicar_preset).
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { PRESETS, detectarPlan, normalizarFlags, validarFlags } from './planes.ts';

const noVacio = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion, escuela_id } = body;
    if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);

    const { data: esc } = await sb.from('escuela').select('id').eq('id', escuela_id).maybeSingle();
    if (!esc) return json({ error: 'colegio_inexistente' }, 404);

    switch (accion) {
      case 'obtener': {
        const { data, error } = await sb
          .from('escuela_feature')
          .select('flags, plan, updated_at')
          .eq('escuela_id', escuela_id)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          // Sin fila = default de la plataforma (preset 'docente', el mismo
          // shape que features_default() en la migración 0018).
          return json({ flags: PRESETS.docente, plan: 'docente', updated_at: null, creada: false });
        }
        const fila = data as { flags: unknown; plan: string; updated_at: string };
        return json({ flags: normalizarFlags(fila.flags), plan: fila.plan, updated_at: fila.updated_at, creada: true });
      }

      case 'set_features': {
        const v = validarFlags(body.flags);
        if (!v.ok) return json({ error: v.error }, 400);
        const plan = detectarPlan(v.flags);
        const { error } = await sb
          .from('escuela_feature')
          .upsert({ escuela_id, flags: v.flags, plan, updated_at: new Date().toISOString() });
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'set_features',
          entidad: 'escuela',
          entidad_id: escuela_id,
          detalle: { plan, flags: v.flags },
        });
        return json({ flags: v.flags, plan });
      }

      case 'aplicar_preset': {
        const { plan } = body;
        if (plan !== 'basico' && plan !== 'docente' && plan !== 'completo') {
          return json({ error: 'plan_invalido' }, 400);
        }
        const flags = PRESETS[plan as 'basico' | 'docente' | 'completo'];
        const { error } = await sb
          .from('escuela_feature')
          .upsert({ escuela_id, flags, plan, updated_at: new Date().toISOString() });
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'aplicar_preset',
          entidad: 'escuela',
          entidad_id: escuela_id,
          detalle: { plan, flags },
        });
        return json({ flags, plan });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
