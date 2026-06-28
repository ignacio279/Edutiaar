// gestion-alumnos (Fase 2): la docente gestiona sus AULAS y ALUMNOS ("Mi clase").
// Toda escritura pasa por acá (service role) porque la RLS no deja a la docente insertar
// perfiles ni crear auth users (Rule 1, Rule 5). Cada acción RE-VERIFICA propiedad: el
// front no es fuente de verdad. verify_jwt=true; el caller tiene que ser rol 'docente'.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { codigoNormalizado, pinValido, avatarValido, validarCrearAula, validarCrearAlumno } from './validar.ts';

const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, '0')).join('');
const randPass = () => randHex(24); // 48 chars opacos, nunca expuestos
const noVacio = (s: unknown) => typeof s === 'string' && s.trim().length > 0;
const gradoOk = (g: unknown) => typeof g === 'number' && Number.isInteger(g) && g >= 1 && g <= 7;

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
    const caller = perfil as { rol?: string; escuela_id?: string } | null;
    if (caller?.rol !== 'docente') return json({ error: 'no_docente' }, 403);

    const body = await req.json();
    const { accion } = body;

    // Helpers de propiedad (service role → bypass RLS, así que chequeamos a mano).
    const aulaMia = async (aulaId: string) => {
      if (!noVacio(aulaId)) return false;
      const { data } = await sb.from('aula').select('docente_id').eq('id', aulaId).maybeSingle();
      return (data as { docente_id?: string } | null)?.docente_id === user.id;
    };
    const alumnoMio = async (alumnoId: string) => {
      if (!noVacio(alumnoId)) return false;
      const { data } = await sb.from('perfil').select('docente_id, rol').eq('id', alumnoId).maybeSingle();
      const p = data as { docente_id?: string; rol?: string } | null;
      return p?.rol === 'alumno' && p?.docente_id === user.id;
    };

    switch (accion) {
      case 'crear_aula': {
        const { nombre, grado, codigo, secreto } = body;
        const v = validarCrearAula({ nombre, codigo, secreto, grado });
        if (!v.ok) return json({ error: v.error }, 400);
        if (!noVacio(caller.escuela_id)) return json({ error: 'sin_escuela' }, 400);
        const { data: aula, error } = await sb
          .from('aula')
          .insert({ escuela_id: caller.escuela_id, docente_id: user.id, nombre: String(nombre).trim(), grado: grado ?? null, codigo: codigoNormalizado(codigo) })
          .select('id, nombre, grado, codigo')
          .single();
        if (error) {
          if ((error as { code?: string }).code === '23505') return json({ error: 'codigo_duplicado' }, 409);
          throw error;
        }
        await sb.rpc('set_aula_secreto', { p_aula: (aula as { id: string }).id, p_secreto: secreto });
        return json({ aula });
      }

      case 'editar_aula': {
        const { aula_id, nombre, grado } = body;
        if (!(await aulaMia(aula_id))) return json({ error: 'no_es_tuyo' }, 403);
        const patch: Record<string, unknown> = {};
        if (nombre !== undefined) { if (!noVacio(nombre)) return json({ error: 'Poné un nombre.' }, 400); patch.nombre = String(nombre).trim(); }
        if (grado !== undefined) { if (grado !== null && !gradoOk(grado)) return json({ error: 'Grado 1 a 7.' }, 400); patch.grado = grado; }
        if (Object.keys(patch).length) await sb.from('aula').update(patch).eq('id', aula_id);
        return json({ ok: true });
      }

      case 'cambiar_secreto': {
        const { aula_id, secreto } = body;
        if (!noVacio(secreto)) return json({ error: 'Poné un secreto.' }, 400);
        if (!(await aulaMia(aula_id))) return json({ error: 'no_es_tuyo' }, 403);
        await sb.rpc('set_aula_secreto', { p_aula: aula_id, p_secreto: secreto });
        return json({ ok: true });
      }

      case 'borrar_aula': {
        const { aula_id } = body;
        if (!(await aulaMia(aula_id))) return json({ error: 'no_es_tuyo' }, 403);
        const { count } = await sb.from('perfil').select('id', { count: 'exact', head: true }).eq('aula_id', aula_id);
        if (count && count > 0) return json({ error: 'aula_con_alumnos' }, 409);
        await sb.from('aula').delete().eq('id', aula_id);
        return json({ ok: true });
      }

      case 'crear_alumno': {
        const { aula_id, nombre, avatar, grado, pin } = body;
        const v = validarCrearAlumno({ nombre, avatar, grado, pin, aula_id });
        if (!v.ok) return json({ error: v.error }, 400);
        if (!(await aulaMia(aula_id))) return json({ error: 'no_es_tuyo' }, 403);
        const email = `alu-${randHex(6)}@students.edutia.local`;
        const password = randPass();
        const { data: created, error: cErr } = await sb.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { nombre: String(nombre).trim(), rol: 'alumno' },
        });
        if (cErr || !created?.user) throw cErr ?? new Error('no_se_creo_user');
        const id = created.user.id;
        const { error: pErr } = await sb.from('perfil').insert({
          id, rol: 'alumno', nombre: String(nombre).trim(), avatar, grado, escuela_id: caller.escuela_id, docente_id: user.id, aula_id,
        });
        if (pErr) { await sb.auth.admin.deleteUser(id).catch(() => {}); throw pErr; } // rollback del auth user
        await sb.rpc('set_alumno_cred', { p_perfil: id, p_aula: aula_id, p_pin: pin, p_email: email, p_password: password });
        return json({ alumno: { id, nombre: String(nombre).trim(), avatar, grado, aula_id } });
      }

      case 'editar_alumno': {
        const { alumno_id, nombre, grado, avatar, aula_id } = body;
        if (!(await alumnoMio(alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        const patch: Record<string, unknown> = {};
        if (nombre !== undefined) { if (!noVacio(nombre)) return json({ error: 'Poné un nombre.' }, 400); patch.nombre = String(nombre).trim(); }
        if (grado !== undefined) { if (!gradoOk(grado)) return json({ error: 'Grado 1 a 7.' }, 400); patch.grado = grado; }
        if (avatar !== undefined) { if (!avatarValido(avatar)) return json({ error: 'Avatar inválido.' }, 400); patch.avatar = avatar; }
        if (aula_id !== undefined) { if (!(await aulaMia(aula_id))) return json({ error: 'no_es_tuyo' }, 403); patch.aula_id = aula_id; }
        if (Object.keys(patch).length) await sb.from('perfil').update(patch).eq('id', alumno_id);
        return json({ ok: true });
      }

      case 'resetear_pin': {
        const { alumno_id, pin } = body;
        if (!pinValido(pin)) return json({ error: 'El PIN tiene que ser de 4 dígitos.' }, 400);
        if (!(await alumnoMio(alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        await sb.rpc('reset_alumno_pin', { p_perfil: alumno_id, p_pin: pin });
        return json({ ok: true });
      }

      case 'borrar_alumno': {
        const { alumno_id } = body;
        if (!(await alumnoMio(alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        await sb.auth.admin.deleteUser(alumno_id); // cascada FK: perfil/cred/alumno_nodo/sesion/respuesta
        return json({ ok: true });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
