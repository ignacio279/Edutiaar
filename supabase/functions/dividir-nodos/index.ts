// dividir-nodos (Fase 2 / SP-2): la docente sube contenido → se crea un programa
// propio + sol_materia (perfil de especialista) + nodos (borrador) que luego revisa
// y publica. Modo mock por defecto (sin gastar); el modo real (Claude + PDF nativo)
// queda detrás del flag, con la API key SOLO server-side (Rule 1).
// verify_jwt=true: la seño está logueada; tomamos su identidad del JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { runToolLoop } from '../_shared/loop.ts';
import type { Bloque, LlamarClaude } from '../_shared/loop.ts';
import { construirPromptDivision, mockDividir, parseDivision, TOOL_GUARDAR_DIVISION } from './dividir.ts';

const MODELO = 'claude-sonnet-4-6'; // división corre raro; calidad/costo OK (Rule 4)
const MAX_TOKENS = 4096;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Identidad del docente desde su JWT (verify_jwt=true ya validó el token).
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'no_autenticado' }, 401);

    // service_role para escribir contenido (bypassa RLS; scopeado a este docente).
    const sb = createClient(url, srKey);
    const { data: perfil } = await sb.from('perfil').select('rol, escuela_id').eq('id', user.id).single();
    if (!perfil || perfil.rol !== 'docente') return json({ error: 'solo_docente' }, 403);
    if (!perfil.escuela_id) return json({ error: 'docente_sin_escuela' }, 400);

    // 2. Entrada
    const { materia_nombre, grado, contenido, pdf_base64, mock } = await req.json();
    if (!materia_nombre || !grado || (!contenido && !pdf_base64)) {
      return json({ error: 'datos_faltantes' }, 400);
    }

    // 3. find-or-create materia → crear el programa propio del docente.
    let materia = (await sb.from('materia').select('id').ilike('nombre', materia_nombre).maybeSingle()).data;
    if (!materia) {
      materia = (await sb.from('materia').insert({ nombre: materia_nombre }).select('id').single()).data;
    }
    const { data: programa, error: pErr } = await sb
      .from('programa')
      .insert({ materia_id: materia!.id, grado, contenido: contenido ?? null })
      .select('id')
      .single();
    if (pErr) throw pErr;

    // 4. Generar la división: mock (default / sin key) o real (Claude).
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    let division;
    if (mock || !key) {
      division = mockDividir(contenido ?? '', materia_nombre, grado);
    } else {
      const { system, user: userMsg } = construirPromptDivision(materia_nombre, grado, contenido ?? '');
      const callClaude: LlamarClaude = async ({ system, messages, tools }) => {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages, tools }),
        });
        if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
        return await r.json();
      };
      let capturado: unknown = null;
      const userMessage: string | Bloque[] = pdf_base64
        ? [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 } },
            { type: 'text', text: userMsg },
          ]
        : userMsg;
      await runToolLoop({
        callClaude,
        toolImpls: { guardar_division: (input) => { capturado = input; return 'ok'; } },
        tools: [TOOL_GUARDAR_DIVISION],
        system,
        userMessage,
        maxIters: 3,
      });
      division = parseDivision(capturado, materia_nombre, grado);
    }

    // 5. Guardar sol_materia (borrador) + los nodos.
    const { data: solMat, error: smErr } = await sb
      .from('sol_materia')
      .insert({
        programa_id: programa!.id,
        docente_id: user.id,
        escuela_id: perfil.escuela_id,
        perfil: division.perfil,
        estado: 'borrador',
      })
      .select('id')
      .single();
    if (smErr) throw smErr;

    const filas = division.nodos.map((n) => ({
      programa_id: programa!.id,
      nombre: n.nombre,
      orden: n.orden,
      descripcion: n.descripcion,
    }));
    const { data: nodos, error: nErr } = await sb
      .from('nodo')
      .insert(filas)
      .select('id, nombre, orden, descripcion')
      .order('orden');
    if (nErr) throw nErr;

    return json({ sol_materia_id: solMat!.id, programa_id: programa!.id, materia_id: materia!.id, nodos });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
