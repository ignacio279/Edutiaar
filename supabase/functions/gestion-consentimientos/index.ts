// gestion-consentimientos (Alumno golondrina — WP-B): la docente registra y
// cuida los consentimientos parentales de tratamiento de datos (Ley 25.326).
// Principio rector: EDUTIA custodia los datos del chico en nombre de su
// familia — el consentimiento es la constancia de esa custodia.
//
// Patrón gestion-alumnos: getUser + rol docente + RE-verificación de
// propiedad en cada acción (el front no es fuente de verdad); la tabla
// consentimiento se escribe solo por acá (server-only, service_role). OJO:
// revocar el consentimiento de tratamiento NO borra nada — el único borrado
// del sistema es la cancelación ARCO (admin-arco). Revocar es un registro de
// voluntad, y deja la deuda de regularización visible de nuevo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { verificarAcceso } from '../_shared/acceso.ts';

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const VINCULOS = ['madre', 'padre', 'tutor', 'otro'];

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

    // Acceso de plataforma: solo 'registrar' CREA un registro nuevo → genera.
    // Regularizar/revocar son deberes legales sobre lo que ya existe: siguen
    // andando con el trial vencido (corte suave); colegio bloqueado corta todo.
    const acc = await verificarAcceso(sb, user.id, { genera: accion === 'registrar' });
    if (!acc.permitido) return json({ error: acc.motivo }, acc.status);

    // Propiedad (service_role → bypass RLS, se chequea a mano, patrón
    // gestion-alumnos): mío = perfil.docente_id, el caché de la matrícula viva.
    const alumnoMio = async (alumnoId: string) => {
      if (!noVacio(alumnoId)) return false;
      const { data } = await sb.from('perfil').select('docente_id, rol').eq('id', alumnoId).maybeSingle();
      const p = data as { docente_id?: string; rol?: string } | null;
      return p?.rol === 'alumno' && p?.docente_id === user.id;
    };

    const consentimientoDe = async (id: string) => {
      if (!noVacio(id)) return null;
      const { data } = await sb
        .from('consentimiento')
        .select('id, alumno_id, escuela_id, alcance, estado')
        .eq('id', id)
        .maybeSingle();
      return data as { id: string; alumno_id: string; escuela_id: string; alcance: string; estado: string } | null;
    };

    const validarAdulto = (nombre: unknown, vinculo: unknown): string | null => {
      if (!noVacio(nombre)) return 'Poné el nombre del adulto responsable.';
      if (!VINCULOS.includes(String(vinculo))) return 'vinculo_invalido';
      return null;
    };

    switch (accion) {
      // Alta de un consentimiento de tratamiento vía asistida (la familia se
      // lo dijo a la seño en persona — realidad rural sin mail ni smartphone).
      // El front lo encadena al toque después de crear_alumno.
      case 'registrar': {
        const { alumno_id, adulto_nombre, adulto_vinculo, alcance } = body;
        if (alcance !== undefined && alcance !== 'tratamiento') {
          // Las transferencias tienen su propio flujo (gestion-transferencias).
          return json({ error: 'alcance_invalido' }, 400);
        }
        const eAdulto = validarAdulto(adulto_nombre, adulto_vinculo);
        if (eAdulto) return json({ error: eAdulto }, 400);
        if (!(await alumnoMio(alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        if (!noVacio(caller.escuela_id)) return json({ error: 'sin_escuela' }, 400);
        const { data, error } = await sb
          .from('consentimiento')
          .insert({
            alumno_id, escuela_id: caller.escuela_id,
            adulto_nombre: String(adulto_nombre).trim(), adulto_vinculo,
            alcance: 'tratamiento', via: 'asistida', estado: 'vigente',
            otorgado_at: new Date().toISOString(), registrado_por: user.id,
          })
          .select('id, alumno_id, adulto_nombre, adulto_vinculo, estado, otorgado_at')
          .single();
        if (error) throw error;
        return json({ consentimiento: data });
      }

      // El 'pendiente_regularizar' (deuda del backfill 0023 o de una
      // revocación) pasa a 'vigente' con los datos reales del adulto.
      case 'regularizar': {
        const { consentimiento_id, adulto_nombre, adulto_vinculo } = body;
        const eAdulto = validarAdulto(adulto_nombre, adulto_vinculo);
        if (eAdulto) return json({ error: eAdulto }, 400);
        const cons = await consentimientoDe(consentimiento_id);
        if (!cons) return json({ error: 'consentimiento_inexistente' }, 404);
        if (!(await alumnoMio(cons.alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        if (cons.estado !== 'pendiente_regularizar') return json({ error: 'no_esta_pendiente' }, 409);
        const { error } = await sb
          .from('consentimiento')
          .update({
            adulto_nombre: String(adulto_nombre).trim(), adulto_vinculo,
            estado: 'vigente', otorgado_at: new Date().toISOString(), registrado_por: user.id,
          })
          .eq('id', cons.id);
        if (error) throw error;
        return json({ ok: true });
      }

      // La deuda de MIS alumnos, para el recordatorio en la UI de la seño.
      case 'deuda': {
        const { data: mios } = await sb
          .from('perfil').select('id, nombre')
          .eq('rol', 'alumno').eq('docente_id', user.id);
        const alumnos = (mios ?? []) as { id: string; nombre: string }[];
        if (alumnos.length === 0) return json({ pendientes: [] });
        const { data, error } = await sb
          .from('consentimiento')
          .select('id, alumno_id')
          .eq('estado', 'pendiente_regularizar')
          .in('alumno_id', alumnos.map((a) => a.id));
        if (error) throw error;
        const nombreDe = new Map(alumnos.map((a) => [a.id, a.nombre]));
        const pendientes = ((data ?? []) as { id: string; alumno_id: string }[]).map((c) => ({
          consentimiento_id: c.id,
          alumno_id: c.alumno_id,
          alumno_nombre: nombreDe.get(c.alumno_id) ?? '',
        }));
        return json({ pendientes });
      }

      // Historial completo de un alumno mío (la RLS ya se lo daría al front,
      // pero acá vuelve junto con las otras acciones, con la misma puerta).
      case 'listar': {
        const { alumno_id } = body;
        if (!(await alumnoMio(alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        const { data, error } = await sb
          .from('consentimiento')
          .select('id, escuela_id, adulto_nombre, adulto_vinculo, alcance, via, estado, otorgado_at, revocado_at, created_at')
          .eq('alumno_id', alumno_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json({ consentimientos: data ?? [] });
      }

      // Registro de voluntad: NO borra nada (el borrado es solo ARCO). Si era
      // el consentimiento de tratamiento y no queda otro vigente, la deuda
      // vuelve a quedar visible (fila pendiente_regularizar nueva).
      case 'revocar': {
        const cons = await consentimientoDe(body.consentimiento_id);
        if (!cons) return json({ error: 'consentimiento_inexistente' }, 404);
        if (!(await alumnoMio(cons.alumno_id))) return json({ error: 'no_es_tuyo' }, 403);
        if (cons.estado !== 'vigente') return json({ error: 'no_esta_vigente' }, 409);
        const { error } = await sb
          .from('consentimiento')
          .update({ estado: 'revocado', revocado_at: new Date().toISOString() })
          .eq('id', cons.id);
        if (error) throw error;

        let deuda = false;
        if (cons.alcance === 'tratamiento') {
          const [{ count: vigentes }, { count: pendientes }] = await Promise.all([
            sb.from('consentimiento').select('id', { count: 'exact', head: true })
              .eq('alumno_id', cons.alumno_id).eq('escuela_id', cons.escuela_id)
              .eq('alcance', 'tratamiento').eq('estado', 'vigente'),
            sb.from('consentimiento').select('id', { count: 'exact', head: true })
              .eq('alumno_id', cons.alumno_id).eq('escuela_id', cons.escuela_id)
              .eq('estado', 'pendiente_regularizar'),
          ]);
          if ((vigentes ?? 0) === 0 && (pendientes ?? 0) === 0) {
            // Mismo placeholder que el backfill de 0023: deuda contable.
            const { error: eDeuda } = await sb.from('consentimiento').insert({
              alumno_id: cons.alumno_id, escuela_id: cons.escuela_id,
              adulto_nombre: '(pendiente de regularizar)', adulto_vinculo: 'otro',
              alcance: 'tratamiento', via: 'asistida', estado: 'pendiente_regularizar',
              registrado_por: user.id,
            });
            if (eDeuda) throw eDeuda;
            deuda = true;
          }
        }
        return json({ ok: true, deuda });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
