// admin-crm (Dashboard admin v3 / WP7): CRM-lite del operador — notas por
// colegio, contacto de la escuela y alertas del operador. Guard compartido
// verificarAdmin (fila activa en plataforma_admin) + service_role; toda
// mutación audita (patrón D2: una fn por dominio, index fino + módulo puro
// hermano alertas-logica.ts testeable desde Node).
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { costosPorMes, evaluarAlertas, validarContacto, validarNota, type EscuelaAlerta } from '../_shared/alertas-logica.ts';

const noVacio = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    // El service_role saltea la RLS: verificamos a mano que la escuela exista.
    const escuelaDe = async (escuelaId: string) => {
      if (!noVacio(escuelaId)) return null;
      const { data } = await sb.from('escuela').select('id, nombre, contacto').eq('id', escuelaId).maybeSingle();
      return data as { id: string; nombre: string; contacto: Record<string, string> | null } | null;
    };

    switch (accion) {
      case 'notas_listar': {
        const escuela = await escuelaDe(body.escuela_id);
        if (!escuela) return json({ error: 'escuela_inexistente' }, 404);
        const { data, error } = await sb
          .from('escuela_nota')
          .select('id, tipo, cuerpo, autor_id, autor_email, created_at')
          .eq('escuela_id', escuela.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json({ escuela, notas: data ?? [] });
      }

      case 'nota_crear': {
        const v = validarNota({ tipo: body.tipo, cuerpo: body.cuerpo });
        if (!v.ok) return json({ error: v.error }, 400);
        const escuela = await escuelaDe(body.escuela_id);
        if (!escuela) return json({ error: 'escuela_inexistente' }, 404);
        const { data: nota, error } = await sb
          .from('escuela_nota')
          .insert({
            escuela_id: escuela.id,
            autor_id: ctx.user.id,
            autor_email: ctx.user.email ?? null,
            tipo: v.tipo,
            cuerpo: v.cuerpo,
          })
          .select('id, tipo, cuerpo, autor_id, autor_email, created_at')
          .single();
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'crear_nota',
          entidad: 'escuela_nota',
          entidad_id: (nota as { id: string }).id,
          detalle: { escuela_id: escuela.id, tipo: v.tipo },
        });
        return json({ nota });
      }

      case 'nota_borrar': {
        const { nota_id } = body;
        if (!noVacio(nota_id)) return json({ error: 'falta_nota' }, 400);
        const { data } = await sb.from('escuela_nota').select('id, escuela_id, tipo').eq('id', nota_id).maybeSingle();
        const nota = data as { id: string; escuela_id: string; tipo: string } | null;
        if (!nota) return json({ error: 'nota_inexistente' }, 404);
        const { error } = await sb.from('escuela_nota').delete().eq('id', nota.id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'borrar_nota',
          entidad: 'escuela_nota',
          entidad_id: nota.id,
          detalle: { escuela_id: nota.escuela_id, tipo: nota.tipo },
        });
        return json({ ok: true });
      }

      case 'editar_contacto': {
        const v = validarContacto(body.contacto);
        if (!v.ok) return json({ error: v.error }, 400);
        const escuela = await escuelaDe(body.escuela_id);
        if (!escuela) return json({ error: 'escuela_inexistente' }, 404);
        const { error } = await sb.from('escuela').update({ contacto: v.contacto }).eq('id', escuela.id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'editar_contacto',
          entidad: 'escuela',
          entidad_id: escuela.id,
          detalle: { contacto: v.contacto },
        });
        return json({ ok: true, contacto: v.contacto });
      }

      // Junta los insumos, corre la lógica pura y devuelve {alertas}. OJO: la
      // home del admin (WP5) también llama esta acción — el shape {alertas} es
      // contrato.
      case 'alertas_listar': {
        const now = new Date();
        const { data: escData, error: escErr } = await sb
          .from('escuela')
          .select('id, nombre, estado, trial_fin, limites');
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

        const alertas = evaluarAlertas({
          escuelas,
          ultimaSesionPorEscuela,
          costoMesPorEscuela: mesActual,
          costoMesAnteriorPorEscuela: mesAnterior,
          atendidas,
        }, now);
        return json({ alertas });
      }

      case 'alerta_atender': {
        const { clave } = body;
        if (!noVacio(clave)) return json({ error: 'falta_clave' }, 400);
        const { error } = await sb
          .from('admin_alerta_atendida')
          .upsert({ clave: String(clave).trim(), atendida_por: ctx.user.id }, { onConflict: 'clave', ignoreDuplicates: true });
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'atender_alerta',
          entidad: 'admin_alerta_atendida',
          detalle: { clave: String(clave).trim() },
        });
        return json({ ok: true });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
