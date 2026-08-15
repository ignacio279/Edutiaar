// admin-jobs (fase Observatorio y avisos): jobs de mantenimiento del panel.
// Lo llaman DOS calladores distintos, y el guard es dual:
//   1. El CRON (pg_cron → llamar_admin_jobs, migración 0021): Authorization
//      Bearer con el SERVICE_ROLE key → ctx = null (sin admin humano).
//   2. Un ADMIN desde el panel ("Recalcular ahora"): sesión normal →
//      verificarAdmin como cualquier fn admin-*.
// Misma ruta de código para ambos → cero divergencia entre el job nocturno y
// el botón manual.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin, type AdminCtx } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { registrarUso } from '../_shared/uso.ts';
import { runToolLoop, type LlamarClaude } from '../_shared/loop.ts';
import { costosPorMes, evaluarAlertas, type AlertaAdmin, type EscuelaAlerta } from '../_shared/alertas-logica.ts';
import { planSnapshotAlertas } from './nocturno-logica.ts';
// Task 6 (backfill NAP): reusa TAL CUAL la tool y la validación de la
// publicación (dividir-nodos/dividir.ts) — ver nap-backfill-logica.ts para el
// porqué de no escribir un prompt ni una validación paralelos.
import { TOOL_GUARDAR_DIVISION, type TemaCatalogo } from '../dividir-nodos/dividir.ts';
import {
  agruparPorPrograma, construirPromptBackfill, emparejarResultado, esMateriaDeTest, sinExcluidos,
} from './nap-backfill-logica.ts';

// Actor sentinel del cron en la auditoría (no hay admin humano detrás).
const CRON_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

// Mismo modelo que dividir-nodos (Regla 4: costo/calidad OK para clasificar).
const MODELO_NAP = 'claude-sonnet-4-6';
// Un puñado de nodos por programa (no un programa entero de cero): alcanza de sobra.
const MAX_TOKENS_NAP = 4096;

