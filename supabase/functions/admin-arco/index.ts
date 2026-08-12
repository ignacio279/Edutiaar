// admin-arco (Alumno golondrina — WP-B): derechos ARCO de la Ley 25.326 sobre
// el legajo del alumno. Principio rector: EDUTIA custodia los datos del chico
// en nombre de su familia — y la familia puede pedir verlos (Acceso),
// corregir su identidad (Rectificación), sacarlos de los agregados no
// esenciales (Oposición) o borrarlos del todo (Cancelación).
//
// LA regla dura del sistema: la cancelación ARCO es EL ÚNICO camino de
// borrado físico. Es de dos pasos (solicitar → dry-run visible → confirmar) y
// confirma SOLO un admin nivel 'super'. El caso ARCO (arco_caso, sin FK) y la
// auditoría SOBREVIVEN al borrado: son el registro legal de que se cumplió.
// Guard verificarAdmin (plataforma_admin) + service_role; toda mutación
// audita. Lógica pura testeable en ./arco-logica.ts.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { armarSnapshotAnonimo, diffRectificacion, planDeBorrado } from './arco-logica.ts';

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const MAX_FILAS = 10000; // tope defensivo de toda lectura del legajo

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    // El service_role saltea la RLS: el perfil se re-verifica a mano.
    const alumnoDe = async (alumnoId: string) => {
      if (!noVacio(alumnoId)) return null;
      const { data } = await sb
        .from('perfil')
        .select('id, nombre, avatar, grado, estado, excluido_procesamiento')
        .eq('id', alumnoId)
        .eq('rol', 'alumno')
        .maybeSingle();
      return data as {
        id: string; nombre: string; avatar: string | null; grado: number | null;
        estado: string; excluido_procesamiento: boolean;
      } | null;
    };

    // Conteo de una tabla keyed por alumno_id (head:true → solo el count).
    const contar = async (tabla: string, alumnoId: string) => {
      const { count, error } = await sb
        .from(tabla)
        .select('*', { count: 'exact', head: true })
        .eq('alumno_id', alumnoId);
      if (error) throw error;
      return count ?? 0;
    };
    // respuesta/evaluacion_sesion no llevan alumno_id: se cuentan vía el join
    // embebido con sesion (!inner filtra server-side, nada viaja al cliente).
    const contarViaSesion = async (tabla: string, alumnoId: string) => {
      const { count, error } = await sb
        .from(tabla)
        .select('id, sesion!inner(alumno_id)', { count: 'exact', head: true })
        .eq('sesion.alumno_id', alumnoId);
      if (error) throw error;
      return count ?? 0;
    };

    const conteosDeBorrado = async (alumnoId: string) => ({
      sesiones: await contar('sesion', alumnoId),
      respuestas: await contarViaSesion('respuesta', alumnoId),
      nodos: await contar('alumno_nodo', alumnoId),
      boletines: await contar('boletin', alumnoId),
      matriculas: await contar('matricula', alumnoId),
      consentimientos: await contar('consentimiento', alumnoId),
      transferencias: await contar('transferencia', alumnoId),
    });

    // Alta de un caso ya ejecutado (acceso / rectificación / oposición son de
    // ejecución inmediata; la cancelación es la única de dos pasos).
    const crearCasoEjecutado = async (
      alumnoId: string,
      tipo: string,
      detalle: Record<string, unknown> | null,
      agregado: Record<string, unknown> | null = null,
    ) => {
      const { data, error } = await sb
        .from('arco_caso')
        .insert({
          alumno_id: alumnoId, tipo, estado: 'ejecutado',
          solicitado_por: ctx.user.id, detalle, agregado,
          ejecutado_por: ctx.user.id, ejecutado_at: new Date().toISOString(),
        })
        .select('id, tipo, estado, created_at')
        .single();
      if (error) throw error;
      return data as { id: string };
    };

    switch (accion) {
      case 'casos_listar': {
        const { estado, tipo } = body;
        let q = sb
          .from('arco_caso')
          .select('id, alumno_id, tipo, estado, solicitado_por, detalle, agregado, ejecutado_por, ejecutado_at, created_at')
          .order('created_at', { ascending: false })
          .limit(200);
        if (noVacio(estado)) q = q.eq('estado', estado);
        if (noVacio(tipo)) q = q.eq('tipo', tipo);
        const { data, error } = await q;
        if (error) throw error;
        return json({ casos: data ?? [] });
      }

      // ── ACCESO: export completo del legajo ──────────────────────────────
      // Devuelve TODO lo que EDUTIA sabe del chico, en JSON, SIN ids de
      // terceros (docentes, aulas, otros alumnos): los joins traen nombres de
      // escuela/nodo, nunca uuids ajenos. El front lo baja como archivo y
      // ofrece la vista imprimible.
      case 'exportar_legajo': {
        const alumno = await alumnoDe(body.alumno_id);
        if (!alumno) return json({ error: 'alumno_inexistente' }, 404);

        const [matriculas, consentimientos, sesiones, respuestas, progreso, evaluaciones, boletines] =
          await Promise.all([
            sb.from('matricula')
              .select('grado, fecha_inicio, fecha_fin, estado, motivo_cierre, escuela:escuela_id(nombre, provincia)')
              .eq('alumno_id', alumno.id).order('fecha_inicio', { ascending: true }).limit(MAX_FILAS),
            sb.from('consentimiento')
              .select('adulto_nombre, adulto_vinculo, alcance, via, estado, otorgado_at, revocado_at, created_at, escuela:escuela_id(nombre)')
              .eq('alumno_id', alumno.id).order('created_at', { ascending: true }).limit(MAX_FILAS),
            sb.from('sesion')
              .select('fecha, duracion_seg, aciertos, total, nodo:nodo_id(nombre)')
              .eq('alumno_id', alumno.id).order('fecha', { ascending: true }).limit(MAX_FILAS),
            sb.from('respuesta')
              .select('dada, correcta, tiempo_seg, reintentos, created_at, sesion!inner(alumno_id)')
              .eq('sesion.alumno_id', alumno.id).order('created_at', { ascending: true }).limit(MAX_FILAS),
            sb.from('alumno_nodo')
              .select('estado, puntaje, actualizado_at, nodo:nodo_id(nombre)')
              .eq('alumno_id', alumno.id).limit(MAX_FILAS),
            sb.from('evaluacion_sesion')
              .select('resumen, errores, a_reforzar, created_at, sesion!inner(alumno_id)')
              .eq('sesion.alumno_id', alumno.id).order('created_at', { ascending: true }).limit(MAX_FILAS),
            sb.from('boletin')
              .select('periodo, contenido, estado, version, created_at')
              .eq('alumno_id', alumno.id).order('periodo', { ascending: true }).limit(MAX_FILAS),
          ]);
        for (const r of [matriculas, consentimientos, sesiones, respuestas, progreso, evaluaciones, boletines]) {
          if (r.error) throw r.error;
        }

        type Fila = Record<string, unknown>;
        const nombreDe = (rel: unknown, campo: string) =>
          (rel as Record<string, unknown> | null)?.[campo] ?? null;
        const legajo = {
          generado_at: new Date().toISOString(),
          perfil: {
            nombre: alumno.nombre, avatar: alumno.avatar, grado: alumno.grado,
            estado: alumno.estado, excluido_procesamiento: alumno.excluido_procesamiento,
          },
          matriculas: ((matriculas.data ?? []) as Fila[]).map((m) => ({
            escuela: nombreDe(m.escuela, 'nombre'), provincia: nombreDe(m.escuela, 'provincia'),
            grado: m.grado, fecha_inicio: m.fecha_inicio, fecha_fin: m.fecha_fin,
            estado: m.estado, motivo_cierre: m.motivo_cierre,
          })),
          consentimientos: ((consentimientos.data ?? []) as Fila[]).map((c) => ({
            escuela: nombreDe(c.escuela, 'nombre'), adulto_nombre: c.adulto_nombre,
            adulto_vinculo: c.adulto_vinculo, alcance: c.alcance, via: c.via,
            estado: c.estado, otorgado_at: c.otorgado_at, revocado_at: c.revocado_at,
          })),
          sesiones: ((sesiones.data ?? []) as Fila[]).map((s) => ({
            fecha: s.fecha, nodo: nombreDe(s.nodo, 'nombre'),
            aciertos: s.aciertos, total: s.total, duracion_seg: s.duracion_seg,
          })),
          respuestas: ((respuestas.data ?? []) as Fila[]).map((r) => ({
            dada: r.dada, correcta: r.correcta, tiempo_seg: r.tiempo_seg,
            reintentos: r.reintentos, created_at: r.created_at,
          })),
          progreso: ((progreso.data ?? []) as Fila[]).map((p) => ({
            nodo: nombreDe(p.nodo, 'nombre'), estado: p.estado,
            puntaje: p.puntaje, actualizado_at: p.actualizado_at,
          })),
          evaluaciones: ((evaluaciones.data ?? []) as Fila[]).map((e) => ({
            resumen: e.resumen, errores: e.errores, a_reforzar: e.a_reforzar, created_at: e.created_at,
          })),
          boletines: ((boletines.data ?? []) as Fila[]).map((b) => ({
            periodo: b.periodo, contenido: b.contenido, estado: b.estado,
            version: b.version, created_at: b.created_at,
          })),
        };

        const caso = await crearCasoEjecutado(alumno.id, 'acceso', {
          sesiones: legajo.sesiones.length, respuestas: legajo.respuestas.length,
          boletines: legajo.boletines.length,
        });
        registrarAuditoria(sb, ctx, {
          accion: 'arco_acceso_exportado', entidad: 'arco_caso', entidad_id: caso.id,
          detalle: { alumno_id: alumno.id },
        });
        return json({ caso_id: caso.id, legajo });
      }

      // ── RECTIFICACIÓN: solo identidad (nombre/avatar) ───────────────────
      // El resto del legajo es registro histórico de hechos, no rectificable.
      // nombre/avatar no los protege perfil_guard → update service_role directo.
      case 'rectificar': {
        const alumno = await alumnoDe(body.alumno_id);
        if (!alumno) return json({ error: 'alumno_inexistente' }, 404);
        const v = diffRectificacion({ nombre: alumno.nombre, avatar: alumno.avatar }, body.cambios);
        if (!v.ok) return json({ error: v.error }, 400);

        const patch: Record<string, string> = {};
        for (const [campo, d] of Object.entries(v.diff)) patch[campo] = d.despues;
        const { error } = await sb.from('perfil').update(patch).eq('id', alumno.id);
        if (error) throw error;

        const caso = await crearCasoEjecutado(alumno.id, 'rectificacion', v.diff);
        registrarAuditoria(sb, ctx, {
          accion: 'arco_rectificacion', entidad: 'arco_caso', entidad_id: caso.id,
          detalle: { alumno_id: alumno.id, campos: Object.keys(v.diff) },
        });
        return json({ caso_id: caso.id, diff: v.diff });
      }

      // ── OPOSICIÓN: exclusión del procesamiento no esencial ──────────────
      // La escritura pasa por la RPC arco_set_exclusion (única puerta: respeta
      // perfil_guard y AUDITA ella misma — por eso acá no se duplica el
      // registrarAuditoria de la exclusión, solo se deja el caso).
      case 'oponer': {
        const alumno = await alumnoDe(body.alumno_id);
        if (!alumno) return json({ error: 'alumno_inexistente' }, 404);
        if (typeof body.excluido !== 'boolean') return json({ error: 'excluido_invalido' }, 400);
        const { error } = await sb.rpc('arco_set_exclusion', {
          p_alumno: alumno.id, p_valor: body.excluido, p_actor: ctx.user.id,
        });
        if (error) throw error;
        const caso = await crearCasoEjecutado(alumno.id, 'oposicion', { excluido: body.excluido });
        return json({ caso_id: caso.id, excluido: body.excluido });
      }

      // ── CANCELACIÓN paso 1: solicitar (dry-run, NO borra nada) ──────────
      case 'cancelacion_solicitar': {
        const alumno = await alumnoDe(body.alumno_id);
        if (!alumno) return json({ error: 'alumno_inexistente' }, 404);
        const dryRun = planDeBorrado(await conteosDeBorrado(alumno.id));
        const detalle = {
          texto: noVacio(body.detalle_texto) ? String(body.detalle_texto).trim() : null,
          dry_run: dryRun,
        };
        const { data, error } = await sb
          .from('arco_caso')
          .insert({ alumno_id: alumno.id, tipo: 'cancelacion', estado: 'solicitado', solicitado_por: ctx.user.id, detalle })
          .select('id, estado, created_at')
          .single();
        if (error) throw error;
        const caso = data as { id: string };
        registrarAuditoria(sb, ctx, {
          accion: 'arco_cancelacion_solicitada', entidad: 'arco_caso', entidad_id: caso.id,
          detalle: { alumno_id: alumno.id },
        });
        return json({ caso, dry_run: dryRun });
      }

      // ── CANCELACIÓN paso 2: confirmar — EL ÚNICO BORRADO FÍSICO ─────────
      // Orden: (1) snapshot ANÓNIMO en arco_caso.agregado → (2) boletines (PII
      // en texto libre: acá ARCO le gana al archivo institucional de la
      // docente) → (3) luna_alerta_atendida (clave 'tipo:<alumno_id>', sin FK)
      // → (4) deleteUser: la cascada de perfil arrastra sesiones/respuestas/
      // progreso/matrículas/consentimientos/creds/transferencias → (5) caso
      // 'ejecutado' → (6) auditar. arco_caso y auditoria NO se tocan jamás.
      case 'cancelacion_confirmar': {
        // Solo el super-admin borra (verificarAdmin con nivel:'super' daría el
        // mismo veredicto; el nivel ya está en el ctx → se chequea sin otro
        // round-trip, con el MISMO error del guard).
        if (ctx.admin.nivel !== 'super') return json({ error: 'requiere_super' }, 403);

        const { caso_id } = body;
        if (!noVacio(caso_id)) return json({ error: 'falta_caso' }, 400);
        const { data: c } = await sb
          .from('arco_caso')
          .select('id, alumno_id, tipo, estado')
          .eq('id', caso_id)
          .maybeSingle();
        const caso = c as { id: string; alumno_id: string; tipo: string; estado: string } | null;
        if (!caso || caso.tipo !== 'cancelacion') return json({ error: 'caso_inexistente' }, 404);
        if (caso.estado === 'ejecutado') return json({ error: 'ya_ejecutada' }, 409);
        if (caso.estado !== 'solicitado' && caso.estado !== 'confirmado') {
          return json({ error: 'estado_invalido' }, 409);
        }
        const alumno = await alumnoDe(caso.alumno_id);
        // El perfil ya no existe: alguien ejecutó por otra vía (otro caso del
        // mismo alumno). El caso NO se marca ejecutado solo: 409 explícito.
        if (!alumno) return json({ error: 'ya_ejecutada' }, 409);

        // (1) Snapshot anónimo, recomputado AHORA (los conteos del dry-run
        // pueden haber envejecido). Provincia: la escuela de la ÚLTIMA
        // matrícula (activa o cerrada).
        const [{ data: ses }, respuestas, { count: dominados }, { data: ultimaMat }] = await Promise.all([
          sb.from('sesion').select('fecha').eq('alumno_id', alumno.id).limit(MAX_FILAS),
          contarViaSesion('respuesta', alumno.id),
          sb.from('alumno_nodo').select('*', { count: 'exact', head: true })
            .eq('alumno_id', alumno.id).eq('estado', 'dominado'),
          sb.from('matricula').select('escuela:escuela_id(provincia)')
            .eq('alumno_id', alumno.id).order('fecha_inicio', { ascending: false }).limit(1).maybeSingle(),
        ]);
        const provincia = ((ultimaMat as Record<string, unknown> | null)?.escuela as { provincia?: string | null } | null)?.provincia ?? null;
        const agregado = armarSnapshotAnonimo({
          fechasSesiones: ((ses ?? []) as { fecha: string | null }[]).map((s) => s.fecha),
          respuestas,
          nodosDominados: dominados ?? 0,
          grado: alumno.grado,
          provincia,
        });
        const { error: eSnap } = await sb.from('arco_caso')
          .update({ agregado, estado: 'confirmado' }).eq('id', caso.id);
        if (eSnap) throw eSnap;

        // (2) Boletines: la cascada de perfil también los borraría, pero van
        // explícitos ANTES del deleteUser — si el paso 4 falla a mitad, la PII
        // en texto libre ya no existe.
        const { error: eBol } = await sb.from('boletin').delete().eq('alumno_id', alumno.id);
        if (eBol) throw eBol;

        // (3) luna_alerta_atendida no tiene FK al alumno (la clave es texto
        // 'tipo:<alumno_id>'): sin esta pasada quedarían migas del uuid.
        const { error: eAlerta } = await sb.from('luna_alerta_atendida')
          .delete().like('clave', `%:${alumno.id}`);
        if (eAlerta) throw eAlerta;

        // (4) El borrado real: auth user → cascada de perfil arrastra todo el
        // legajo (sesion→respuesta/evaluacion, alumno_nodo, matricula,
        // consentimiento, transferencia, alumno_cred, intento_login).
        const { error: eUser } = await sb.auth.admin.deleteUser(alumno.id);
        if (eUser) throw eUser;

        // (5) + (6) El caso y la auditoría son lo ÚNICO que queda.
        const { error: eCaso } = await sb.from('arco_caso').update({
          estado: 'ejecutado', ejecutado_por: ctx.user.id, ejecutado_at: new Date().toISOString(),
        }).eq('id', caso.id);
        if (eCaso) throw eCaso;
        registrarAuditoria(sb, ctx, {
          accion: 'arco_cancelacion_ejecutada', entidad: 'arco_caso', entidad_id: caso.id,
          detalle: { agregado },
        });
        return json({ ok: true, caso_id: caso.id, agregado });
      }

      case 'cancelacion_rechazar': {
        const { caso_id } = body;
        if (!noVacio(caso_id)) return json({ error: 'falta_caso' }, 400);
        const { data: c } = await sb
          .from('arco_caso').select('id, tipo, estado').eq('id', caso_id).maybeSingle();
        const caso = c as { id: string; tipo: string; estado: string } | null;
        if (!caso || caso.tipo !== 'cancelacion') return json({ error: 'caso_inexistente' }, 404);
        if (caso.estado !== 'solicitado' && caso.estado !== 'confirmado') {
          return json({ error: 'estado_invalido' }, 409);
        }
        const { error } = await sb.from('arco_caso').update({ estado: 'rechazado' }).eq('id', caso.id);
        if (error) throw error;
        registrarAuditoria(sb, ctx, {
          accion: 'arco_cancelacion_rechazada', entidad: 'arco_caso', entidad_id: caso.id,
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
