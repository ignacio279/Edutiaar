// admin-plataforma (Dashboard admin v3, WP9): gestión de los administradores
// de la plataforma. TODAS las acciones exigen nivel SUPER (guard
// verificarAdmin(req, {nivel:'super'}) → 403 requiere_super para operativos).
// El admin NO tiene fila en `perfil` (ADR-009): su identidad es auth.users +
// plataforma_admin. Alta con ROLLBACK del auth user (patrón gestion-alumnos),
// invitación = link de recovery que se copia + password temporal una-sola-vez.
// Nadie puede cambiarse el nivel ni desactivarse a sí mismo (no_a_vos_mismo).
// Toda mutación audita (entidad 'plataforma_admin').
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { emailNormalizado, generarPasswordTemporal, nivelValido, validarCrearAdmin } from './validar.ts';

type FilaAdmin = {
  perfil_id: string;
  nivel: string;
  nombre: string;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
};

const COLS = 'perfil_id, nivel, nombre, activo, creado_por, created_at';
const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Gestión de admins = SOLO super, incluso para listar.
    const ctx = await verificarAdmin(req, { nivel: 'super' });
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    // Fila de plataforma_admin por perfil_id, o null.
    const adminDe = async (perfilId: unknown): Promise<FilaAdmin | null> => {
      if (!noVacio(perfilId)) return null;
      const { data } = await sb.from('plataforma_admin').select(COLS).eq('perfil_id', perfilId).maybeSingle();
      return data as FilaAdmin | null;
    };

    switch (accion) {
      case 'listar_admins': {
        const { data, error } = await sb.from('plataforma_admin').select(COLS).order('created_at');
        if (error) throw error;
        const filas = (data ?? []) as FilaAdmin[];
        // Email por fila vía Auth (getUserById): son pocos admins, N+1 ok.
        const admins = await Promise.all(filas.map(async (f) => {
          const { data: u } = await sb.auth.admin.getUserById(f.perfil_id);
          return { ...f, email: u?.user?.email ?? null };
        }));
        return json({ admins });
      }

      case 'crear_admin': {
        const v = validarCrearAdmin(body as Record<string, unknown>);
        if (!v.ok) return json({ error: v.error }, 400);
        const email = emailNormalizado((body as { email?: unknown }).email);
        const nombre = String((body as { nombre?: unknown }).nombre).trim();
        const nivel = (body as { nivel: string }).nivel;

        // (1) password temporal — se devuelve una vez, no se persiste.
        const password = generarPasswordTemporal();

        // (2) auth user. Email duplicado → 409 email_en_uso.
        const { data: created, error: cErr } = await sb.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { nombre },
        });
        if (cErr || !created?.user) {
          const code = (cErr as { code?: string } | null)?.code ?? '';
          const msg = String(cErr?.message ?? '');
          if (code === 'email_exists' || msg.includes('already been registered')) {
            return json({ error: 'email_en_uso' }, 409);
          }
          throw cErr ?? new Error('no_se_creo_user');
        }
        const id = created.user.id;

        // (3) fila en plataforma_admin — NO en perfil (ADR-009) — con rollback
        // del auth user si falla.
        const { error: iErr } = await sb.from('plataforma_admin').insert({
          perfil_id: id, nivel, nombre, creado_por: ctx.user.id,
        });
        if (iErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw iErr; }

        // (4) link de invitación (recovery). Si falla, la password temporal
        // igual sirve: se devuelve con warning en vez de romper el alta.
        let link: string | null = null;
        let warning: string | undefined;
        const { data: linkData, error: lErr } = await sb.auth.admin.generateLink({ type: 'recovery', email });
        const action = linkData?.properties?.action_link;
        if (lErr || !action) warning = 'link_no_generado';
        else link = action;

        registrarAuditoria(sb, ctx, {
          accion: 'crear_admin', entidad: 'plataforma_admin', entidad_id: id,
          detalle: { email, nivel },
        });
        return json({
          admin: { perfil_id: id, nombre, email, nivel, activo: true },
          invitacion: { link, password_temporal: password, ...(warning ? { warning } : {}) },
        });
      }

      case 'cambiar_nivel': {
        const { perfil_id, nivel } = body as { perfil_id?: unknown; nivel?: unknown };
        if (!nivelValido(nivel)) return json({ error: 'nivel_invalido' }, 400);
        if (perfil_id === ctx.user.id) return json({ error: 'no_a_vos_mismo' }, 400);
        const fila = await adminDe(perfil_id);
        if (!fila) return json({ error: 'no_existe' }, 404);
        const { error } = await sb.from('plataforma_admin').update({ nivel }).eq('perfil_id', fila.perfil_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'cambiar_nivel_admin', entidad: 'plataforma_admin', entidad_id: fila.perfil_id,
          detalle: { de: fila.nivel, a: nivel },
        });
        return json({ ok: true, nivel });
      }

      case 'desactivar_admin':
      case 'reactivar_admin': {
        const { perfil_id } = body as { perfil_id?: unknown };
        const activo = accion === 'reactivar_admin';
        // Desactivarse a uno mismo dejaría la plataforma sin ese super a mitad
        // de sesión (y podría dejarla sin ningún super).
        if (!activo && perfil_id === ctx.user.id) return json({ error: 'no_a_vos_mismo' }, 400);
        const fila = await adminDe(perfil_id);
        if (!fila) return json({ error: 'no_existe' }, 404);
        const { error } = await sb.from('plataforma_admin').update({ activo }).eq('perfil_id', fila.perfil_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: accion === 'desactivar_admin' ? 'desactivar_admin' : 'reactivar_admin',
          entidad: 'plataforma_admin', entidad_id: fila.perfil_id,
          detalle: { nombre: fila.nombre },
        });
        return json({ ok: true, activo });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
