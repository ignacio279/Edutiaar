// luna-boletin (Fase 2 / LUNA): genera el BORRADOR del boletín mensual de un
// alumno con la evidencia real del período. LUNA propone, la docente decide:
// esto solo inserta/actualiza borradores; aprobar/editar/corregir es del
// cliente vía RLS. API key SOLO server-side (Regla 1). verify_jwt=true: la
// llama la seño logueada; acá re-verificamos rol y que el alumno sea SUYO
// (service_role saltea la RLS → el chequeo va a mano, Regla 5).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { runToolLoop } from '../_shared/loop.ts';
import type { LlamarClaude } from '../_shared/loop.ts';
import {
  construirPromptBoletin, parseBoletin, periodoActual, periodoDesdeClave, resumirActividad,
  TOOL_ESCRIBIR_BOLETIN,
  type EstadoBol, type MateriaBol, type NodoBol, type RespuestaBol, type SesionBol,
} from './boletin.ts';

const MODELO = 'claude-sonnet-4-6'; // texto largo para familias, se genera poco → calidad
const MAX_TOKENS = 1600;
const TOPE_BOLETINES_DIA = 20; // generaciones por docente por día (Regla 4)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'no_autenticado' }, 401);

    const { alumno_id, periodo: periodoClave } = await req.json();
    if (!alumno_id) return json({ error: 'falta_alumno_id' }, 400);
    const periodo = periodoClave ? periodoDesdeClave(String(periodoClave)) : periodoActual(new Date());
    if (!periodo) return json({ error: 'periodo_invalido' }, 400);

    const sb = createClient(url, srKey);
    const { data: yo } = await sb.from('perfil').select('rol').eq('id', user.id).single();
    if ((yo as { rol?: string } | null)?.rol !== 'docente') return json({ error: 'no_docente' }, 403);

    const { data: alumno } = await sb.from('perfil')
      .select('nombre, grado, docente_id, escuela_id').eq('id', alumno_id).single();
    if (!alumno) return json({ error: 'alumno_inexistente' }, 404);
    if (alumno.docente_id !== user.id) return json({ error: 'alumno_ajeno' }, 403);

    const { data: existente } = await sb.from('boletin')
      .select('id, estado, version').eq('alumno_id', alumno_id).eq('periodo', periodo.clave).maybeSingle();
    if (existente?.estado === 'aprobado') return json({ error: 'boletin_ya_aprobado' }, 409);

    // Tope diario (Regla 4). El día es UTC: alcanza para un tope suave.
    const dia = new Date().toISOString().slice(0, 10);
    const { data: uso } = await sb.from('luna_uso')
      .select('boletines').eq('docente_id', user.id).eq('dia', dia).maybeSingle();
    const usadas = (uso as { boletines?: number } | null)?.boletines ?? 0;
    if (usadas >= TOPE_BOLETINES_DIA) return json({ error: 'tope_diario_boletin' }, 429);

    // La key se chequea ANTES de escribir nada (un error de config no deja filas a medias).
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'falta_anthropic_api_key' }, 500);

    // Evidencia del período (queries con service_role, ya verificada la pertenencia).
    const { data: sesData } = await sb.from('sesion')
      .select('id, nodo_id, fecha, aciertos, total')
      .eq('alumno_id', alumno_id).gte('fecha', periodo.desde).lt('fecha', periodo.hasta);
    const sesiones = ((sesData as (SesionBol & { id: string })[]) || []);
    if (!sesiones.length) return json({ error: 'sin_actividad' }, 409);

    const sesIds = sesiones.map((s) => s.id);
    const nodoDeSesion = new Map(sesiones.map((s) => [s.id, s.nodo_id]));
    const { data: respData } = await sb.from('respuesta')
      .select('sesion_id, correcta, created_at, ejercicio:ejercicio_id(tipo)')
      .in('sesion_id', sesIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const respuestas: RespuestaBol[] = ((respData as any[]) || []).map((r) => ({
      nodoId: nodoDeSesion.get(r.sesion_id) ?? '',
      tipo: r.ejercicio?.tipo ?? 'reconocer',
      correcta: !!r.correcta,
      createdAt: r.created_at,
    }));

    // Materias del alumno: publicadas de su escuela cuyo programa es de su grado.
    const { data: solsData } = await sb.from('sol_materia')
      .select('programa_id, programa:programa_id(grado, materia:materia_id(nombre))')
      .eq('estado', 'publicado').eq('escuela_id', alumno.escuela_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const materias: MateriaBol[] = ((solsData as any[]) || [])
      .filter((s) => s.programa?.grado === alumno.grado)
      .map((s) => ({ nombre: s.programa?.materia?.nombre ?? 'Materia', programa_id: s.programa_id }));

    const progIds = materias.map((m) => m.programa_id);
    const { data: nodosData } = progIds.length
      ? await sb.from('nodo').select('id, nombre, programa_id').in('programa_id', progIds)
      : { data: [] };
    const nodos = ((nodosData as NodoBol[]) || []);

    const { data: estData } = await sb.from('alumno_nodo')
      .select('nodo_id, estado').eq('alumno_id', alumno_id);
    const estados = ((estData as EstadoBol[]) || []);

    const datos = resumirActividad(
      String(alumno.nombre ?? '').split(' ')[0], // solo nombre de pila (datos mínimos)
      alumno.grado ?? 0, periodo, sesiones, respuestas, nodos, materias, estados,
    );
    const { system, user: userMsg } = construirPromptBoletin(datos);

    const callClaude: LlamarClaude = async ({ system, messages, tools }) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages, tools }),
      });
      if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
      return await r.json();
    };
    let cap: unknown = null;
    await runToolLoop({
      callClaude,
      toolImpls: { escribir_boletin: (input) => { cap = input; return 'ok'; } },
      tools: [TOOL_ESCRIBIR_BOLETIN],
      system,
      userMessage: userMsg,
      maxIters: 2,
    });
    if (cap === null) return json({ error: 'generacion_fallida' }, 502);
    const contenido = parseBoletin(cap);

    // Borrador nuevo o regeneración del existente (version sube; unique alumno+período).
    const { data: row, error } = existente
      ? await sb.from('boletin')
          .update({ contenido, version: (existente.version ?? 1) + 1, updated_at: new Date().toISOString() })
          .eq('id', existente.id)
          .select('id, alumno_id, periodo, contenido, estado, version').single()
      : await sb.from('boletin')
          .insert({ alumno_id, docente_id: user.id, periodo: periodo.clave, contenido })
          .select('id, alumno_id, periodo, contenido, estado, version').single();
    if (error) throw error;

    await sb.from('luna_uso').upsert(
      { docente_id: user.id, dia, boletines: usadas + 1 },
      { onConflict: 'docente_id,dia' },
    );

    return json({ boletin: row });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
