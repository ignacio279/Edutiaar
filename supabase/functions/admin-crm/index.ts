// admin-crm (Dashboard admin v3 / WP7): CRM-lite del operador — notas por
// colegio, contacto de la escuela y alertas del operador. Guard compartido
// verificarAdmin (fila activa en plataforma_admin) + service_role; toda
// mutación audita (patrón D2: una fn por dominio, index fino + lógica pura en
// _shared/alertas-logica.ts testeable desde Node). Desde la fase Observatorio
// y avisos las alertas se PRECALCULAN en admin_alerta (job admin-jobs,
// migración 0021): alertas_listar solo lee el snapshot.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { validarContacto, validarNota, type AlertaAdmin } from '../_shared/alertas-logica.ts';

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

      // Lee el snapshot precalculado de admin_alerta (lo escribe admin-jobs
      // cada noche o "Recalcular ahora" — fase Observatorio y avisos): ya no
      // calcula nada on-demand. OJO: la home del admin (WP5) también llama
      // esta acción — el shape de cada alerta en {alertas} es contrato (solo
      // se AGREGÓ la clave generada_at al tope de la respuesta).
      case 'alertas_listar': {
        // 'alta' < 'media' alfabético → el orden alta→media sale del índice
        // admin_alerta_orden_idx (prioridad asc, generada_at desc).
        const { data, error } = await sb
          .from('admin_alerta')
          .select('clave, tipo, prioridad, escuela_id, escuela_nombre, titulo, detalle, generada_at')
          .order('prioridad', { ascending: true })
          .order('generada_at', { ascending: false });
        if (error) throw error;
        const filas = (data ?? []) as {
          clave: string; tipo: string; prioridad: string; escuela_id: string | null;
          escuela_nombre: string; titulo: string; detalle: string; generada_at: string;
        }[];

        // Filtro defensivo: una atendida entre corrida y corrida no debe
        // asomar aunque el job todavía no haya borrado la fila.
        const { data: at } = await sb.from('admin_alerta_atendida').select('clave');
        const atendidas = new Set(((at ?? []) as { clave: string }[]).map((a) => a.clave));

        const vigentes = filas.filter((f) => !atendidas.has(f.clave));
        const alertas: AlertaAdmin[] = vigentes.map((f) => ({
          clave: f.clave,
          tipo: f.tipo as AlertaAdmin['tipo'],
          prioridad: f.prioridad as AlertaAdmin['prioridad'],
          escuelaId: f.escuela_id ?? '',
          escuelaNombre: f.escuela_nombre,
          titulo: f.titulo,
          detalle: f.detalle,
        }));
        // Cuándo se recalculó por última vez: max(generada_at) del snapshot
        // completo (null = nunca corrió el job todavía).
        const generada_at = filas.length > 0
          ? filas.map((f) => f.generada_at).reduce((a, b) => (a > b ? a : b))
          : null;
        return json({ alertas, generada_at });
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
        // D-OA5: la fuente de verdad es admin_alerta_atendida (arriba); sacar
        // la fila del snapshot es best-effort — si falla, el filtro defensivo
        // de alertas_listar y la corrida nocturna la limpian igual.
        try {
          await sb.from('admin_alerta').delete().eq('clave', String(clave).trim());
        } catch (e) {
          console.error('alerta_atender: no se pudo borrar del snapshot', String((e as Error)?.message ?? e));
        }
        return json({ ok: true });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
