// admin-anuncios (Dashboard admin v3, WP8): el admin de plataforma crea y
// gestiona anuncios (banner in-app a maestras), globales o por colegio.
// Escritura SOLO acá (service_role): la tabla anuncio no tiene policies de
// INSERT/UPDATE/DELETE para authenticated; las docentes solo LEEN por RLS
// (alcance + vigencia resueltos en la policy anuncio_select_docente, 0020).
// Guard verificarAdmin (_shared/admin.ts); toda mutación audita (entidad 'anuncio').
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { validarAnuncio } from './validar.ts';

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
// '' / null / undefined → null (sin límite); el resto va tal cual a timestamptz.
const fechaONull = (v: unknown) => (noVacio(v) ? v : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    // Existencia (service_role → bypass RLS, así vemos también los inactivos).
    const traerAnuncio = async (id: unknown) => {
      if (!noVacio(id)) return null;
      const { data } = await sb.from('anuncio').select('*').eq('id', id).maybeSingle();
      return data as Record<string, unknown> | null;
    };

    // escuela_id: null/'' = todas; si vino, tiene que ser un colegio real.
    const escuelaValida = async (id: unknown): Promise<boolean> => {
      if (!noVacio(id)) return true;
      const { data } = await sb.from('escuela').select('id').eq('id', id).maybeSingle();
      return Boolean(data);
    };

    switch (accion) {
      case 'listar': {
        // Todos (activos e inactivos, vigentes o no): esta es la vista del admin.
        const { data, error } = await sb
          .from('anuncio')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const filas = (data ?? []) as Record<string, unknown>[];
        // Nombre del colegio para el chip de alcance (null = todas).
        const ids = [...new Set(filas.map((a) => a.escuela_id).filter(noVacio))];
        const nombres = new Map<string, string>();
        if (ids.length) {
          const { data: escs } = await sb.from('escuela').select('id, nombre').in('id', ids);
          for (const e of (escs ?? []) as { id: string; nombre: string }[]) nombres.set(e.id, e.nombre);
        }
        const anuncios = filas.map((a) => ({
          ...a,
          escuela_nombre: noVacio(a.escuela_id) ? (nombres.get(a.escuela_id) ?? null) : null,
        }));
        return json({ anuncios });
      }

      case 'crear': {
        const { titulo, cuerpo, escuela_id, desde, hasta } = body;
        const v = validarAnuncio({ titulo, cuerpo, desde, hasta });
        if (!v.ok) return json({ error: v.error }, 400);
        if (!(await escuelaValida(escuela_id))) return json({ error: 'escuela_invalida' }, 400);
        const { data: anuncio, error } = await sb
          .from('anuncio')
          .insert({
            titulo: String(titulo).trim(),
            cuerpo: String(cuerpo).trim(),
            escuela_id: noVacio(escuela_id) ? escuela_id : null,
            desde: fechaONull(desde),
            hasta: fechaONull(hasta),
            creado_por: ctx.user.id,
          })
          .select('*')
          .single();
        if (error) throw error;
        const id = (anuncio as { id: string }).id;
        registrarAuditoria(sb, ctx, {
          accion: 'crear_anuncio', entidad: 'anuncio', entidad_id: id,
          detalle: { titulo: String(titulo).trim(), escuela_id: noVacio(escuela_id) ? escuela_id : null },
        });
        return json({ anuncio });
      }

      case 'editar': {
        const { anuncio_id, titulo, cuerpo, escuela_id, desde, hasta } = body;
        const actual = await traerAnuncio(anuncio_id);
        if (!actual) return json({ error: 'no_encontrado' }, 404);
        // Patch parcial: valida el resultado FINAL (lo que vino pisa lo que había)
        // así una edición no puede dejar fechas invertidas ni textos vacíos.
        const final = {
          titulo: 'titulo' in body ? titulo : actual.titulo,
          cuerpo: 'cuerpo' in body ? cuerpo : actual.cuerpo,
          desde: 'desde' in body ? fechaONull(desde) : actual.desde,
          hasta: 'hasta' in body ? fechaONull(hasta) : actual.hasta,
        };
        const v = validarAnuncio(final);
        if (!v.ok) return json({ error: v.error }, 400);
        const patch: Record<string, unknown> = {
          titulo: String(final.titulo).trim(),
          cuerpo: String(final.cuerpo).trim(),
          desde: final.desde,
          hasta: final.hasta,
        };
        if ('escuela_id' in body) {
          if (!(await escuelaValida(escuela_id))) return json({ error: 'escuela_invalida' }, 400);
          patch.escuela_id = noVacio(escuela_id) ? escuela_id : null;
        }
        const { data: anuncio, error } = await sb
          .from('anuncio').update(patch).eq('id', anuncio_id).select('*').single();
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'editar_anuncio', entidad: 'anuncio', entidad_id: String(anuncio_id),
          detalle: { campos: Object.keys(patch) },
        });
        return json({ anuncio });
      }

      case 'activar':
      case 'desactivar': {
        const { anuncio_id } = body;
        const actual = await traerAnuncio(anuncio_id);
        if (!actual) return json({ error: 'no_encontrado' }, 404);
        const activo = accion === 'activar';
        const { error } = await sb.from('anuncio').update({ activo }).eq('id', anuncio_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: `${accion}_anuncio`, entidad: 'anuncio', entidad_id: String(anuncio_id),
          detalle: { titulo: actual.titulo },
        });
        return json({ ok: true, activo });
      }

      case 'borrar': {
        const { anuncio_id } = body;
        const actual = await traerAnuncio(anuncio_id);
        if (!actual) return json({ error: 'no_encontrado' }, 404);
        const { error } = await sb.from('anuncio').delete().eq('id', anuncio_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'borrar_anuncio', entidad: 'anuncio', entidad_id: String(anuncio_id),
          detalle: { titulo: actual.titulo },
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
