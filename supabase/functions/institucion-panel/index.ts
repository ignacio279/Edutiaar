// institucion-panel (alumno golondrina, WP-C): el panel del admin de
// INSTITUCIÓN (provincia, fundación, red, municipio) — migración 0025.
//
// REGLA INQUEBRANTABLE (ADR-011): este rol JAMÁS ve datos de alumnos
// individuales. Acá no sale un nombre ni un id de chico: solo NÚMEROS ya
// agregados, y el desempeño con el mismo k-anonimato k=5 del observatorio.
//
// SCOPING EN LA CAPA DE DATOS: `verificarAdminInstitucion` trae la institución
// del caller y CADA query filtra por ella. Ningún `escuela_id` que mande el
// front se usa sin verificar antes que pertenece a esa institución
// (`fuera_de_tu_institucion`): el front no es fuente de verdad.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdminInstitucion, type InstCtx } from '../_shared/admin.ts';
import { armarPatchIdentidad } from '../_shared/identidad.ts';
import {
  FEATURES_DEFAULT, emailNormalizado, fechasTrial, generarPasswordTemporal,
  validarColegioCrear, validarDesempeno, validarDocenteCrear,
} from './validar.ts';
// Misma lógica pura que usa el observatorio de plataforma: k=5 por tema, filas
// nacidas del catálogo NAP y cobertura "N de M colegios" (vive en _shared
// porque la comparten dos funciones).
import {
  desempenoPorEje, type AlumnoNodoNap, type EjeCat, type NodoNap,
  type SesionObs, type TemaCat,
} from '../_shared/observatorio-logica.ts';