// Vence los pases de transferencia que nadie confirmó a tiempo (0023: el
// plazo sale de plataforma_config.transferencia_dias_expiracion al crearlos).
// Devuelve cuántos venció. Idempotente: el .eq('estado','pendiente') hace que
// dos corridas seguidas no toquen nada la segunda vez.
async function expirarTransferencias(
  sb: ReturnType<typeof createClient>,
  ahora: Date,
): Promise<number> {
  const { data, error } = await sb
    .from('transferencia')
    .update({ estado: 'expirada', resuelta_at: ahora.toISOString() })
    .eq('estado', 'pendiente')
    .lt('expira_at', ahora.toISOString())
    .select('id');
  if (error) throw error;
  return (data as unknown[] | null)?.length ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Guard dual: el cron manda el service key tal cual; un humano, su JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    let ctx: AdminCtx | null = null;
    if (authHeader !== `Bearer ${srKey}`) {
      const r = await verificarAdmin(req);
      if (r instanceof Response) return r;
      ctx = r;
    }
    const sb = ctx?.sb ?? createClient(url, srKey);

    const body = await req.json();
    const { accion } = body;
    switch (accion) {
      // Corrida nocturna (o "Recalcular ahora"): junta los MISMOS insumos que
      // juntaba admin-crm alertas_listar cuando calculaba on-demand, corre la
      // lógica pura y deja admin_alerta igual al resultado (upsert + borrado
      // de claves resueltas).
      case 'nocturno': {
        const now = new Date();
        const { data: escData, error: escErr } = await sb
          .from('escuela')
          .select('id, nombre, estado, trial_fin, limites')
          .neq('estado', 'archivado');
        if (escErr) throw escErr;
        const escuelas = (escData ?? []) as EscuelaAlerta[];

        // Licencia efectiva por colegio (0026): la directa manda; si no hay,
        // la del pool asignado. Colegio sin ninguna → el detector cae al
        // trial legacy. Orden por fecha_inicio asc: la más nueva pisa al final.
        const licPorEscuela: Record<string, { id: string; estado: string; fecha_fin: string | null }> = {};
        const { data: asigData } = await sb
          .from('licencia_asignacion')
          .select('escuela_id, licencia:licencia_id(id, estado, fecha_fin, fecha_inicio)')
          .order('escuela_id');
        for (const a of (asigData ?? []) as { escuela_id: string; licencia: { id: string; estado: string; fecha_fin: string | null } | null }[]) {
          if (a.licencia) licPorEscuela[a.escuela_id] = a.licencia;
        }
        const { data: licData } = await sb
          .from('licencia')
          .select('id, escuela_id, estado, fecha_fin')
          .not('escuela_id', 'is', null)
          .order('fecha_inicio', { ascending: true });
        for (const l of (licData ?? []) as { id: string; escuela_id: string; estado: string; fecha_fin: string | null }[]) {
          licPorEscuela[l.escuela_id] = { id: l.id, estado: l.estado, fecha_fin: l.fecha_fin };
        }
        for (const e of escuelas) e.licencia = licPorEscuela[e.id] ?? null;

        // Última sesión por escuela: max(fecha) de sesion → perfil del alumno.
        // Iterar escuelas está bien para el volumen del MVP (pocas decenas).
        const ultimaSesionPorEscuela: Record<string, string | null> = {};
        for (const e of escuelas) {
          const { data: s } = await sb
            .from('sesion')
            .select('fecha, alumno:alumno_id!inner(escuela_id)')
            .eq('alumno.escuela_id', e.id)
            .order('fecha', { ascending: false })
            .limit(1);
          ultimaSesionPorEscuela[e.id] = (s?.[0] as { fecha?: string } | undefined)?.fecha ?? null;
        }

        // Costos del mes actual y el anterior desde uso_api (vacía → todo 0).
        const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const { data: usos } = await sb
          .from('uso_api')
          .select('escuela_id, costo_usd, created_at')
          .gte('created_at', inicioMesAnterior);
        const { mesActual, mesAnterior } = costosPorMes(
          (usos ?? []) as { escuela_id: string | null; costo_usd: number; created_at: string }[],
          now,
        );

        const { data: at } = await sb.from('admin_alerta_atendida').select('clave');
        const atendidas = ((at ?? []) as { clave: string }[]).map((a) => a.clave);

        const nuevas = evaluarAlertas({
          escuelas,
          ultimaSesionPorEscuela,
          costoMesPorEscuela: mesActual,
          costoMesAnteriorPorEscuela: mesAnterior,
          atendidas,
        }, now);

        // Plan contra el snapshot actual: upsert idempotente por clave +
        // borrado de las claves cuyo hecho ya se resolvió.
        const { data: exData, error: exErr } = await sb.from('admin_alerta').select('clave');
        if (exErr) throw exErr;
        const { upsert, borrar } = planSnapshotAlertas(nuevas, (exData ?? []) as { clave: string }[]);

        if (upsert.length > 0) {
          const corridaAt = now.toISOString();
          const { error: upErr } = await sb
            .from('admin_alerta')
            .upsert(upsert.map((a: AlertaAdmin) => ({
              clave: a.clave,
              tipo: a.tipo,
              prioridad: a.prioridad,
              escuela_id: a.escuelaId,
              escuela_nombre: a.escuelaNombre,
              titulo: a.titulo,
              detalle: a.detalle,
              generada_at: corridaAt,
            })), { onConflict: 'clave' });
          if (upErr) throw upErr;
        }
        if (borrar.length > 0) {
          const { error: delErr } = await sb.from('admin_alerta').delete().in('clave', borrar);
          if (delErr) throw delErr;
        }

        // Auditoría: manual = recalcular_alertas con el admin; cron =
        // job_nocturno con el actor sentinel (fire-and-forget con catch).
        const detalle = { generadas: upsert.length, borradas: borrar.length };
        if (ctx) {
          registrarAuditoria(sb, ctx, { accion: 'recalcular_alertas', detalle });
        } else {
          sb.from('auditoria')
            .insert({
              actor_id: CRON_ACTOR_ID,
              actor_email: 'cron@edutia',
              nivel: null,
              accion: 'job_nocturno',
              detalle,
            })
            .then(({ error }) => {
              if (error) console.error('auditoria_fallo', 'job_nocturno', error.message);
            });
        }

        // Alumno golondrina (ADR-011): la corrida nocturna también vence los
        // pases que nadie confirmó. Va al final y no rompe la corrida si
        // falla — las alertas ya quedaron guardadas arriba.
        let expiradas = 0;
        try {
          expiradas = await expirarTransferencias(sb, now);
        } catch (e) {
          console.error('expirar_transferencias_fallo', String((e as Error)?.message ?? e));
        }

        return json({
          ok: true, generadas: upsert.length, borradas: borrar.length,
          transferencias_expiradas: expiradas, corrida_at: now.toISOString(),
        });
      }

      // Vencer los pases pendientes cuyo plazo pasó (el link deja de servir:
      // transferencia-confirmar corta por estado). Se puede correr sola desde
      // el panel además de venir en la corrida nocturna.
      case 'expirar_transferencias': {
        const expiradas = await expirarTransferencias(sb, new Date());
        return json({ ok: true, transferencias_expiradas: expiradas });
      }

      // accion 'luna_nocturno': job de alertas de LUNA (pendiente del ROADMAP) — se cuelga acá.

      // Backfill del mapeo NAP (Task 6): clasifica contra el marco curricular
      // los nodos que quedaron publicados ANTES de que dividir-nodos empezara
      // a proponer el tema al publicar (Task 5). Corre acá — no como script
      // local — porque la API key de Claude vive SOLO del lado del servidor
      // (Regla 1): sacarla de Supabase para correr un script la habría puesto
      // en una máquina donde no tiene por qué estar.
      //
      // PROCESA UN SOLO PROGRAMA POR LLAMADA (default `limite=1`, tope 5): el
      // generador-ejercicios ya chocó con 504 IDLE_TIMEOUT (150s) y 546
      // WORKER_RESOURCE_LIMIT tratando de hacer trabajo multi-nodo en una sola
      // invocación (ver CLAUDE.md) — acá el riesgo es el mismo con 7
      // programas en una sola llamada a Sonnet cada uno. El caller (humano o
      // script) itera con `offset` creciente hasta que `programas_restantes`
      // llegue a 0. `dry_run: true` hace TODO lo mismo (incluida la llamada
      // real a Claude, para poder mostrar la propuesta) pero no escribe nada
      // — por eso también respeta `offset`, ya que nada se "consume" solo.
      case 'nap_backfill': {
        const dryRun = Boolean(body.dry_run);
        const limite = Math.max(1, Math.min(5, Number(body.limite ?? 1) || 1));
        const offset = Math.max(0, Number(body.offset ?? 0) || 0);
        // Programas que el CALLER ya intentó en llamadas anteriores de esta
        // misma corrida (haya mapeado o no). Necesario porque `offset` solo
        // es seguro cuando la lista de pendientes es estable: en dry-run
        // nunca se escribe, así que la lista no cambia entre llamadas. En la
        // corrida real, un nodo que Claude clasifica como null se queda
        // pendiente PARA SIEMPRE (nap_tema_id sigue null, y nap_revisado
        // tiene que seguir en false — ver el caso `sin_catalogo`/el bloque de
        // escritura más abajo), así que ni desaparece de la lista ni el
        // `offset` avanza de forma predecible. El caller real (el script de
        // esta corrida) manda acá los ids que ya procesó y los saca del
        // cálculo, así garantiza cobertura completa sin loop infinito.
        const excluirProgramas: string[] = Array.isArray(body.excluir_programas)
          ? body.excluir_programas.map(String) : [];
        const key = Deno.env.get('ANTHROPIC_API_KEY');
        if (!key) return json({ error: 'falta_anthropic_api_key' }, 500);

        // Único filtro de selección (Regla de idempotencia): correrlo de
        // nuevo no reclasifica lo ya hecho.
        const { data: nodosRaw, error: nErr } = await sb
          .from('nodo')
          .select('id, nombre, descripcion, orden, programa_id, programa:programa_id(grado, materia:materia_id(nombre))')
          .is('nap_tema_id', null)
          .eq('nap_revisado', false)
          .order('orden', { ascending: true });
        if (nErr) throw nErr;

        type NodoFila = {
          id: string; nombre: string; descripcion: string | null; orden: number; programa_id: string;
          programa: { grado: number; materia: { nombre: string } };
        };
        const todos = (nodosRaw ?? []) as unknown as NodoFila[];
        const reales = todos.filter((n) => !esMateriaDeTest(n.programa?.materia?.nombre));
        const excluidosTest = todos.length - reales.length;

        const programasPendientes = agruparPorPrograma(reales); // orden estable por programa_id
        const programas = sinExcluidos(programasPendientes, excluirProgramas);
        const programasTotales = programas.length;
        const nodosTotales = reales.length;
        const aProcesar = programas.slice(offset, offset + limite);

        const catalogoPorGrado = new Map<number, TemaCatalogo[]>();
        async function catalogoDeGrado(grado: number): Promise<TemaCatalogo[]> {
          const cacheado = catalogoPorGrado.get(grado);
          if (cacheado) return cacheado;
          // Sin filtrar por materia (Regla 4 del brief de Task 6): las
          // CUATRO materias del grado, igual que dividir-nodos al publicar.
          const { data: filasNap, error: napErr } = await sb
            .from('nap_tema')
            .select('id, nombre, texto_oficial, nap_eje(materia, nombre)')
            .eq('grado', grado);
          if (napErr) throw napErr;
          const temas: TemaCatalogo[] = (filasNap ?? []).map((t: Record<string, unknown>) => {
            const eje = (t.nap_eje ?? {}) as Record<string, unknown>;
            return {
              id: String(t.id),
              nombre: String(t.nombre ?? ''),
              texto_oficial: (t.texto_oficial as string | null) ?? null,
              materia: String(eje.materia ?? ''),
              eje: String(eje.nombre ?? ''),
            };
          });
          catalogoPorGrado.set(grado, temas);
          return temas;
        }

        const procesados: unknown[] = [];
        const updates: { id: string; nap_tema_id: string | null; nap_confianza: number | null }[] = [];
        let totalMapeados = 0;
        let totalSinTema = 0;

        for (const [programaId, nodosDePrograma] of aProcesar) {
          const grado = nodosDePrograma[0].programa.grado;
          const materiaLabel = nodosDePrograma[0].programa.materia.nombre;
          const temas = await catalogoDeGrado(grado);

          if (temas.length === 0) {
            const resultados = nodosDePrograma.map((n) => ({
              nodo_id: n.id, nombre: n.nombre, nap_tema_id: null, nap_confianza: null,
            }));
            procesados.push({
              programa_id: programaId, materia: materiaLabel, grado,
              nodos: resultados, mapeados: 0, sin_tema: resultados.length,
              motivo: 'sin_catalogo_para_este_grado',
            });
            totalSinTema += resultados.length;
            if (!dryRun) for (const r of resultados) updates.push({ id: r.nodo_id, nap_tema_id: null, nap_confianza: null });
            continue;
          }

          // escuela_id/docente_id del programa (vía sol_materia) para que el
          // gasto de uso_api quede atribuido a un colegio en la pantalla de Costos.
          const { data: smData } = await sb
            .from('sol_materia').select('escuela_id, docente_id').eq('programa_id', programaId).limit(1).maybeSingle();
          const escuelaId = (smData as { escuela_id?: string } | null)?.escuela_id ?? null;
          // OJO: NO usar ctx.user.id acá. El admin de plataforma no tiene fila
          // en `perfil` (ADR-009) y uso_api.perfil_id tiene FK a perfil(id) —
          // meter el id del admin rompe el insert con foreign key violation
          // (silencioso antes de awaitear registrarUso, ver commit). El único
          // perfil_id válido acá es el docente dueño del programa; si no se
          // pudo resolver sol_materia, se deja null (la columna lo permite).
          const perfilId = (smData as { docente_id?: string } | null)?.docente_id ?? null;

          const nodosInput = nodosDePrograma.map((n) => ({ id: n.id, nombre: n.nombre, descripcion: n.descripcion }));
          const { system, user: userMsg } = construirPromptBackfill(materiaLabel, grado, nodosInput, temas);

          let capturado: unknown = null;
          let ultimoStopReason: string | null = null;
          const callClaude: LlamarClaude = async (req2) => {
            const t0 = Date.now();
            const r = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
              body: JSON.stringify({ model: MODELO_NAP, max_tokens: MAX_TOKENS_NAP, system: req2.system, messages: req2.messages, tools: req2.tools }),
            });
            if (!r.ok) {
              // Awaiteada (a diferencia de las otras 7 funciones): esto es un
              // job de fondo, no una respuesta interactiva — sin awaitear, el
              // insert fire-and-forget se corta cuando el handler responde y
              // el gasto queda invisible en Costos (ver _shared/uso.ts).
              await registrarUso(sb, {
                escuela_id: escuelaId, perfil_id: perfilId, funcion: 'admin-jobs:nap_backfill',
                modelo: MODELO_NAP, latencia_ms: Date.now() - t0, ok: false, error_codigo: `claude_${r.status}`,
              });
              throw new Error(`claude_${r.status}: ${await r.text()}`);
            }
            const data = await r.json();
            ultimoStopReason = data.stop_reason ?? null;
            await registrarUso(sb, {
              escuela_id: escuelaId, perfil_id: perfilId, funcion: 'admin-jobs:nap_backfill',
              modelo: MODELO_NAP, usage: data.usage, latencia_ms: Date.now() - t0, ok: true,
            });
            return data;
          };

          try {
            await runToolLoop({
              callClaude,
              toolImpls: { guardar_division: (input) => { capturado = input; return 'ok'; } },
              tools: [TOOL_GUARDAR_DIVISION],
              system,
              userMessage: userMsg,
              maxIters: 3,
            });
            if (capturado === null) {
              throw new Error(ultimoStopReason === 'max_tokens' ? 'division_truncada: se cortó por tokens' : 'Claude no llamó a la tool guardar_division');
            }
            const { resultados, avisos } = emparejarResultado(nodosInput, capturado, materiaLabel, grado, temas);
            const mapeados = resultados.filter((r) => r.nap_tema_id).length;
            const sinTema = resultados.length - mapeados;
            totalMapeados += mapeados;
            totalSinTema += sinTema;
            procesados.push({
              programa_id: programaId, materia: materiaLabel, grado,
              nodos: resultados, mapeados, sin_tema: sinTema,
              ...(avisos.length ? { avisos } : {}),
            });
            if (!dryRun) for (const r of resultados) updates.push({ id: r.nodo_id, nap_tema_id: r.nap_tema_id, nap_confianza: r.nap_confianza });
          } catch (e) {
            procesados.push({
              programa_id: programaId, materia: materiaLabel, grado,
              error: String((e as Error)?.message ?? e),
            });
          }
        }

        // Escribir: SOLO UPDATE de nap_tema_id/nap_confianza sobre nodo, uno
        // por uno. Nunca INSERT ni DELETE — ni acá ni en ninguna otra tabla.
        if (!dryRun) {
          for (const u of updates) {
            const { error: upErr } = await sb.from('nodo').update({ nap_tema_id: u.nap_tema_id, nap_confianza: u.nap_confianza }).eq('id', u.id);
            if (upErr) throw upErr;
          }
          if (ctx && updates.length > 0) {
            // Awaiteada por el mismo motivo que registrarUso más arriba: nada
            // queda pendiente después de esto, así que sin awaitear se corre
            // el riesgo de que el insert se corte al responder.
            await registrarAuditoria(sb, ctx, {
              accion: 'nap_backfill',
              detalle: { programas: aProcesar.length, mapeados: totalMapeados, sin_tema: totalSinTema },
            });
          }
        }

        return json({
          ok: true,
          dry_run: dryRun,
          excluidos_test: excluidosTest,
          programas_totales: programasTotales,
          nodos_totales: nodosTotales,
          offset,
          limite,
          programas_en_esta_llamada: aProcesar.length,
          programas_restantes: Math.max(0, programasTotales - offset - aProcesar.length),
          // Para que el caller acumule `excluir_programas` en la próxima
          // llamada sin tener que hurgar en `procesados` (ver el comentario
          // de excluirProgramas más arriba).
          programa_ids_procesados: aProcesar.map(([id]) => id),
          procesados,
          resumen: { mapeados: totalMapeados, sin_tema: totalSinTema },
        });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
