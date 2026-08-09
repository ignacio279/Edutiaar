// admin-maestras (Dashboard admin v3, WP2): las cuentas de maestras se crean y
// gestionan SOLO desde el panel admin (D7). Alta = auth user + perfil (con
// ROLLBACK estilo gestion-alumnos) + docente_acceso, y la invitación es un
// link de recovery que el admin copia (no hay SMTP) + password temporal que se
// muestra UNA sola vez y no se persiste. Guard verificarAdmin en todo; borrar
// exige nivel super. Toda mutación audita (entidad 'perfil').
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { listarUsuariosAuth } from '../_shared/auth-users.ts';
import { validarCrearMaestra, generarPasswordTemporal, emailNormalizado } from './validar.ts';

type Acceso = { perfil_id: string; estado: string; trial_inicio: string | null; trial_fin: string | null };
type AulaRow = { id: string; nombre: string; docente_id: string };
type Docente = { id: string; nombre: string; escuela_id: string | null; rol: string };

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const accion = (body as { accion?: string }).accion;

    // 'borrar' es destructivo: el guard mismo exige nivel super (requiere_super).
    const ctx = await verificarAdmin(req, accion === 'borrar' ? { nivel: 'super' } : {});
    if (ctx instanceof Response) return ctx;
    const sb = ctx.sb;

    // Trae el perfil SOLO si es rol docente (las acciones por perfil_id jamás
    // deben operar sobre un alumno u otro perfil).
    const docenteDe = async (perfilId: unknown): Promise<Docente | null> => {
      if (!noVacio(perfilId)) return null;
      const { data } = await sb.from('perfil').select('id, nombre, escuela_id, rol').eq('id', perfilId).maybeSingle();
      const p = data as Docente | null;
      return p && p.rol === 'docente' ? p : null;
    };

    // ¿Tiene alumnos a cargo? Por docente_id directo o por estar en sus aulas.
    // Mover chicos entre colegios / borrar con chicos excede el MVP → 409.
    const tieneAlumnos = async (perfilId: string): Promise<boolean> => {
      const { count } = await sb.from('perfil').select('id', { count: 'exact', head: true })
        .eq('rol', 'alumno').eq('docente_id', perfilId);
      if ((count ?? 0) > 0) return true;
      const { data: aulas } = await sb.from('aula').select('id').eq('docente_id', perfilId);
      const ids = ((aulas ?? []) as { id: string }[]).map((a) => a.id);
      if (!ids.length) return false;
      const { count: c2 } = await sb.from('perfil').select('id', { count: 'exact', head: true })
        .eq('rol', 'alumno').in('aula_id', ids);
      return (c2 ?? 0) > 0;
    };

    switch (accion) {
      case 'listar': {
        const { escuela_id } = body as { escuela_id?: string };
        let q = sb.from('perfil')
          .select('id, nombre, escuela_id, escuela:escuela_id (nombre)')
          .eq('rol', 'docente')
          .order('nombre');
        if (noVacio(escuela_id)) q = q.eq('escuela_id', escuela_id);
        const { data: docs, error } = await q;
        if (error) throw error;
        const filas = (docs ?? []) as unknown as (Docente & { escuela: { nombre: string } | null })[];
        const ids = filas.map((d) => d.id);

        let accesos: Acceso[] = [];
        let aulas: AulaRow[] = [];
        let alumnos: { docente_id: string }[] = [];
        if (ids.length) {
          const [rAcc, rAul, rAlu] = await Promise.all([
            sb.from('docente_acceso').select('perfil_id, estado, trial_inicio, trial_fin').in('perfil_id', ids),
            sb.from('aula').select('id, nombre, docente_id').in('docente_id', ids),
            sb.from('perfil').select('docente_id').eq('rol', 'alumno').in('docente_id', ids),
          ]);
          accesos = (rAcc.data ?? []) as Acceso[];
          aulas = (rAul.data ?? []) as AulaRow[];
          alumnos = (rAlu.data ?? []) as { docente_id: string }[];
        }

        // Emails y último login: perfil no los guarda, salen de Auth PAGINADO
        // (los alumnos también son auth users: con >1000 las maestras se caían
        // de la página 1 del listUsers inline que había acá).
        const usuariosAuth = await listarUsuariosAuth(sb);

        const maestras = filas.map((d) => {
          const acc = accesos.find((a) => a.perfil_id === d.id);
          const mias = aulas.filter((a) => a.docente_id === d.id);
          const u = usuariosAuth.get(d.id);
          return {
            id: d.id,
            nombre: d.nombre,
            email: u?.email ?? null,
            ultimo_acceso: u?.last_sign_in_at ?? null,
            escuela_id: d.escuela_id,
            escuela_nombre: d.escuela?.nombre ?? null,
            estado: acc?.estado ?? 'activo', // sin fila = activa (0018)
            trial_inicio: acc?.trial_inicio ?? null,
            trial_fin: acc?.trial_fin ?? null,
            aulas: mias.map((a) => ({ id: a.id, nombre: a.nombre })),
            alumnos: alumnos.filter((al) => al.docente_id === d.id).length,
          };
        });
        return json({ maestras });
      }

      case 'crear_maestra': {
        const v = validarCrearMaestra(body as Record<string, unknown>);
        if (!v.ok) return json({ error: v.error }, 400);
        const email = emailNormalizado((body as { email?: unknown }).email);
        const nombre = String((body as { nombre?: unknown }).nombre).trim();
        const escuelaId = String((body as { escuela_id?: unknown }).escuela_id).trim();

        const { data: esc } = await sb.from('escuela').select('id').eq('id', escuelaId).maybeSingle();
        if (!esc) return json({ error: 'escuela_inexistente' }, 404);

        // (1) password temporal legible — se devuelve una vez, no se persiste.
        const password = generarPasswordTemporal();

        // (2) auth user.
        const { data: created, error: cErr } = await sb.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { nombre, rol: 'docente' },
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

        // (3) perfil, con rollback del auth user si falla (patrón gestion-alumnos).
        const { error: pErr } = await sb.from('perfil').insert({
          id, rol: 'docente', nombre, escuela_id: escuelaId,
        });
        if (pErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw pErr; }

        // (4) acceso explícito activo (sin fila también es activo, pero la fila
        // deja el trial propio listo para WP3). Mismo rollback si falla.
        const { error: aErr } = await sb.from('docente_acceso').insert({ perfil_id: id, estado: 'activo' });
        if (aErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw aErr; }

        // (5) link de invitación (recovery). Si falla, la password temporal
        // igual sirve: se devuelve con warning en vez de romper el alta.
        let link: string | null = null;
        let warning: string | undefined;
        const { data: linkData, error: lErr } = await sb.auth.admin.generateLink({ type: 'recovery', email });
        const action = linkData?.properties?.action_link;
        if (lErr || !action) warning = 'link_no_generado';
        else link = action;

        registrarAuditoria(sb, ctx, {
          accion: 'crear_maestra', entidad: 'perfil', entidad_id: id,
          detalle: { email, escuela_id: escuelaId },
        });
        return json({
          maestra: { id, nombre, email },
          invitacion: { link, password_temporal: password, ...(warning ? { warning } : {}) },
        });
      }

      case 'reset_password': {
        const doc = await docenteDe((body as { perfil_id?: unknown }).perfil_id);
        if (!doc) return json({ error: 'no_existe' }, 404);
        const { data: u } = await sb.auth.admin.getUserById(doc.id);
        const email = u?.user?.email;
        if (!email) return json({ error: 'sin_email' }, 404);
        const { data: linkData, error: lErr } = await sb.auth.admin.generateLink({ type: 'recovery', email });
        const link = linkData?.properties?.action_link;
        if (lErr || !link) return json({ error: 'link_no_generado' }, 500);
        registrarAuditoria(sb, ctx, { accion: 'reset_password_maestra', entidad: 'perfil', entidad_id: doc.id });
        return json({ link });
      }

      case 'suspender':
      case 'reactivar': {
        const doc = await docenteDe((body as { perfil_id?: unknown }).perfil_id);
        if (!doc) return json({ error: 'no_existe' }, 404);
        const estado = accion === 'suspender' ? 'suspendido' : 'activo';
        // Upsert solo del estado: los campos de trial de la fila (si hay) quedan.
        const { error } = await sb.from('docente_acceso')
          .upsert({ perfil_id: doc.id, estado }, { onConflict: 'perfil_id' });
        if (error) throw error;
        registrarAuditoria(sb, ctx, { accion: `${accion}_maestra`, entidad: 'perfil', entidad_id: doc.id });
        return json({ ok: true, estado });
      }

      case 'reasignar': {
        const doc = await docenteDe((body as { perfil_id?: unknown }).perfil_id);
        if (!doc) return json({ error: 'no_existe' }, 404);
        const escuelaId = (body as { escuela_id?: unknown }).escuela_id;
        if (!noVacio(escuelaId)) return json({ error: 'escuela_requerida' }, 400);
        const { data: esc } = await sb.from('escuela').select('id').eq('id', escuelaId).maybeSingle();
        if (!esc) return json({ error: 'escuela_inexistente' }, 404);
        if (await tieneAlumnos(doc.id)) return json({ error: 'tiene_alumnos' }, 409);

        const { error: e1 } = await sb.from('perfil').update({ escuela_id: escuelaId }).eq('id', doc.id);
        if (e1) throw e1;
        const { error: e2 } = await sb.from('aula').update({ escuela_id: escuelaId }).eq('docente_id', doc.id);
        if (e2) throw e2;
        registrarAuditoria(sb, ctx, {
          accion: 'reasignar_maestra', entidad: 'perfil', entidad_id: doc.id,
          detalle: { de: doc.escuela_id, a: escuelaId },
        });
        return json({ ok: true });
      }

      case 'borrar': {
        // El guard ya exigió nivel super arriba.
        const doc = await docenteDe((body as { perfil_id?: unknown }).perfil_id);
        if (!doc) return json({ error: 'no_existe' }, 404);
        if (await tieneAlumnos(doc.id)) return json({ error: 'tiene_alumnos' }, 409);
        // Sus aulas (vacías, recién verificado) se borran a mano: aula.docente_id
        // es ON DELETE SET NULL y quedarían huérfanas reteniendo el código único.
        const { error: eAulas } = await sb.from('aula').delete().eq('docente_id', doc.id);
        if (eAulas) throw eAulas;
        const { error } = await sb.auth.admin.deleteUser(doc.id); // cascade FK: perfil + docente_acceso
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'borrar_maestra', entidad: 'perfil', entidad_id: doc.id,
          detalle: { nombre: doc.nombre, escuela_id: doc.escuela_id },
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
