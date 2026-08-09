// admin-colegios (Dashboard admin v3 — WP1): alta, edición, estados y ficha de
// colegios desde el panel /admin. Solo admins de plataforma: guard
// verificarAdmin (_shared/admin.ts) → service_role. Patrón de gestion-alumnos:
// index.ts = I/O, validar.ts = lógica pura (testeable desde Node). Toda
// mutación audita (registrarAuditoria). Errores {error:'codigo_snake'}.
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { cors, json } from '../_shared/cors.ts';
import {
  FEATURES_DEFAULT,
  armarPatchEditar,
  estadoValido,
  fechasTrial,
  normalizarFiltros,
  puedeTransicionar,
  requiereSuper,
  validarCrear,
  validarEditar,
} from './validar.ts';

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

const COLS = 'id, nombre, zona, provincia, tipo, estado, trial_inicio, trial_fin, created_at';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    // Counts por colegio con head:true + count:'exact'. OJO N+1: son 3 queries
    // por colegio en `listar` — aceptable para el MVP (pocos colegios); si la
    // lista crece, mover a una vista agregada o un RPC con group by.
    const contar = async (tabla: string, filtros: Record<string, string>) => {
      let q = sb.from(tabla).select('id', { count: 'exact', head: true });
      for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };
    const countsDe = async (escuelaId: string) => {
      const [maestras, aulas, alumnos] = await Promise.all([
        contar('perfil', { escuela_id: escuelaId, rol: 'docente' }),
        contar('aula', { escuela_id: escuelaId }),
        contar('perfil', { escuela_id: escuelaId, rol: 'alumno' }),
      ]);
      return { maestras, aulas, alumnos };
    };

    switch (accion) {
      case 'listar': {
        const f = normalizarFiltros(body.filtros);
        let q = sb.from('escuela').select(COLS).order('created_at', { ascending: false });
        if (f.estado) q = q.eq('estado', f.estado);
        if (f.tipo) q = q.eq('tipo', f.tipo);
        if (f.busqueda) q = q.ilike('nombre', `%${f.busqueda}%`);
        const { data, error } = await q;
        if (error) throw error;
        const filas = (data ?? []) as {
          id: string; nombre: string; zona: string | null; provincia: string | null;
          tipo: string | null; estado: string; trial_fin: string | null; created_at: string;
        }[];

        // Plan por colegio en UNA query. Sin fila en escuela_feature rige
        // features_default() (= plan docente), igual que acceso_calcular().
        const planes = new Map<string, string>();
        if (filas.length) {
          const { data: feats } = await sb
            .from('escuela_feature')
            .select('escuela_id, plan')
            .in('escuela_id', filas.map((c) => c.id));
          for (const fe of (feats ?? []) as { escuela_id: string; plan: string }[]) {
            planes.set(fe.escuela_id, fe.plan);
          }
        }

        const colegios = [];
        for (const c of filas) {
          const counts = await countsDe(c.id);
          colegios.push({
            id: c.id, nombre: c.nombre, zona: c.zona, provincia: c.provincia,
            tipo: c.tipo, estado: c.estado,
            trial_fin: c.trial_fin, plan: planes.get(c.id) ?? 'docente',
            ...counts, created_at: c.created_at,
          });
        }
        return json({ colegios });
      }

      case 'crear': {
        const { nombre, zona, tipo, provincia } = body;
        const v = validarCrear({ nombre, zona, tipo, provincia });
        if (!v.ok) return json({ error: v.error }, 400);

        const { trial_inicio, trial_fin } = fechasTrial(new Date());
        const { data: colegio, error } = await sb
          .from('escuela')
          .insert({
            nombre: String(nombre).trim(),
            zona: noVacio(zona) ? zona.trim() : null,
            provincia: provincia ?? null,
            tipo,
            estado: 'trial',
            trial_inicio,
            trial_fin,
          })
          .select(COLS)
          .single();
        if (error) throw error;

        // Fila de features con las flags default (plan docente). Si falla,
        // rollback del colegio (patrón gestion-alumnos): no dejar un colegio
        // a medio crear.
        const { error: fErr } = await sb
          .from('escuela_feature')
          .insert({ escuela_id: (colegio as { id: string }).id, flags: FEATURES_DEFAULT, plan: 'docente' });
        if (fErr) {
          await sb.from('escuela').delete().eq('id', (colegio as { id: string }).id);
          throw fErr;
        }

        registrarAuditoria(sb, ctx, {
          accion: 'crear_colegio',
          entidad: 'escuela',
          entidad_id: (colegio as { id: string }).id,
          detalle: { nombre: String(nombre).trim(), tipo, trial_fin },
        });
        return json({ colegio });
      }

      case 'editar': {
        const { escuela_id, nombre, zona, tipo, provincia } = body;
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        const v = validarEditar({ nombre, zona, tipo, provincia });
        if (!v.ok) return json({ error: v.error }, 400);
        const patch = armarPatchEditar({ nombre, zona, tipo, provincia });
        if (!Object.keys(patch).length) return json({ ok: true });

        const { data, error } = await sb
          .from('escuela')
          .update(patch)
          .eq('id', escuela_id)
          .select(COLS)
          .maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: 'no_existe' }, 404);

        registrarAuditoria(sb, ctx, {
          accion: 'editar_colegio', entidad: 'escuela', entidad_id: escuela_id, detalle: patch,
        });
        return json({ colegio: data });
      }

      case 'cambiar_estado': {
        const { escuela_id, estado } = body;
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        if (!estadoValido(estado)) return json({ error: 'estado_invalido' }, 400);
        // Archivar es destructivo de acceso (el colegio desaparece del setup y
        // sus cuentas quedan bloqueadas): solo super.
        if (requiereSuper(estado) && ctx.admin.nivel !== 'super') {
          return json({ error: 'requiere_super' }, 403);
        }

        const { data: actual } = await sb
          .from('escuela')
          .select('estado')
          .eq('id', escuela_id)
          .maybeSingle();
        if (!actual) return json({ error: 'no_existe' }, 404);
        const de = (actual as { estado: string }).estado;
        if (!puedeTransicionar(de, estado)) return json({ error: 'transicion_invalida' }, 400);

        const { error } = await sb.from('escuela').update({ estado }).eq('id', escuela_id);
        if (error) throw error;

        registrarAuditoria(sb, ctx, {
          accion: 'cambiar_estado_colegio',
          entidad: 'escuela',
          entidad_id: escuela_id,
          detalle: { de, a: estado },
        });
        return json({ ok: true, estado });
      }

      case 'detalle': {
        const { escuela_id } = body;
        if (!noVacio(escuela_id)) return json({ error: 'falta_escuela_id' }, 400);
        const { data: colegio } = await sb
          .from('escuela')
          .select(`${COLS}, contacto, limites`)
          .eq('id', escuela_id)
          .maybeSingle();
        if (!colegio) return json({ error: 'no_existe' }, 404);

        const counts = await countsDe(escuela_id);

        // Plan/flags: sin fila rigen las defaults (= plan docente), como en
        // acceso_calcular().
        const { data: feat } = await sb
          .from('escuela_feature')
          .select('flags, plan')
          .eq('escuela_id', escuela_id)
          .maybeSingle();
        const feature = feat
          ? { plan: (feat as { plan: string }).plan, flags: (feat as { flags: unknown }).flags }
          : { plan: 'docente', flags: FEATURES_DEFAULT };

        // Stats últimos 30 días: sesiones de los alumnos del colegio +
        // ejercicios respondidos (respuesta join sesion). El .in() con la
        // lista de alumnos alcanza para el MVP (aulas chicas); con miles de
        // alumnos convendría un RPC agregado.
        const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: alus } = await sb
          .from('perfil')
          .select('id')
          .eq('escuela_id', escuela_id)
          .eq('rol', 'alumno');
        const alumnosIds = ((alus ?? []) as { id: string }[]).map((a) => a.id);

        let sesiones_30d = 0;
        let respuestas_30d = 0;
        if (alumnosIds.length) {
          const { count: ses } = await sb
            .from('sesion')
            .select('id', { count: 'exact', head: true })
            .in('alumno_id', alumnosIds)
            .gte('fecha', desde);
          sesiones_30d = ses ?? 0;
          const { count: resp } = await sb
            .from('respuesta')
            .select('id, sesion!inner(alumno_id)', { count: 'exact', head: true })
            .in('sesion.alumno_id', alumnosIds)
            .gte('created_at', desde);
          respuestas_30d = resp ?? 0;
        }

        return json({
          colegio,
          counts,
          stats: { sesiones_30d, respuestas_30d },
          feature,
        });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
