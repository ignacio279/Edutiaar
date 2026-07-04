// generador-ejercicios (spec 2026-07-03): pool inicial estratificado al publicar y
// reposición automática cuando a un chico se le acaba lo no visto (DP5/DP6).
// Mock por defecto (sin gastar); modo real detrás del flag con la key SOLO server-side.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import {
  celdasIniciales, celdasParaLote, claveCelda, mockEjercicios,
  construirPromptEjercicios, parseEjercicios, LOTE_REPOSICION,
} from './generar.ts';
import type { Celda, EjercicioGen } from './generar.ts';

const MODELO = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;
const TOPE_EJERCICIOS_DIA = 240; // Regla 4: 20 lotes de 12 por día, global
// Espejo server-side de UMBRAL_REPOSICION (web/lib/practica.ts) — mantené en sync.
// Hace la reposición idempotente y cierra el vector de abuso: sin este gate, un
// alumno con pool lleno podría invocar la function a mano una y otra vez y quemar
// el tope diario global (Regla 4) sin necesitarlo de verdad.
const UMBRAL_REPOSICION_SERVER = 16;

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

    const sb = createClient(url, srKey);
    const { data: perfil } = await sb.from('perfil').select('rol, escuela_id').eq('id', user.id).single();
    if (!perfil) return json({ error: 'sin_perfil' }, 403);

    const { programa_id, nodo_id, mock } = await req.json();
    if (!programa_id && !nodo_id) return json({ error: 'datos_faltantes' }, 400);

    // Tope diario (Regla 4): contamos lo generado hoy (UTC) UNA vez acá, y cada
    // modo chequea POR LOTE antes de generar, para que ningún lote cruce el tope.
    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
    const { count: generadosHoy } = await sb.from('ejercicio').select('id', { count: 'exact', head: true }).gte('created_at', hoy.toISOString());

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    const usarMock = mock || !key;

    // Generación de un lote para un nodo (mock o Claude), validado.
    async function generarLote(nodo: { id: string; nombre: string; descripcion: string | null }, materia: string, grado: number, celdas: Array<Celda & { n: number }>, desde: number): Promise<EjercicioGen[]> {
      if (usarMock) return mockEjercicios(nodo.id, nodo.nombre, celdas, desde);
      const { system, user: userMsg } = construirPromptEjercicios(materia, grado, nodo.nombre, nodo.descripcion ?? '', 0, celdas);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: userMsg }] }),
      });
      if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
      const data = await r.json();
      const texto = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
      return parseEjercicios(JSON.parse(texto.slice(texto.indexOf('['), texto.lastIndexOf(']') + 1)), nodo.id);
    }

    // Datos del programa (materia + grado) — común a los dos modos.
    async function datosPrograma(progId: string) {
      const { data } = await sb.from('programa').select('grado, materia:materia_id(nombre)').eq('id', progId).single();
      return { grado: (data as { grado: number }).grado, materia: ((data as { materia?: { nombre?: string } }).materia?.nombre) ?? 'la materia' };
    }

    let generados = 0;

    if (programa_id) {
      // ── POOL INICIAL: solo la docente dueña del programa. ──────────────────
      const { data: sm } = await sb.from('sol_materia').select('docente_id').eq('programa_id', programa_id).maybeSingle();
      if (!sm || sm.docente_id !== user.id) return json({ error: 'solo_docente_duena' }, 403);
      const { materia, grado } = await datosPrograma(programa_id);
      const { data: nodos } = await sb.from('nodo').select('id, nombre, descripcion').eq('programa_id', programa_id).order('orden');
      const lotePorNodo = celdasIniciales().reduce((s, c) => s + c.n, 0); // 36: lote esperado por nodo
      for (const nodo of nodos ?? []) {
        const { count } = await sb.from('ejercicio').select('id', { count: 'exact', head: true }).eq('nodo_id', nodo.id);
        if ((count ?? 0) > 0) continue; // idempotente: no duplicar pools
        // Tope diario POR LOTE: si el próximo lote cruzaría el tope, cortamos acá.
        // El pool queda parcial y devolvemos igual { generados } con lo que entró;
        // reintentar mañana (o al liberar cupo) completa los nodos que faltaron.
        if ((generadosHoy ?? 0) + generados + lotePorNodo > TOPE_EJERCICIOS_DIA) break;
        const lote = await generarLote(nodo, materia, grado, celdasIniciales(), 0);
        const { error } = await sb.from('ejercicio').insert(lote);
        if (error) throw error;
        generados += lote.length;
      }
    } else {
      // ── REPOSICIÓN: docente dueña O alumno de la escuela (materia publicada). ─
      const { data: nodo } = await sb.from('nodo').select('id, nombre, descripcion, programa_id').eq('id', nodo_id).single();
      if (!nodo) return json({ error: 'nodo_inexistente' }, 404);
      const { data: sm } = await sb.from('sol_materia').select('docente_id, escuela_id, estado').eq('programa_id', nodo.programa_id).maybeSingle();
      const esDuena = sm?.docente_id === user.id;
      const esAlumnoDeLaEscuela = perfil.rol === 'alumno' && sm?.estado === 'publicado' && sm?.escuela_id === perfil.escuela_id;
      if (!esDuena && !esAlumnoDeLaEscuela) return json({ error: 'sin_permiso' }, 403);

      // Tope diario POR LOTE: un lote de reposición nunca cruza el tope (Regla 4).
      if ((generadosHoy ?? 0) + LOTE_REPOSICION > TOPE_EJERCICIOS_DIA) return json({ error: 'tope_diario' }, 429);

      const { materia, grado } = await datosPrograma(nodo.programa_id);
      // Sin-ver por celda PARA ESTE USUARIO: pool del nodo menos lo que ya respondió.
      const { data: pool } = await sb.from('ejercicio').select('id, tipo, dificultad').eq('nodo_id', nodo.id);
      const { data: vistosRaw } = await sb
        .from('respuesta')
        .select('ejercicio_id, sesion:sesion_id!inner(alumno_id, nodo_id)')
        .eq('sesion.nodo_id', nodo.id)
        .eq('sesion.alumno_id', user.id);
      const vistos = new Set((vistosRaw ?? []).map((v: { ejercicio_id: string }) => v.ejercicio_id));
      const sinVer = new Map<string, number>();
      for (const e of pool ?? []) {
        if (vistos.has(e.id)) continue;
        const k = claveCelda(e as Celda);
        sinVer.set(k, (sinVer.get(k) ?? 0) + 1);
      }

      // Gate de necesidad SOLO para el alumno (la docente dueña puede pedir un
      // top-up manual aunque el pool esté lleno): si todavía le queda margen de
      // sin-ver, no generamos nada — espejo de necesitaReposicion en el front.
      if (perfil.rol === 'alumno') {
        const totalSinVer = [...sinVer.values()].reduce((s, n) => s + n, 0);
        if (totalSinVer >= UMBRAL_REPOSICION_SERVER) return json({ generados: 0 });
      }

      const lote = await generarLote(nodo, materia, grado, celdasParaLote(sinVer, LOTE_REPOSICION), (pool ?? []).length);
      const { error } = await sb.from('ejercicio').insert(lote);
      if (error) throw error;
      generados = lote.length;
    }

    return json({ generados });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