const DIAS_USO = 30;
const DIAS_ACTIVOS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdminInstitucion(req);
    if (ctx instanceof Response) return ctx;
    const { sb, institucion } = ctx as InstCtx;

    const body = await req.json();
    const { accion } = body;

    // Auditoría del rol institucional. registrarAuditoria() espera un AdminCtx
    // de plataforma, así que insertamos directo con nivel 'institucion'
    // (misma tabla, mismo formato: quién hizo qué y sobre qué).
    const auditar = (accionAud: string, entidad: string, entidadId: string, detalle: Record<string, unknown>) => {
      sb.from('auditoria').insert({
        actor_id: ctx.user.id, actor_email: ctx.user.email ?? null, nivel: 'institucion',
        accion: accionAud, entidad, entidad_id: entidadId,
        detalle: { ...detalle, institucion_id: institucion.id },
      }).then(({ error }) => { if (error) console.error('auditoria_fallo', accionAud, error.message); });
    };

    // ── Scoping: mis colegios y nada más ────────────────────────────────────
    const misColegios = async () => {
      const { data, error } = await sb
        .from('escuela')
        .select('id, nombre, provincia, estado, created_at')
        .eq('institucion_id', institucion.id)
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string; provincia: string | null; estado: string; created_at: string }[];
    };
    // Verifica pertenencia de un escuela_id recibido del front. Devuelve null
    // si no es mío (o no existe): el caller corta con 403 sin distinguir los
    // dos casos — un colegio ajeno no se puede ni sondear.
    const colegioMio = async (escuelaId: unknown): Promise<string | null> => {
      if (typeof escuelaId !== 'string' || !escuelaId.trim()) return null;
      const { data } = await sb.from('escuela').select('id')
        .eq('id', escuelaId).eq('institucion_id', institucion.id).maybeSingle();
      return (data as { id?: string } | null)?.id ?? null;
    };

    // Licencia efectiva por colegio (misma prioridad que acceso_calcular v2 de
    // 0026: la directa manda, si no la del pool asignado).
    const licenciasDe = async (ids: string[]) => {
      const mapa: Record<string, { id: string; plan: string; estado: string; fecha_fin: string | null; via: 'directa' | 'pool' }> = {};
      if (ids.length === 0) return mapa;
      const { data: asigs } = await sb
        .from('licencia_asignacion')
        .select('escuela_id, licencia:licencia_id (id, plan, estado, fecha_fin)')
        .in('escuela_id', ids);
      for (const a of (asigs ?? []) as { escuela_id: string; licencia: { id: string; plan: string; estado: string; fecha_fin: string | null } | null }[]) {
        if (a.licencia) mapa[a.escuela_id] = { ...a.licencia, via: 'pool' };
      }
      const { data: directas } = await sb
        .from('licencia')
        .select('id, escuela_id, plan, estado, fecha_fin')
        .in('escuela_id', ids)
        .order('fecha_inicio', { ascending: true });
      for (const l of (directas ?? []) as { id: string; escuela_id: string; plan: string; estado: string; fecha_fin: string | null }[]) {
        mapa[l.escuela_id] = { id: l.id, plan: l.plan, estado: l.estado, fecha_fin: l.fecha_fin, via: 'directa' };
      }
      return mapa;
    };

    // Alumnos de mis colegios: SOLO para agregar. Los ids se usan de filtro
    // interno y NUNCA salen en la respuesta.
    const alumnosDe = async (ids: string[]) => {
      if (ids.length === 0) return [] as { id: string; escuela_id: string }[];
      const { data } = await sb.from('perfil').select('id, escuela_id')
        .eq('rol', 'alumno').in('escuela_id', ids);
      return (data ?? []) as { id: string; escuela_id: string }[];
    };

    const contarPorEscuela = (filas: { escuela_id: string | null }[]) => {
      const c: Record<string, number> = {};
      for (const f of filas) if (f.escuela_id) c[f.escuela_id] = (c[f.escuela_id] ?? 0) + 1;
      return c;
    };

    switch (accion) {
      // Foto de la institución: mis colegios con sus números y su licencia.
      case 'resumen': {
        const colegios = await misColegios();
        const ids = colegios.map((c) => c.id);
        const [licencias, alumnos, docentesData, deudaData, poolsData] = await Promise.all([
          licenciasDe(ids),
          alumnosDe(ids),
          ids.length ? sb.from('perfil').select('id, escuela_id').eq('rol', 'docente').in('escuela_id', ids) : Promise.resolve({ data: [] }),
          ids.length ? sb.from('consentimiento').select('id, escuela_id').eq('estado', 'pendiente_regularizar').in('escuela_id', ids) : Promise.resolve({ data: [] }),
          sb.from('licencia').select('id, plan, cupos, estado, fecha_fin').eq('institucion_id', institucion.id),
        ]);

        // Matrículas activas por colegio (la fuente de verdad del vínculo).
        const { data: matriculas } = ids.length
          ? await sb.from('matricula').select('escuela_id').is('fecha_fin', null).in('escuela_id', ids)
          : { data: [] };

        const docentes = contarPorEscuela((docentesData.data ?? []) as { escuela_id: string | null }[]);
        const deuda = contarPorEscuela((deudaData.data ?? []) as { escuela_id: string | null }[]);
        const activas = contarPorEscuela((matriculas ?? []) as { escuela_id: string | null }[]);
        const alumnosPorEsc = contarPorEscuela(alumnos);

        // Cupos usados de cada pool de la institución.
        const pools = (poolsData.data ?? []) as { id: string; plan: string; cupos: number | null; estado: string; fecha_fin: string | null }[];
        const usados: Record<string, number> = {};
        if (pools.length) {
          const { data: asigs } = await sb.from('licencia_asignacion')
            .select('licencia_id').in('licencia_id', pools.map((p) => p.id));
          for (const a of (asigs ?? []) as { licencia_id: string }[]) {
            usados[a.licencia_id] = (usados[a.licencia_id] ?? 0) + 1;
          }
        }

        return json({
          institucion: { id: institucion.id, nombre: institucion.nombre, estado: institucion.estado },
          colegios: colegios.map((c) => ({
            id: c.id, nombre: c.nombre, provincia: c.provincia, estado: c.estado,
            docentes: docentes[c.id] ?? 0,
            alumnos: alumnosPorEsc[c.id] ?? 0,
            matriculas_activas: activas[c.id] ?? 0,
            deuda_consentimientos: deuda[c.id] ?? 0,
            licencia: licencias[c.id] ?? null,
          })),
          pools: pools.map((p) => ({
            ...p,
            usados: usados[p.id] ?? 0,
            disponibles: p.cupos === null ? null : Math.max(0, p.cupos - (usados[p.id] ?? 0)),
          })),
        });
      }

      // Uso agregado de mis colegios. Desempeño con k=5; volumen sin suprimir.
      case 'metricas': {
        const colegios = await misColegios();
        let ids = colegios.map((c) => c.id);
        if (body.escuela_id !== undefined && body.escuela_id !== null) {
          const mio = await colegioMio(body.escuela_id);
          if (!mio) return json({ error: 'fuera_de_tu_institucion' }, 403);
          ids = [mio];
        }
        const alumnos = await alumnosDe(ids);
        const escuelaDeAlumno = new Map(alumnos.map((a) => [a.id, a.escuela_id]));
        const alumnoIds = alumnos.map((a) => a.id);

        const desdeUso = new Date(Date.now() - DIAS_USO * 86400000).toISOString();
        const desdeActivos = new Date(Date.now() - DIAS_ACTIVOS * 86400000).toISOString();
        const inicioMes = new Date();
        inicioMes.setUTCDate(1);
        inicioMes.setUTCHours(0, 0, 0, 0);

        const { data: sesiones } = alumnoIds.length
          ? await sb.from('sesion').select('alumno_id, fecha, aciertos, total')
              .in('alumno_id', alumnoIds).gte('fecha', desdeUso)
          : { data: [] };
        const { data: usos } = ids.length
          ? await sb.from('uso_api').select('escuela_id, costo_usd')
              .in('escuela_id', ids).gte('created_at', inicioMes.toISOString())
          : { data: [] };

        const porEscuela: Record<string, { sesiones: number; aciertos: number; total: number; alumnos: Set<string>; activos: Set<string> }> = {};
        for (const id of ids) porEscuela[id] = { sesiones: 0, aciertos: 0, total: 0, alumnos: new Set(), activos: new Set() };
        for (const s of (sesiones ?? []) as { alumno_id: string; fecha: string; aciertos: number; total: number }[]) {
          const esc = escuelaDeAlumno.get(s.alumno_id);
          if (!esc || !porEscuela[esc]) continue;
          const p = porEscuela[esc];
          p.sesiones += 1;
          p.aciertos += Number(s.aciertos) || 0;
          p.total += Number(s.total) || 0;
          p.alumnos.add(s.alumno_id);
          if (s.fecha >= desdeActivos) p.activos.add(s.alumno_id);
        }
        const costos: Record<string, number> = {};
        for (const u of (usos ?? []) as { escuela_id: string | null; costo_usd: number | string }[]) {
          if (u.escuela_id) costos[u.escuela_id] = (costos[u.escuela_id] ?? 0) + (Number(u.costo_usd) || 0);
        }

        // VOLUMEN Y COSTO, nunca precisión por colegio (2026-08-18): ese
        // número no es comparable entre colegios —distintos grados, distintos
        // nodos, dificultad adaptativa por chico— y acá lo miraba justo quien
        // tiene poder de ranking sobre esas escuelas. El aprendizaje se mira
        // en la acción `desempeno`, contra la vara fija de los NAP.
        return json({
          rango_dias: DIAS_USO,
          filas: colegios.filter((c) => ids.includes(c.id)).map((c) => {
            const p = porEscuela[c.id];
            return {
              escuela_id: c.id, nombre: c.nombre, provincia: c.provincia,
              sesiones: p.sesiones,
              alumnos_activos_7d: p.activos.size,
              costo_mes_usd: Number((costos[c.id] ?? 0).toFixed(4)),
            };
          }),
        });
      }

      // Desempeño contra el marco curricular NAP, acotado a MIS colegios.
      // Espejo de la acción homónima de admin-observatorio, con el universo
      // scopeado en la capa de datos (alumnosDe(ids) ya filtra por mis
      // escuelas): la misma lógica pura, el mismo k-anonimato k=5, las mismas
      // filas nacidas del catálogo. Solo lectura → no audita.
      case 'desempeno': {
        const v = validarDesempeno(body);
        if (!v.ok) return json({ error: v.error }, 400);
        const materia = String(body.materia).trim();
        const grado = body.grado as number;

        const colegios = await misColegios();
        let ids = colegios.map((c) => c.id);
        if (body.escuela_id !== undefined && body.escuela_id !== null) {
          const mio = await colegioMio(body.escuela_id);
          if (!mio) return json({ error: 'fuera_de_tu_institucion' }, 403);
          ids = [mio];
        }
        if (ids.length === 0) return json({ rango_dias: DIAS_USO, ejes: [] });

        // Oposición ARCO (0024): un alumno con excluido_procesamiento queda
        // FUERA de todo agregado no esencial. Este universo es la única puerta
        // de entrada de chicos acá, igual que en admin-observatorio.
        const { data: alumnosData } = await sb.from('perfil')
          .select('id, escuela_id')
          .eq('rol', 'alumno')
          .eq('excluido_procesamiento', false)
          .in('escuela_id', ids);
        const alumnos = (alumnosData ?? []) as { id: string; escuela_id: string }[];
        if (alumnos.length === 0) return json({ rango_dias: DIAS_USO, ejes: [] });
        const alumnoIds = alumnos.map((a) => a.id);

        const desde = new Date(Date.now() - DIAS_USO * 86400000).toISOString();
        const [sesionesRes, alumnoNodoRes, nodosRes, ejesRes, temasRes] = await Promise.all([
          sb.from('sesion').select('alumno_id, nodo_id, aciertos, total')
            .in('alumno_id', alumnoIds).gte('fecha', desde),
          sb.from('alumno_nodo').select('alumno_id, nodo_id, puntaje, estado')
            .in('alumno_id', alumnoIds),
          sb.from('nodo').select('id, nap_tema_id, nap_confianza, nap_revisado'),
          sb.from('nap_eje').select('id, materia, nombre, orden').eq('materia', materia),
          sb.from('nap_tema').select('id, eje_id, nombre, grado, orden, nap_eje!inner(materia)')
            .eq('grado', grado).eq('nap_eje.materia', materia),
        ]);

        const ejes = desempenoPorEje(
          {
            sesiones: (sesionesRes.data ?? []) as SesionObs[],
            alumnoNodo: (alumnoNodoRes.data ?? []) as AlumnoNodoNap[],
            nodos: (nodosRes.data ?? []) as NodoNap[],
            ejes: (ejesRes.data ?? []) as EjeCat[],
            temas: (temasRes.data ?? []) as TemaCat[],
            escuelaDeAlumno: new Map(alumnos.map((a) => [a.id, a.escuela_id])),
            // Sin filtro de provincia: el scoping ya es el conjunto de MIS
            // colegios, y un segundo eje partiría la muestra sin motivo.
            provinciaDeAlumno: new Map(),
          },
          { materia, grado },
        );
        return json({ rango_dias: DIAS_USO, materia, grado, ejes });
      }

      // Deuda de consentimientos de un colegio mío: SOLO el número.
      case 'deuda_consentimientos': {
        const mio = await colegioMio(body.escuela_id);
        if (!mio) return json({ error: 'fuera_de_tu_institucion' }, 403);
        const { count } = await sb.from('consentimiento')
          .select('id', { count: 'exact', head: true })
          .eq('escuela_id', mio).eq('estado', 'pendiente_regularizar');
        return json({ escuela_id: mio, pendientes: count ?? 0 });
      }

      // Alta de colegio DENTRO de mi institución (nace en trial de 30 días,
      // igual que el alta de plataforma).
      case 'colegio_crear': {
        const v = validarColegioCrear(body);
        if (!v.ok) return json({ error: v.error }, 400);
        const { trial_inicio, trial_fin } = fechasTrial(new Date());
        const { data: esc, error } = await sb.from('escuela').insert({
          nombre: String(body.nombre).trim(),
          provincia: body.provincia ?? null,
          tipo: body.tipo ?? null,
          zona: typeof body.zona === 'string' ? body.zona.trim() : null,
          estado: 'trial', trial_inicio, trial_fin,
          institucion_id: institucion.id, // el scoping nace con el colegio
          ...armarPatchIdentidad(body), // identidad oficial normalizada (0033)
        }).select('id, nombre, provincia, estado, cue, cue_anexo').single();
        if (error) {
          if ((error as { code?: string }).code === '23505') {
            return json({ error: 'cue_duplicado' }, 409);
          }
          throw error;
        }
        const nueva = esc as { id: string; nombre: string };
        // Features default: el alta institucional no puede dejar un colegio
        // sin fila cuando el alta de plataforma sí la crea.
        await sb.from('escuela_feature').insert({
          escuela_id: nueva.id, flags: FEATURES_DEFAULT, plan: 'docente',
        });
        auditar('colegio_creado', 'escuela', nueva.id, { nombre: nueva.nombre });
        return json({ colegio: esc });
      }

      // Alta de maestra en un colegio mío (patrón admin-maestras: password
      // temporal de una sola vez + link de invitación).
      case 'docente_crear': {
        const v = validarDocenteCrear(body);
        if (!v.ok) return json({ error: v.error }, 400);
        const mio = await colegioMio(body.escuela_id);
        if (!mio) return json({ error: 'fuera_de_tu_institucion' }, 403);
        const email = emailNormalizado(body.email);
        const nombre = String(body.nombre).trim();
        const password = generarPasswordTemporal();

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
        const { error: pErr } = await sb.from('perfil').insert({ id, rol: 'docente', nombre, escuela_id: mio });
        if (pErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw pErr; }
        const { error: aErr } = await sb.from('docente_acceso').insert({ perfil_id: id, estado: 'activo' });
        if (aErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw aErr; }

        let link: string | null = null;
        let warning: string | undefined;
        const { data: linkData, error: lErr } = await sb.auth.admin.generateLink({ type: 'recovery', email });
        const action = linkData?.properties?.action_link;
        if (lErr || !action) warning = 'link_no_generado'; else link = action;

        auditar('docente_creado', 'perfil', id, { email, escuela_id: mio });
        return json({
          maestra: { id, nombre, email },
          invitacion: { link, password_temporal: password, ...(warning ? { warning } : {}) },
        });
      }

      // Consumir un cupo de MI pool para UN colegio mío (doble verificación).
      case 'cupo_asignar': {
        const mio = await colegioMio(body.escuela_id);
        if (!mio) return json({ error: 'fuera_de_tu_institucion' }, 403);
        const { data: lic } = await sb.from('licencia').select('id, cupos')
          .eq('id', body.licencia_id ?? '').eq('institucion_id', institucion.id).maybeSingle();
        if (!lic) return json({ error: 'fuera_de_tu_institucion' }, 403);
        const { error } = await sb.from('licencia_asignacion')
          .insert({ escuela_id: mio, licencia_id: (lic as { id: string }).id });
        if (error) {
          const msg = String(error.message ?? '');
          if (msg.includes('sin_cupos')) return json({ error: 'sin_cupos' }, 409);
          if ((error as { code?: string }).code === '23505') return json({ error: 'colegio_ya_asignado' }, 409);
          throw error;
        }
        auditar('cupo_asignado', 'escuela', mio, { licencia_id: (lic as { id: string }).id });
        return json({ ok: true });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
