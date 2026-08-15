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
// Cola de revisión del mapeo NAP (Task 7): la lógica de armado vive en un
// módulo hermano puro (nap-revision-logica.ts), testeable desde Node — acá
// solo el I/O (patrón index.ts=I/O / *-logica.ts=lógica del resto del repo).
import {
  armarCatalogoGrado, armarNodosRevision, gradoCoincide, normalizarNapTemaId,
  type NapTemaRaw, type NodoNapRaw, type TemaCatalogoOut,
} from './nap-revision-logica.ts';

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

      // Cola de revisión del mapeo NAP (Task 7). `nap_revisado = false` +
      // (sin tema o confianza baja): exactamente el criterio del brief, SIN
      // excluir la materia de prueba que nap_backfill sí excluye (esMateriaDeTest
      // es para no gastar API real clasificando basura de tests; acá es
      // trabajo humano y no cuesta nada mostrarlo — decisión del controller).
      case 'nap_revision_listar': {
        const { data: nodosRaw, error: nErr } = await sb
          .from('nodo')
          .select(
            'id, nombre, nap_tema_id, nap_confianza, nap_intentos, programa_id, ' +
            'programa:programa_id(grado, materia:materia_id(nombre))',
          )
          .eq('nap_revisado', false)
          .or('nap_tema_id.is.null,nap_confianza.lt.0.7')
          .order('nap_intentos', { ascending: false })
          .order('nombre', { ascending: true });
        if (nErr) throw nErr;
        const nodos = (nodosRaw ?? []) as unknown as NodoNapRaw[];

        // Colegio de cada nodo: vía sol_materia (no siempre existe — nodos de
        // fixtures/tests quedan sin publicar; armarNodosRevision cae a un
        // texto de fallback, no rompe la pantalla). Última fila por programa
        // gana (order created_at asc, se pisa con la más nueva).
        const programaIds = [...new Set(nodos.map((n) => n.programa_id))];
        const colegioPorPrograma = new Map<string, string>();
        if (programaIds.length) {
          const { data: solRaw, error: sErr } = await sb
            .from('sol_materia')
            .select('programa_id, escuela:escuela_id(nombre)')
            .in('programa_id', programaIds)
            .order('created_at', { ascending: true });
          if (sErr) throw sErr;
          for (const s of (solRaw ?? []) as unknown as { programa_id: string; escuela: { nombre: string } | null }[]) {
            if (s.escuela?.nombre) colegioPorPrograma.set(s.programa_id, s.escuela.nombre);
          }
        }

        // Catálogo NAP por grado, SIN filtrar por materia (Regla 4 del brief):
        // las cuatro materias del grado, una por cada grado presente en la
        // cola. Cacheado para no repetir la consulta entre nodos del mismo grado.
        const grados = [...new Set(nodos.map((n) => n.programa?.grado).filter((g): g is number => typeof g === 'number'))];
        const catalogoPorGrado = new Map<number, TemaCatalogoOut[]>();
        for (const grado of grados) {
          const { data: temasRaw, error: tErr } = await sb
            .from('nap_tema')
            .select('id, nombre, texto_oficial, orden, nap_eje(materia, nombre, orden)')
            .eq('grado', grado);
          if (tErr) throw tErr;
          catalogoPorGrado.set(grado, armarCatalogoGrado((temasRaw ?? []) as unknown as NapTemaRaw[]));
        }

        return json({ nodos: armarNodosRevision(nodos, colegioPorPrograma, catalogoPorGrado) });
      }

      // Confirma o corrige la propuesta de un nodo: `nap_tema_id` (un id del
      // catálogo) o `null`/ausente = "Fuera del marco". Setea nap_revisado en
      // true — un nodo revisado nunca se reclasifica solo (spec de diseño).
      case 'nap_revision_fijar': {
        const { nodo_id } = body;
        if (!noVacio(nodo_id)) return json({ error: 'falta_nodo_id' }, 400);
        const tema = normalizarNapTemaId(body.nap_tema_id);
        if (!tema.ok) return json({ error: 'nap_tema_id_invalido' }, 400);

        const { data: antes } = await sb
          .from('nodo')
          .select('id, nap_tema_id, nap_confianza, programa:programa_id(grado)')
          .eq('id', nodo_id)
          .maybeSingle();
        if (!antes) return json({ error: 'no_existe' }, 404);
        const nodoAntes = antes as unknown as {
          id: string; nap_tema_id: string | null; nap_confianza: number | null;
          programa: { grado: number } | null;
        };

        // `nodo.nap_tema_id` es una FK pelada a nap_tema(id), sin restricción
        // de grado (migración 0028): el <select> del front ya filtra por
        // grado, pero este chequeo NO puede vivir solo ahí (Hallazgo 1 de la
        // review) — un curl, un payload viejo o un futuro botón de
        // "reclasificar" podrían pegarle a un nodo de 1° un tema de 7° sin
        // error y sin rastro en la auditoría.
        if (tema.value) {
          const { data: temaRow } = await sb
            .from('nap_tema')
            .select('id, grado')
            .eq('id', tema.value)
            .maybeSingle();
          if (!temaRow) return json({ error: 'tema_no_existe' }, 400);
          const gradoTema = (temaRow as { grado: number }).grado;
          if (!gradoCoincide(tema.value, nodoAntes.programa?.grado ?? null, gradoTema)) {
            return json({ error: 'grado_no_coincide' }, 400);
          }
        }

        const { error: uErr } = await sb
          .from('nodo')
          .update({ nap_tema_id: tema.value, nap_revisado: true })
          .eq('id', nodo_id);
        if (uErr) throw uErr;

        registrarAuditoria(sb, ctx, {
          accion: 'nap_revision_fijar',
          entidad: 'nodo',
          entidad_id: nodo_id,
          detalle: { de: nodoAntes.nap_tema_id, a: tema.value, confianza_previa: nodoAntes.nap_confianza },
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
