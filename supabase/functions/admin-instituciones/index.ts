// admin-instituciones (Alumno golondrina, WP-C): el admin de PLATAFORMA
// administra instituciones (provincia/fundación/red/municipio), sus admins y
// el ciclo de licencias (directas y pools con cupos). Guard verificarAdmin
// (plataforma_admin) → service_role; el admin de INSTITUCIÓN opera por
// institucion-panel, nunca por acá (fail-closed de 0025). Patrón de
// gestion-alumnos: index.ts = I/O, validar.ts = lógica pura. Toda mutación
// audita (registrarAuditoria). Errores {error:'codigo_snake'}.
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { cors, json } from '../_shared/cors.ts';
import {
  armarPatchLicencia,
  codigoErrorAsignacion,
  emailNormalizado,
  estadoInstitucionValido,
  generarPasswordTemporal,
  validarCrearAdminInstitucion,
  validarCrearInstitucion,
  validarEditarInstitucion,
  validarLicenciaCrear,
  validarLicenciaEditar,
} from './validar.ts';

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

const COLS_INST = 'id, nombre, tipo, contacto, estado, created_at';
const COLS_LIC = 'id, escuela_id, institucion_id, plan, cupos, fecha_inicio, fecha_fin, estado, condiciones, created_at';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { accion } = body as { accion?: string };

    const contar = async (tabla: string, filtros: Record<string, string>) => {
      let q = sb.from(tabla).select('*', { count: 'exact', head: true });
      for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };

    const institucionDe = async (id: unknown) => {
      if (!noVacio(id)) return null;
      const { data } = await sb.from('institucion').select(COLS_INST).eq('id', id).maybeSingle();
      return data as { id: string; nombre: string; estado: string } | null;
    };

    // Cupos usados por licencia en UNA query (evita N+1 sobre el pool).
    const usadosPorLicencia = async (licenciaIds: string[]) => {
      const usados = new Map<string, number>();
      if (!licenciaIds.length) return usados;
      const { data } = await sb
        .from('licencia_asignacion')
        .select('licencia_id')
        .in('licencia_id', licenciaIds);
      for (const a of (data ?? []) as { licencia_id: string }[]) {
        usados.set(a.licencia_id, (usados.get(a.licencia_id) ?? 0) + 1);
      }
      return usados;
    };

    switch (accion) {
      // ── Instituciones ─────────────────────────────────────────────────────
      case 'crear': {
        const { nombre, tipo, contacto } = body as Record<string, unknown>;
        const v = validarCrearInstitucion({ nombre, tipo, contacto });
        if (!v.ok) return json({ error: v.error }, 400);
        const { data, error } = await sb
          .from('institucion')
          .insert({ nombre: String(nombre).trim(), tipo, contacto: contacto ?? null })
          .select(COLS_INST)
          .single();
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'crear_institucion', entidad: 'institucion',
          entidad_id: (data as { id: string }).id,
          detalle: { nombre: String(nombre).trim(), tipo },
        });
        return json({ institucion: data });
      }

      case 'editar': {
        const { institucion_id, nombre, tipo, contacto } = body as Record<string, unknown>;
        if (!noVacio(institucion_id)) return json({ error: 'falta_institucion_id' }, 400);
        const v = validarEditarInstitucion({ nombre, tipo, contacto });
        if (!v.ok) return json({ error: v.error }, 400);
        const patch: Record<string, unknown> = {};
        if (nombre !== undefined) patch.nombre = String(nombre).trim();
        if (tipo !== undefined) patch.tipo = tipo;
        if (contacto !== undefined) patch.contacto = contacto ?? null;
        if (!Object.keys(patch).length) return json({ ok: true });
        const { data, error } = await sb
          .from('institucion').update(patch).eq('id', institucion_id)
          .select(COLS_INST).maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: 'no_existe' }, 404);
        registrarAuditoria(sb, ctx, {
          accion: 'editar_institucion', entidad: 'institucion',
          entidad_id: String(institucion_id), detalle: patch,
        });
        return json({ institucion: data });
      }

      case 'estado': {
        const { institucion_id, estado } = body as Record<string, unknown>;
        if (!noVacio(institucion_id)) return json({ error: 'falta_institucion_id' }, 400);
        if (!estadoInstitucionValido(estado)) return json({ error: 'estado_invalido' }, 400);
        const actual = await institucionDe(institucion_id);
        if (!actual) return json({ error: 'no_existe' }, 404);
        if (actual.estado === estado) return json({ ok: true, estado });
        const { error } = await sb.from('institucion').update({ estado }).eq('id', institucion_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'estado_institucion', entidad: 'institucion',
          entidad_id: String(institucion_id), detalle: { de: actual.estado, a: estado },
        });
        return json({ ok: true, estado });
      }

      case 'listar': {
        const { data, error } = await sb
          .from('institucion').select(COLS_INST).order('created_at', { ascending: false });
        if (error) throw error;
        const filas = (data ?? []) as { id: string }[];
        // 3 counts por institución: aceptable para el MVP (pocas instituciones),
        // mismo trade-off documentado en admin-colegios.
        const instituciones = [];
        for (const i of filas) {
          const [colegios, admins, licencias] = await Promise.all([
            contar('escuela', { institucion_id: i.id }),
            contar('institucion_admin', { institucion_id: i.id }),
            contar('licencia', { institucion_id: i.id }),
          ]);
          instituciones.push({ ...i, colegios, admins, licencias });
        }
        return json({ instituciones });
      }

      case 'ficha': {
        const { institucion_id } = body as Record<string, unknown>;
        const inst = await institucionDe(institucion_id);
        if (!inst) return json({ error: 'no_existe' }, 404);

        const [{ data: colegios }, { data: admins }, { data: pools }] = await Promise.all([
          sb.from('escuela')
            .select('id, nombre, provincia, tipo, estado, trial_fin')
            .eq('institucion_id', inst.id).order('nombre'),
          sb.from('institucion_admin')
            .select('perfil_id, nombre, activo, created_at')
            .eq('institucion_id', inst.id).order('created_at'),
          sb.from('licencia').select(COLS_LIC)
            .eq('institucion_id', inst.id).order('created_at', { ascending: false }),
        ]);

        // Email de cada admin desde Auth (son pocos por institución; getUserById
        // puntual, no hace falta paginar listUsers como en admin-maestras).
        const adminsConEmail = [];
        for (const a of (admins ?? []) as { perfil_id: string; nombre: string; activo: boolean; created_at: string }[]) {
          const { data: u } = await sb.auth.admin.getUserById(a.perfil_id);
          adminsConEmail.push({ ...a, email: u?.user?.email ?? null });
        }

        const poolRows = (pools ?? []) as { id: string; cupos: number | null }[];
        const usados = await usadosPorLicencia(poolRows.map((l) => l.id));
        // Escuelas asignadas a cada pool (para mostrar quién consume cada cupo).
        let asignaciones: { escuela_id: string; licencia_id: string }[] = [];
        if (poolRows.length) {
          const { data: asg } = await sb.from('licencia_asignacion')
            .select('escuela_id, licencia_id').in('licencia_id', poolRows.map((l) => l.id));
          asignaciones = (asg ?? []) as { escuela_id: string; licencia_id: string }[];
        }

        return json({
          institucion: inst,
          colegios: colegios ?? [],
          admins: adminsConEmail,
          pools: poolRows.map((l) => ({
            ...l,
            usados: usados.get(l.id) ?? 0,
            asignadas: asignaciones.filter((a) => a.licencia_id === l.id).map((a) => a.escuela_id),
          })),
        });
      }

      // ── Colegios de una institución ───────────────────────────────────────
      case 'colegio_asignar': {
        const { institucion_id, escuela_id } = body as Record<string, unknown>;
        const inst = await institucionDe(institucion_id);
        if (!inst) return json({ error: 'no_existe' }, 404);
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        const { data: esc } = await sb.from('escuela')
          .select('id, institucion_id').eq('id', escuela_id).maybeSingle();
        if (!esc) return json({ error: 'escuela_inexistente' }, 404);
        const { error } = await sb.from('escuela')
          .update({ institucion_id: inst.id }).eq('id', escuela_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'asignar_colegio_institucion', entidad: 'escuela',
          entidad_id: String(escuela_id),
          detalle: { de: (esc as { institucion_id: string | null }).institucion_id, a: inst.id },
        });
        return json({ ok: true });
      }

      case 'colegio_quitar': {
        const { escuela_id } = body as Record<string, unknown>;
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        const { data: esc } = await sb.from('escuela')
          .select('id, institucion_id').eq('id', escuela_id).maybeSingle();
        if (!esc) return json({ error: 'escuela_inexistente' }, 404);
        const instAnterior = (esc as { institucion_id: string | null }).institucion_id;
        // Si el colegio consumía un cupo de un pool de ESA institución, el cupo
        // se libera: quedarse colgado de un pool ajeno regalaría acceso.
        if (instAnterior) {
          const { data: asg } = await sb.from('licencia_asignacion')
            .select('licencia_id, licencia:licencia_id (institucion_id)')
            .eq('escuela_id', escuela_id).maybeSingle();
          const lic = (asg as { licencia?: { institucion_id: string | null } | null } | null)?.licencia;
          if (lic && lic.institucion_id === instAnterior) {
            await sb.from('licencia_asignacion').delete().eq('escuela_id', escuela_id);
          }
        }
        const { error } = await sb.from('escuela')
          .update({ institucion_id: null }).eq('id', escuela_id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'quitar_colegio_institucion', entidad: 'escuela',
          entidad_id: String(escuela_id), detalle: { de: instAnterior },
        });
        return json({ ok: true });
      }

      // ── Admins de institución ─────────────────────────────────────────────
      case 'admin_crear': {
        const v = validarCrearAdminInstitucion(body as Record<string, unknown>);
        if (!v.ok) return json({ error: v.error }, 400);
        const email = emailNormalizado((body as { email?: unknown }).email);
        const nombre = String((body as { nombre?: unknown }).nombre).trim();
        const inst = await institucionDe((body as { institucion_id?: unknown }).institucion_id);
        if (!inst) return json({ error: 'no_existe' }, 404);

        // Patrón EXACTO de admin-maestras: (1) password temporal legible que se
        // devuelve UNA vez y no se persiste; (2) auth user; (3) fila de
        // identidad con rollback; (4) link de recovery best-effort. OJO: SIN
        // fila en perfil — la identidad del admin de institución es SOLO
        // institucion_admin (como plataforma_admin, ADR-009 / 0025).
        const password = generarPasswordTemporal();
        const { data: created, error: cErr } = await sb.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { nombre, rol: 'institucion_admin' },
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

        const { error: iErr } = await sb.from('institucion_admin').insert({
          perfil_id: id, institucion_id: inst.id, nombre, creado_por: ctx.user.id,
        });
        if (iErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw iErr; }

        let link: string | null = null;
        let warning: string | undefined;
        const { data: linkData, error: lErr } = await sb.auth.admin.generateLink({ type: 'recovery', email });
        const action = linkData?.properties?.action_link;
        if (lErr || !action) warning = 'link_no_generado';
        else link = action;

        registrarAuditoria(sb, ctx, {
          accion: 'crear_admin_institucion', entidad: 'institucion_admin',
          entidad_id: id, detalle: { email, institucion_id: inst.id },
        });
        return json({
          admin: { id, nombre, email },
          invitacion: { link, password_temporal: password, ...(warning ? { warning } : {}) },
        });
      }

      case 'admin_estado': {
        const { perfil_id, activo } = body as Record<string, unknown>;
        if (!noVacio(perfil_id)) return json({ error: 'falta_perfil_id' }, 400);
        if (typeof activo !== 'boolean') return json({ error: 'activo_invalido' }, 400);
        const { data, error } = await sb.from('institucion_admin')
          .update({ activo }).eq('perfil_id', perfil_id)
          .select('perfil_id').maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: 'no_existe' }, 404);
        registrarAuditoria(sb, ctx, {
          accion: activo ? 'reactivar_admin_institucion' : 'suspender_admin_institucion',
          entidad: 'institucion_admin', entidad_id: String(perfil_id),
        });
        return json({ ok: true, activo });
      }

      // ── Licencias ─────────────────────────────────────────────────────────
      case 'licencia_crear': {
        const { escuela_id, institucion_id, plan, cupos, fecha_inicio, fecha_fin, estado, condiciones } =
          body as Record<string, unknown>;
        const v = validarLicenciaCrear({ escuela_id, institucion_id, plan, cupos, fecha_inicio, fecha_fin, estado });
        if (!v.ok) return json({ error: v.error }, 400);
        // El dueño tiene que existir (la FK lo garantiza, pero el 404 legible
        // sale de acá).
        if (noVacio(escuela_id)) {
          const { data: esc } = await sb.from('escuela').select('id').eq('id', escuela_id).maybeSingle();
          if (!esc) return json({ error: 'escuela_inexistente' }, 404);
        } else {
          const inst = await institucionDe(institucion_id);
          if (!inst) return json({ error: 'no_existe' }, 404);
        }
        const fila: Record<string, unknown> = {
          escuela_id: noVacio(escuela_id) ? escuela_id : null,
          institucion_id: noVacio(institucion_id) ? institucion_id : null,
          plan,
          cupos: cupos ?? null,
          fecha_fin: fecha_fin ?? null,
          condiciones: noVacio(condiciones) ? condiciones.trim() : null,
        };
        if (fecha_inicio !== undefined && fecha_inicio !== null) fila.fecha_inicio = fecha_inicio;
        if (estado !== undefined) fila.estado = estado;
        const { data, error } = await sb.from('licencia').insert(fila).select(COLS_LIC).single();
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'crear_licencia', entidad: 'licencia',
          entidad_id: (data as { id: string }).id,
          detalle: { escuela_id: fila.escuela_id, institucion_id: fila.institucion_id, plan, cupos: fila.cupos },
        });
        return json({ licencia: data });
      }

      case 'licencia_editar': {
        const { licencia_id } = body as Record<string, unknown>;
        if (!noVacio(licencia_id)) return json({ error: 'falta_licencia_id' }, 400);
        const v = validarLicenciaEditar(body as Record<string, unknown>);
        if (!v.ok) return json({ error: v.error }, 400);
        const { data: actual } = await sb.from('licencia')
          .select('id, institucion_id').eq('id', licencia_id).maybeSingle();
        if (!actual) return json({ error: 'no_existe' }, 404);
        const patch = armarPatchLicencia(body as Record<string, unknown>);
        // Cupos en una licencia directa: mismo CHECK de la DB, 400 legible.
        if (patch.cupos != null && !(actual as { institucion_id: string | null }).institucion_id) {
          return json({ error: 'cupos_solo_pool' }, 400);
        }
        if (!Object.keys(patch).length) return json({ ok: true });
        const { data, error } = await sb.from('licencia')
          .update(patch).eq('id', licencia_id).select(COLS_LIC).single();
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'editar_licencia', entidad: 'licencia',
          entidad_id: String(licencia_id), detalle: patch,
        });
        return json({ licencia: data });
      }

      case 'licencia_listar': {
        const { data, error } = await sb
          .from('licencia')
          .select(`${COLS_LIC}, escuela:escuela_id (nombre), institucion:institucion_id (nombre)`)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const filas = (data ?? []) as ({ id: string } & Record<string, unknown>)[];
        const usados = await usadosPorLicencia(filas.map((l) => l.id));
        return json({
          licencias: filas.map((l) => ({ ...l, usados: usados.get(l.id) ?? 0 })),
        });
      }

      // ── Cupos de pools ────────────────────────────────────────────────────
      case 'cupo_asignar': {
        const { licencia_id, escuela_id } = body as Record<string, unknown>;
        if (!noVacio(licencia_id)) return json({ error: 'falta_licencia_id' }, 400);
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        const { data: lic } = await sb.from('licencia')
          .select('id, institucion_id, cupos').eq('id', licencia_id).maybeSingle();
        if (!lic) return json({ error: 'no_existe' }, 404);
        if (!(lic as { institucion_id: string | null }).institucion_id) {
          return json({ error: 'licencia_no_es_pool' }, 400);
        }
        const { data: esc } = await sb.from('escuela').select('id').eq('id', escuela_id).maybeSingle();
        if (!esc) return json({ error: 'escuela_inexistente' }, 404);
        const { error } = await sb.from('licencia_asignacion')
          .insert({ escuela_id, licencia_id });
        if (error) {
          const code = codigoErrorAsignacion(error);
          if (code) return json({ error: code }, 409);
          throw error;
        }
        registrarAuditoria(sb, ctx, {
          accion: 'asignar_cupo', entidad: 'licencia',
          entidad_id: String(licencia_id), detalle: { escuela_id },
        });
        return json({ ok: true });
      }

      case 'cupo_quitar': {
        const { escuela_id } = body as Record<string, unknown>;
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        const { data, error } = await sb.from('licencia_asignacion')
          .delete().eq('escuela_id', escuela_id).select('licencia_id');
        if (error) throw error;
        if (!(data ?? []).length) return json({ error: 'sin_asignacion' }, 404);
        registrarAuditoria(sb, ctx, {
          accion: 'quitar_cupo', entidad: 'licencia',
          entidad_id: (data as { licencia_id: string }[])[0].licencia_id,
          detalle: { escuela_id },
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
