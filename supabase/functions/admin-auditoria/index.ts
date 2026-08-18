// admin-auditoria (Dashboard admin v3, WP9 · rediseño "Auditoría legible" 2026-08-18):
// lectura del log de auditoría. La tabla `auditoria` es server-only (RLS sin
// policies): NADIE la lee por PostgREST; el único camino es esta función con
// guard verificarAdmin (nivel operativo alcanza — es solo lectura, acá no hay
// mutaciones ni auditoría propia). SIEMPRE paginado por cursor de created_at:
// nunca la tabla entera.
//
// La función trae DATOS; el relato (titular, clasificación, agrupación de
// cadenas) lo arma web/lib/admin/auditoria-relato.ts al leer. Acá solo se suma
// lo que el front no puede resolver por RLS:
//   · `nombres`         — uuid → nombre de escuela / docente / institución
//   · `consentimientos` — quién autorizó cada pase (tabla `consentimiento`)
// Spec: docs/superpowers/specs/2026-08-18-auditoria-legible-design.md
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { ACCIONES_RUTINA } from '../_shared/auditoria-clasificacion.ts';

const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 100;

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && RE_UUID.test(v);

// Claves de `detalle` que pueden traer un uuid que vale la pena resolver.
// `alumno_id` NO está y no debe estar: un alumno se muestra SIEMPRE por su id
// (D2 del spec). El segundo candado es el filtro `rol = 'docente'` al resolver
// perfiles — aunque un id de chico se colara acá, no resolvería a un nombre.
const CLAVES_CON_UUID = [
  'escuela_id', 'escuela_destino', 'escuela_destino_id', 'escuela_origen',
  'institucion_id', 'de', 'a',
] as const;

type Fila = {
  actor_id: string;
  actor_email: string | null;
  entidad: string | null;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
};

// Junta todos los uuids candidatos de una página. Se consulta cada tabla con
// el set completo: los uuids son globalmente únicos, así que cada tabla
// devuelve solo los suyos y no hay forma de cruzarlos.
function uuidsDe(filas: Fila[]): string[] {
  const ids = new Set<string>();
  for (const f of filas) {
    if (esUuid(f.entidad_id)) ids.add(f.entidad_id);
    // Los eventos que escriben los triggers de la base traen `actor_id` real
    // pero sin email: resolverlo es lo que contesta "quién hizo el cambio".
    if (!f.actor_email && esUuid(f.actor_id)) ids.add(f.actor_id);
    const d = f.detalle;
    if (!d || typeof d !== 'object') continue;
    for (const k of CLAVES_CON_UUID) {
      const v = (d as Record<string, unknown>)[k];
      if (esUuid(v)) ids.add(v);
    }
  }
  return [...ids];
}

const porId = (filas: unknown[] | null): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of (filas ?? []) as { id?: string; nombre?: string }[]) {
    if (f?.id && f?.nombre) out[f.id] = f.nombre;
  }
  return out;
};

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
        const { filtros, cursor, limite, solo_clave } = body as {
          filtros?: { actor_email?: unknown; entidad?: unknown; accion?: unknown; desde?: unknown; hasta?: unknown };
          cursor?: unknown;
          limite?: unknown;
          solo_clave?: unknown;
        };
        const lim = Math.min(Math.max(Number(limite) || LIMITE_DEFAULT, 1), LIMITE_MAX);

        let q = sb
          .from('auditoria')
          .select('id, actor_id, actor_email, nivel, accion, entidad, entidad_id, detalle, created_at')
          .order('created_at', { ascending: false })
          .limit(lim);

        // Paginado por cursor: todo lo estrictamente anterior al último visto.
        if (noVacio(cursor)) q = q.lt('created_at', cursor);

        // Filtro clave/rutina EN LA QUERY, no en el cliente: si no, una página
        // entera de acciones rutinarias llegaría para mostrarse vacía.
        if (solo_clave === true) q = q.not('accion', 'in', `(${ACCIONES_RUTINA.join(',')})`);

        const f = filtros ?? {};
        if (noVacio(f.actor_email)) q = q.ilike('actor_email', `%${f.actor_email.trim()}%`);
        if (noVacio(f.entidad)) q = q.eq('entidad', f.entidad.trim());
        if (noVacio(f.accion)) q = q.ilike('accion', `%${f.accion.trim()}%`);
        if (noVacio(f.desde)) q = q.gte('created_at', f.desde.trim());
        if (noVacio(f.hasta)) q = q.lte('created_at', f.hasta.trim());

        const { data, error } = await q;
        if (error) throw error;
        const eventos = (data ?? []) as Fila[];
        // Página llena → puede haber más: el cursor es el created_at del último.
        const siguiente_cursor = eventos.length === lim
          ? (eventos[eventos.length - 1] as unknown as { created_at: string }).created_at
          : null;

        // ── Enriquecido: nombres y consentimientos de ESTA página ────────────
        const ids = uuidsDe(eventos);
        const nombres = { escuelas: {}, perfiles: {}, instituciones: {} } as {
          escuelas: Record<string, string>;
          perfiles: Record<string, string>;
          instituciones: Record<string, string>;
        };
        const consentimientos: Record<string, unknown> = {};

        if (ids.length > 0) {
          const [esc, per, ins] = await Promise.all([
            sb.from('escuela').select('id, nombre').in('id', ids),
            // rol = 'docente': segundo candado de D2. Un id de alumno que se
            // colara jamás resuelve a un nombre.
            sb.from('perfil').select('id, nombre').eq('rol', 'docente').in('id', ids),
            sb.from('institucion').select('id, nombre').in('id', ids),
          ]);
          nombres.escuelas = porId(esc.data);
          nombres.perfiles = porId(per.data);
          nombres.instituciones = porId(ins.data);
        }

        // Quién autorizó cada pase: la respuesta vive en `consentimiento`, que
        // la auditoría referencia pero nunca copió.
        const transferencias = eventos
          .filter((e) => e.entidad === 'transferencia' && esUuid(e.entidad_id))
          .map((e) => e.entidad_id as string);
        if (transferencias.length > 0) {
          const { data: trs } = await sb
            .from('transferencia')
            .select('id, consentimiento:consentimiento_id (adulto_nombre, adulto_vinculo, via, otorgado_at)')
            .in('id', [...new Set(transferencias)]);
          for (const t of (trs ?? []) as { id: string; consentimiento: unknown }[]) {
            if (t.consentimiento) consentimientos[t.id] = t.consentimiento;
          }
        }

        return json({ eventos, nombres, consentimientos, siguiente_cursor });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
