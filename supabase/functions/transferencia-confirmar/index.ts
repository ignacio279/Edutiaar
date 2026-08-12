// transferencia-confirmar (alumno golondrina, WP-A): la ÚNICA puerta pública
// del feature (verify_jwt=false). La familia abre el link del pase sin tener
// cuenta, ve de qué se trata y autoriza. Esa autorización ES el consentimiento
// de tratamiento hacia el colegio nuevo (ADR-011): sin ella no hay
// transferencia — la DB lo garantiza con el CHECK de 0023.
//
// SEGURIDAD (es una puerta sin sesión):
//   · El token opaco de 128 bits es TODA la auth; en la DB vive solo su
//     SHA-256, así que ni con la tabla a la vista se puede reconstruir.
//   · Un id inexistente y un token errado devuelven EXACTAMENTE lo mismo:
//     el link no sirve para enumerar transferencias ajenas.
//   · Lockout persistente (0027, patrón intento_login): 5 fallos → 15 minutos.
//   · `ver` NO revela legajo, ids de terceros ni datos del colegio: apenas el
//     nombre de pila del chico y los nombres de las dos escuelas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import {
  codigoDeError, estaBloqueada, estaVencida, registrarFallo, sha256Hex, vinculoValido,
} from './logica.ts';

const noVacio = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json();
    const { accion, transferencia_id, token } = body;
    if (!noVacio(transferencia_id) || !noVacio(token)) return json({ error: 'token_invalido' }, 403);

    const ahora = new Date();
    const ahoraISO = ahora.toISOString();

    const { data } = await sb
      .from('transferencia')
      .select('id, alumno_id, escuela_origen, escuela_destino, estado, token_hash, expira_at, intentos_fallidos, bloqueada_hasta')
      .eq('id', transferencia_id)
      .maybeSingle();
    const t = data as {
      id: string; alumno_id: string; escuela_origen: string | null; escuela_destino: string;
      estado: string; token_hash: string | null; expira_at: string;
      intentos_fallidos: number; bloqueada_hasta: string | null;
    } | null;
    // Id que no existe: misma respuesta que un token errado (sin enumeración).
    if (!t) return json({ error: 'token_invalido' }, 403);

    // 1) Lockout primero: un link bloqueado no gasta más intentos.
    if (estaBloqueada(t.bloqueada_hasta, ahora)) return json({ error: 'transferencia_bloqueada' }, 429);

    // 2) El token. Comparación sobre el hash; el claro nunca se guardó.
    const hash = await sha256Hex(String(token));
    if (!t.token_hash || hash !== t.token_hash) {
      await sb.from('transferencia')
        .update(registrarFallo(t.intentos_fallidos, ahora))
        .eq('id', t.id);
      return json({ error: 'token_invalido' }, 403);
    }
    // Token bueno: el contador vuelve a cero (patrón intento_login).
    if (t.intentos_fallidos > 0) {
      await sb.from('transferencia').update({ intentos_fallidos: 0 }).eq('id', t.id);
    }

    // 3) Recién con el token válido se habla del estado del pase.
    if (estaVencida(t.expira_at, ahora)) {
      if (t.estado === 'pendiente') {
        await sb.from('transferencia')
          .update({ estado: 'expirada', resuelta_at: ahoraISO })
          .eq('id', t.id).eq('estado', 'pendiente');
      }
      return json({ error: 'transferencia_expirada' }, 410);
    }
    if (t.estado !== 'pendiente') return json({ error: 'ya_resuelta' }, 409);

    const nombreEscuela = async (id: string | null) => {
      if (!id) return null;
      const { data: e } = await sb.from('escuela').select('nombre').eq('id', id).maybeSingle();
      return (e as { nombre?: string } | null)?.nombre ?? null;
    };

    switch (accion) {
      // Lo MÍNIMO para que la familia entienda qué está autorizando.
      case 'ver': {
        const { data: al } = await sb.from('perfil').select('nombre').eq('id', t.alumno_id).maybeSingle();
        return json({
          alumno_nombre: (al as { nombre?: string } | null)?.nombre ?? null,
          escuela_origen: await nombreEscuela(t.escuela_origen),
          escuela_destino: await nombreEscuela(t.escuela_destino),
          expira_at: t.expira_at,
        });
      }

      // La autorización. Mismo orden que la vía asistida de
      // gestion-transferencias: consentimiento → cerrar → abrir → confirmar.
      case 'confirmar': {
        const { adulto_nombre, adulto_vinculo } = body;
        if (!noVacio(adulto_nombre) || !vinculoValido(adulto_vinculo)) {
          return json({ error: 'datos_invalidos' }, 400);
        }

        // 1) El consentimiento: lo que hace existir a la transferencia.
        const { data: cons, error: consErr } = await sb.from('consentimiento')
          .insert({
            alumno_id: t.alumno_id, escuela_id: t.escuela_destino,
            adulto_nombre: String(adulto_nombre).trim(), adulto_vinculo,
            alcance: 'transferencia', via: 'link', estado: 'vigente', otorgado_at: ahoraISO,
          })
          .select('id').single();
        if (consErr) throw consErr;
        const consId = (cons as { id: string }).id;

        // 2) Cerrar la matrícula vieja (revoca el login del chico en el aula
        // anterior). Si ya no tenía, el pase igual sigue.
        const { data: activa } = await sb.from('matricula')
          .select('id').eq('alumno_id', t.alumno_id).is('fecha_fin', null).maybeSingle();
        if (activa) {
          const { error } = await sb.rpc('matricula_cerrar', {
            p_matricula: (activa as { id: string }).id, p_motivo: 'migracion', p_actor: null,
          });
          if (error) return json({ error: codigoDeError(error.message) }, 409);
        }

        // 3) Abrir en destino SIN aula ni docente: el chico llega "para
        // activar" y la seño que lo recibe le pone aula, grado y PIN nuevo.
        const { error: abrirErr } = await sb.rpc('matricula_abrir', {
          p_alumno: t.alumno_id, p_escuela: t.escuela_destino, p_aula: null,
          p_docente: null, p_grado: null, p_actor: null, p_consentimiento: consId,
        });
        if (abrirErr) return json({ error: codigoDeError(abrirErr.message) }, 409);

        // 4) Un solo uso: el .eq('estado','pendiente') es la condición de
        // carrera — si dos clicks llegan juntos, el segundo no matchea filas.
        const { data: upd, error: updErr } = await sb.from('transferencia')
          .update({
            estado: 'confirmada', consentimiento_id: consId,
            confirmada_via: 'link', resuelta_at: ahoraISO,
          })
          .eq('id', t.id).eq('estado', 'pendiente')
          .select('id');
        if (updErr) throw updErr;
        if (!(upd as unknown[] | null)?.length) return json({ error: 'ya_resuelta' }, 409);

        // Auditoría sin actor humano (el adulto no tiene cuenta): queda el
        // vínculo declarado y la vía, que es lo que importa para el registro.
        await sb.from('auditoria').insert({
          actor_id: '00000000-0000-0000-0000-000000000000',
          accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: t.id,
          detalle: { alumno_id: t.alumno_id, escuela_destino: t.escuela_destino, via: 'link', adulto_vinculo },
        });

        return json({ ok: true, escuela_destino: await nombreEscuela(t.escuela_destino) });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
