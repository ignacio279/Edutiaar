// admin-auditoria (Dashboard admin v3, WP9): lectura del log de auditoría.
// La tabla `auditoria` es server-only (RLS sin policies): NADIE la lee por
// PostgREST; el único camino es esta función con guard verificarAdmin (nivel
// operativo alcanza — es solo lectura, acá no hay mutaciones ni auditoría
// propia). SIEMPRE paginado por cursor de created_at: nunca la tabla entera.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';

const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 100;

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    switch (accion) {
      case 'listar': {
        const { filtros, cursor, limite } = body as {
          filtros?: { actor_email?: unknown; entidad?: unknown; accion?: unknown; desde?: unknown; hasta?: unknown };
          cursor?: unknown;
          limite?: unknown;
        };
        const lim = Math.min(Math.max(Number(limite) || LIMITE_DEFAULT, 1), LIMITE_MAX);

        let q = sb
          .from('auditoria')
          .select('id, actor_id, actor_email, nivel, accion, entidad, entidad_id, detalle, created_at')
          .order('created_at', { ascending: false })
          .limit(lim);

        // Paginado por cursor: todo lo estrictamente anterior al último visto.
        if (noVacio(cursor)) q = q.lt('created_at', cursor);

        const f = filtros ?? {};
        if (noVacio(f.actor_email)) q = q.ilike('actor_email', `%${f.actor_email.trim()}%`);
        if (noVacio(f.entidad)) q = q.eq('entidad', f.entidad.trim());
        if (noVacio(f.accion)) q = q.ilike('accion', `%${f.accion.trim()}%`);
        if (noVacio(f.desde)) q = q.gte('created_at', f.desde.trim());
        if (noVacio(f.hasta)) q = q.lte('created_at', f.hasta.trim());

        const { data, error } = await q;
        if (error) throw error;
        const eventos = data ?? [];
        // Página llena → puede haber más: el cursor es el created_at del último.
        const siguiente_cursor = eventos.length === lim
          ? (eventos[eventos.length - 1] as { created_at: string }).created_at
          : null;
        return json({ eventos, siguiente_cursor });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
