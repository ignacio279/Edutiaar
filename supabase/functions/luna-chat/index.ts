// luna-chat (Fase 2 / LUNA): chat 24/7 de la docente con LUNA, con el contexto
// real de SU aula en el system prompt. El hilo se persiste en luna_mensaje
// (continuidad entre sesiones); el par pregunta/respuesta se guarda JUNTO y
// solo si Claude respondió (si falla, no queda nada a medias → reintento
// seguro). API key SOLO server-side (Regla 1). verify_jwt=true + re-chequeo de
// rol docente; el contexto se arma con service_role pero scoped a mano a los
// alumnos de la que llama (Regla 5).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import {
  aMensajesClaude, aParrafos, construirSystemLuna, haceCuanto, momentoDelAnio,
  recortarHistorial, sanearAlertas, sanearAulaId, type AlumnoCtx, type LunaMsg,
} from './chat.ts';

const MODELO = 'claude-sonnet-4-6'; // pocas docentes + tope diario → calidad pedagógica
const MAX_TOKENS = 900;
const MAX_MENSAJE = 2000;
const TOPE_CHATS_DIA = 50; // mensajes por docente por día (Regla 4)

const ESTADO_TXT: Record<string, string> = {
  no_empezado: 'sin empezar',
  en_construccion: 'en camino',
  a_reforzar: 'a reforzar',
  dominado: 'va muy bien',
};
const PEOR_PRIMERO = ['a_reforzar', 'en_construccion', 'no_empezado', 'dominado'];

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

    const body = await req.json();
    const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : '';
    if (!mensaje) return json({ error: 'falta_mensaje' }, 400);
    if (mensaje.length > MAX_MENSAJE) return json({ error: 'mensaje_largo' }, 400);
    const alertas = sanearAlertas(body?.alertas);
    const aulaId = sanearAulaId(body?.aula_id);

    const sb = createClient(url, srKey);
    const { data: yo } = await sb.from('perfil').select('rol, nombre, escuela_id').eq('id', user.id).single();
    if ((yo as { rol?: string } | null)?.rol !== 'docente') return json({ error: 'no_docente' }, 403);

    // Tope diario (Regla 4), contado en luna_uso (inmune a "Limpiar conversación").
    const dia = new Date().toISOString().slice(0, 10);
    const { data: uso } = await sb.from('luna_uso')
      .select('chats').eq('docente_id', user.id).eq('dia', dia).maybeSingle();
    const usados = (uso as { chats?: number } | null)?.chats ?? 0;
    if (usados >= TOPE_CHATS_DIA) return json({ error: 'tope_diario_chat' }, 429);

    // La key se chequea ANTES de escribir nada.
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'falta_anthropic_api_key' }, 500);

    // --- Contexto real del aula (scoped a los alumnos de ESTA docente) ---
    // LUNA por aula: si el front manda aula_id, el contexto se acota a los
    // alumnos de esa aula. El .eq('docente_id') se mantiene SIEMPRE: un aula
    // ajena da 0 alumnos, nunca datos de otra docente (Regla 5).
    const now = new Date();
    let alumnosQ = sb.from('perfil')
      .select('id, nombre, grado').eq('rol', 'alumno').eq('docente_id', user.id);
    if (aulaId) alumnosQ = alumnosQ.eq('aula_id', aulaId);
    const { data: als } = await alumnosQ.order('nombre');
    const alumnosRows = ((als as { id: string; nombre: string; grado: number | null }[]) || []);
    const ids = alumnosRows.map((a) => a.id);

    const desde60 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60).toISOString();
    const desde14 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14).toISOString();
    const [sesR, respR, estR, solsR] = await Promise.all([
      ids.length
        ? sb.from('sesion').select('id, alumno_id, fecha').in('alumno_id', ids).gte('fecha', desde60)
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb.from('respuesta').select('correcta, created_at, sesion:sesion_id!inner(alumno_id)')
            .in('sesion.alumno_id', ids).gte('created_at', desde14)
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb.from('alumno_nodo').select('alumno_id, estado').in('alumno_id', ids)
        : Promise.resolve({ data: [] }),
      sb.from('sol_materia')
        .select('programa_id, programa:programa_id(grado, materia:materia_id(nombre))')
        .eq('estado', 'publicado').eq('escuela_id', (yo as { escuela_id?: string }).escuela_id ?? ''),
    ]);

    const ultimaDe = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of ((sesR.data as any[]) || [])) {
      const previa = ultimaDe.get(s.alumno_id);
      if (!previa || s.fecha > previa) ultimaDe.set(s.alumno_id, s.fecha);
    }
    const precDe = new Map<string, { ok: number; total: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((respR.data as any[]) || [])) {
      const aid = r.sesion?.alumno_id;
      if (!aid || !ids.includes(aid)) continue; // respuestas de otros no entran al contexto
      const g = precDe.get(aid) ?? { ok: 0, total: 0 };
      g.total += 1;
      if (r.correcta) g.ok += 1;
      precDe.set(aid, g);
    }
    const estadosDe = new Map<string, string[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of ((estR.data as any[]) || [])) {
      const g = estadosDe.get(e.alumno_id) ?? [];
      g.push(e.estado);
      estadosDe.set(e.alumno_id, g);
    }

    const alumnos: AlumnoCtx[] = alumnosRows.map((a) => {
      const presentes = new Set(estadosDe.get(a.id) ?? []);
      const peor = PEOR_PRIMERO.find((e) => presentes.has(e)) ?? 'no_empezado';
      const ultima = ultimaDe.get(a.id) ?? null;
      const p = precDe.get(a.id);
      return {
        nombre: String(a.nombre ?? '').split(' ')[0], // solo nombre de pila (datos mínimos)
        grado: a.grado ?? 0,
        estado: ESTADO_TXT[peor] ?? peor,
        ultimaPractica: ultima ? haceCuanto(ultima, now) : null,
        precisionReciente: p && p.total ? Math.round((100 * p.ok) / p.total) : null,
      };
    });

    // Programa por materia (con el grado en el nombre: aula plurigrado).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sols = ((solsR.data as any[]) || []);
    const progIds = sols.map((s) => s.programa_id);
    const { data: nodosR } = progIds.length
      ? await sb.from('nodo').select('nombre, programa_id').in('programa_id', progIds).order('orden')
      : { data: [] };
    const programa = sols.map((s) => ({
      materia: `${s.programa?.materia?.nombre ?? 'Materia'} (${s.programa?.grado ?? '?'}°)`,
      nodos: ((nodosR as { nombre: string; programa_id: string }[]) || [])
        .filter((n) => n.programa_id === s.programa_id).map((n) => n.nombre),
    })).filter((p) => p.nodos.length);

    const system = construirSystemLuna({
      docenteNombre: String((yo as { nombre?: string }).nombre ?? ''),
      grados: [...new Set(alumnosRows.map((a) => a.grado ?? 0).filter(Boolean))].sort(),
      alumnos, alertas, programa,
      momento: momentoDelAnio(now),
    });

    // --- Historial persistido + mensaje nuevo → Claude (sin tools, sin streaming) ---
    const { data: histR } = await sb.from('luna_mensaje')
      .select('role, content').eq('docente_id', user.id)
      .order('created_at', { ascending: false }).limit(12);
    const historial = (((histR as LunaMsg[]) || [])).reverse();

    const messages = [
      ...aMensajesClaude(recortarHistorial(historial)),
      { role: 'user' as const, content: mensaje },
    ];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages }),
    });
    if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
    const data = await r.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const texto = ((data.content ?? []) as any[])
      .filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const parrafos = aParrafos(texto);
    if (!parrafos.length) return json({ error: 'respuesta_vacia' }, 502);

    // Persistimos el par junto, recién ahora que hay respuesta.
    const { error: insErr } = await sb.from('luna_mensaje').insert([
      { docente_id: user.id, role: 'user', content: mensaje },
      { docente_id: user.id, role: 'luna', content: parrafos.join('\n\n') },
    ]);
    if (insErr) throw insErr;
    await sb.from('luna_uso').upsert(
      { docente_id: user.id, dia, chats: usados + 1 },
      { onConflict: 'docente_id,dia' },
    );

    return json({ texto: parrafos.join('\n\n'), parrafos });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
