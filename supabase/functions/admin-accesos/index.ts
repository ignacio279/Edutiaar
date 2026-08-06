// admin-accesos (Dashboard admin v3, WP3): trials por colegio o maestra con
// corte SUAVE (al vencer → solo_lectura vía acceso_calcular, migración 0018),
// extensión con un click, topes mensuales de IA por colegio y consumo del mes.
// Guard: verificarAdmin (plataforma_admin). Toda mutación audita.
// La validación es pura y compartida con el enforcement: _shared/acceso-logica.ts.
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { cors, json } from '../_shared/cors.ts';
import {
  diasValidos,
  extenderTrialDesde,
  FUNCIONES_POR_FEATURE,
  hoyISO,
  inicioMesUTC,
  limitesEfectivos,
  validarFechasTrial,
  validarLimites,
} from '../_shared/acceso-logica.ts';

type Escuela = {
  id: string;
  nombre: string;
  estado: string;
  trial_inicio: string | null;
  trial_fin: string | null;
  limites: Record<string, number | null> | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    const escuelaPorId = async (id: unknown): Promise<Escuela | null> => {
      if (typeof id !== 'string' || !id) return null;
      const { data } = await sb
        .from('escuela')
        .select('id, nombre, estado, trial_inicio, trial_fin, limites')
        .eq('id', id)
        .maybeSingle();
      return (data as Escuela | null) ?? null;
    };
    const docentePorId = async (id: unknown): Promise<{ id: string } | null> => {
      if (typeof id !== 'string' || !id) return null;
      const { data } = await sb.from('perfil').select('id, rol').eq('id', id).maybeSingle();
      const p = data as { id: string; rol: string } | null;
      return p?.rol === 'docente' ? { id: p.id } : null;
    };
    // Exactamente UNO de escuela_id/perfil_id.
    const objetivoInvalido = (e: unknown, p: unknown) => Boolean(e) === Boolean(p);

    switch (accion) {
      // ── Trial explícito por colegio o maestra ───────────────────────────
      case 'set_trial': {
        const { escuela_id, perfil_id, inicio, fin } = body;
        if (objetivoInvalido(escuela_id, perfil_id)) return json({ error: 'objetivo_invalido' }, 400);
        const v = validarFechasTrial(inicio, fin);
        if (!v.ok) return json({ error: 'fechas_invalidas' }, 400);

        if (escuela_id) {
          const esc = await escuelaPorId(escuela_id);
          if (!esc) return json({ error: 'colegio_inexistente' }, 404);
          const patch: Record<string, unknown> = { trial_inicio: inicio, trial_fin: fin };
          if (esc.estado === 'activo') patch.estado = 'trial';
          const { error } = await sb.from('escuela').update(patch).eq('id', escuela_id);
          if (error) throw error;
          registrarAuditoria(sb, ctx, {
            accion: 'set_trial', entidad: 'escuela', entidad_id: escuela_id, detalle: { inicio, fin },
          });
          return json({ ok: true, trial_inicio: inicio, trial_fin: fin });
        }

        const doc = await docentePorId(perfil_id);
        if (!doc) return json({ error: 'docente_inexistente' }, 404);
        const { error } = await sb
          .from('docente_acceso')
          .upsert({ perfil_id, trial_inicio: inicio, trial_fin: fin });
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'set_trial', entidad: 'perfil', entidad_id: perfil_id, detalle: { inicio, fin },
        });
        return json({ ok: true, trial_inicio: inicio, trial_fin: fin });
      }

      // ── Extensión con un click: fin += dias desde max(hoy, fin actual) ──
      case 'extender_trial': {
        const { escuela_id, perfil_id } = body;
        const dias = body.dias === undefined ? 30 : body.dias;
        if (objetivoInvalido(escuela_id, perfil_id)) return json({ error: 'objetivo_invalido' }, 400);
        if (!diasValidos(dias)) return json({ error: 'dias_invalidos' }, 400);
        const hoy = hoyISO();

        if (escuela_id) {
          const esc = await escuelaPorId(escuela_id);
          if (!esc) return json({ error: 'colegio_inexistente' }, 404);
          const nuevoFin = extenderTrialDesde(esc.trial_fin, dias, hoy);
          const patch: Record<string, unknown> = { trial_fin: nuevoFin };
          if (!esc.trial_inicio) patch.trial_inicio = hoy;
          const { error } = await sb.from('escuela').update(patch).eq('id', escuela_id);
          if (error) throw error;
          registrarAuditoria(sb, ctx, {
            accion: 'extender_trial', entidad: 'escuela', entidad_id: escuela_id, detalle: { dias, nuevo_fin: nuevoFin },
          });
          return json({ ok: true, nuevo_fin: nuevoFin });
        }

        const doc = await docentePorId(perfil_id);
        if (!doc) return json({ error: 'docente_inexistente' }, 404);
        const { data: acc } = await sb
          .from('docente_acceso')
          .select('trial_inicio, trial_fin')
          .eq('perfil_id', perfil_id)
          .maybeSingle();
        const fila = acc as { trial_inicio: string | null; trial_fin: string | null } | null;
        const nuevoFin = extenderTrialDesde(fila?.trial_fin ?? null, dias, hoy);
        const { error } = await sb
          .from('docente_acceso')
          .upsert({ perfil_id, trial_inicio: fila?.trial_inicio ?? hoy, trial_fin: nuevoFin });
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'extender_trial', entidad: 'perfil', entidad_id: perfil_id, detalle: { dias, nuevo_fin: nuevoFin },
        });
        return json({ ok: true, nuevo_fin: nuevoFin });
      }

      // ── Fin del trial: el colegio pasa a cliente activo ─────────────────
      case 'finalizar_trial': {
        const { escuela_id } = body;
        const esc = await escuelaPorId(escuela_id);
        if (!esc) return json({ error: 'colegio_inexistente' }, 404);
        const { error } = await sb.from('escuela').update({ estado: 'activo', trial_fin: null }).eq('id', escuela_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'finalizar_trial', entidad: 'escuela', entidad_id: escuela_id, detalle: { estado_anterior: esc.estado },
        });
        return json({ ok: true });
      }

      // ── Topes mensuales de IA del colegio ───────────────────────────────
      case 'set_limites': {
        const { escuela_id, limites } = body;
        const esc = await escuelaPorId(escuela_id);
        if (!esc) return json({ error: 'colegio_inexistente' }, 404);
        const v = validarLimites(limites);
        if (!v.ok) return json({ error: 'limites_invalidos' }, 400);
        const { error } = await sb.from('escuela').update({ limites: v.limites }).eq('id', escuela_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'set_limites', entidad: 'escuela', entidad_id: escuela_id, detalle: { limites: v.limites },
        });
        return json({ ok: true, limites_efectivos: limitesEfectivos(v.limites) });
      }

      // ── Resumen para la UI: acceso + límites efectivos + uso del mes ────
      case 'estado_uso': {
        const { escuela_id } = body;
        const esc = await escuelaPorId(escuela_id);
        if (!esc) return json({ error: 'colegio_inexistente' }, 404);
        const desde = inicioMesUTC();
        const uso: Record<string, number> = {};
        for (const [feature, funciones] of Object.entries(FUNCIONES_POR_FEATURE)) {
          if (!funciones.length) continue; // luna.alertas: sin tope, sin conteo
          const { count } = await sb
            .from('uso_api')
            .select('id', { count: 'exact', head: true })
            .eq('escuela_id', esc.id)
            .in('funcion', [...funciones])
            .gte('created_at', desde);
          uso[feature] = count ?? 0;
        }
        return json({
          colegio: {
            id: esc.id, nombre: esc.nombre, estado: esc.estado,
            trial_inicio: esc.trial_inicio, trial_fin: esc.trial_fin,
          },
          limites: limitesEfectivos(esc.limites),
          limites_custom: esc.limites ?? null,
          uso,
          desde,
        });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
