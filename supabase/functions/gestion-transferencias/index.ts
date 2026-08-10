// gestion-transferencias (alumno golondrina, WP-A): el pase de un alumno entre
// colegios, SIEMPRE con consentimiento de la familia. La docente de ORIGEN
// genera el link que la familia confirma (transferencia-confirmar, pública);
// la docente de DESTINO ve a los recién llegados y los activa (aula+grado+PIN);
// el admin puede hacer todo y además la vía ASISTIDA (la familia presente).
// La regla dura NO vive acá: matricula_abrir exige consentimiento vigente y el
// CHECK de transferencia impide confirmar sin él (0022/0023) — esta fn solo
// orquesta. Guard DUAL (patrón admin-jobs): primero verificarAdmin; si el
// caller no es admin, cae al patrón docente de gestion-alumnos (getUser +
// rol docente + verificarAcceso). El token del link jamás se persiste: se
// devuelve UNA vez (patrón password temporal de admin-maestras) y en DB queda
// solo su hash.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin, type AdminCtx } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import { verificarAcceso } from '../_shared/acceso.ts';
import {
  armarLinkTransferencia,
  calcularExpiracion,
  codigoDeError,
  diasExpiracion,
  sha256Hex,
  tokenHex,
  vinculoValido,
} from './logica.ts';

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const gradoValido = (g: unknown): g is number => Number.isInteger(g) && (g as number) >= 1 && (g as number) <= 7;

// Columnas que salen al front (jamás token_hash ni los contadores de lockout).
const COLS_VISTA = 'id, alumno_id, escuela_origen, escuela_destino, estado, expira_at, confirmada_via, resuelta_at, created_at';
const COLS_LISTADO = `${COLS_VISTA}, alumno:alumno_id(nombre), origen:escuela_origen(nombre), destino:escuela_destino(nombre)`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Guard dual: ¿admin de plataforma? Si no (403 no_admin), probamos docente.
    // Un 401 corta acá mismo: sin sesión no hay rol que probar.
    let admin: AdminCtx | null = null;
    const guard = await verificarAdmin(req);
    if (guard instanceof Response) {
      if (guard.status === 401) return guard;
    } else {
      admin = guard;
    }

    const sb = admin?.sb ?? createClient(url, srKey);
    let docente: { id: string; email: string | null; escuela_id: string | null } | null = null;
    if (!admin) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'no_autenticado' }, 401);
      const { data: perfil } = await sb.from('perfil').select('rol, escuela_id').eq('id', user.id).maybeSingle();
      const p = perfil as { rol?: string; escuela_id?: string | null } | null;
      if (p?.rol !== 'docente') return json({ error: 'no_docente' }, 403);
      // Acceso de plataforma, patrón gestion-alumnos: transferir alumnos es
      // operar sobre el vínculo → mismo corte que dar de alta (genera: true).
      const acc = await verificarAcceso(sb, user.id, { genera: true });
      if (!acc.permitido) return json({ error: acc.motivo }, acc.status);
      docente = { id: user.id, email: user.email ?? null, escuela_id: p.escuela_id ?? null };
    }
    const actorId = admin?.user.id ?? docente!.id;

    const body = await req.json();
    const { accion } = body;

    // Helpers de propiedad (service role bypassea RLS → se chequea a mano).
    const alumnoDe = async (alumnoId: unknown) => {
      if (!noVacio(alumnoId)) return null;
      const { data } = await sb.from('perfil').select('id, rol, nombre, escuela_id, docente_id, estado').eq('id', alumnoId).maybeSingle();
      const p = data as { id: string; rol: string; nombre: string; escuela_id: string | null; docente_id: string | null; estado: string } | null;
      return p?.rol === 'alumno' ? p : null;
    };
    const aulaMia = async (aulaId: unknown) => {
      if (!noVacio(aulaId)) return false;
      const { data } = await sb.from('aula').select('docente_id').eq('id', aulaId).maybeSingle();
      return (data as { docente_id?: string } | null)?.docente_id === docente?.id;
    };
    // Auditoría dual: con ctx admin va por registrarAuditoria; la docente
    // inserta directo (mismo shape, nivel null — patrón del cron en admin-jobs).
    const auditar = (accion: string, entidadId: string, detalle: Record<string, unknown>) => {
      if (admin) {
        registrarAuditoria(sb, admin, { accion, entidad: 'transferencia', entidad_id: entidadId, detalle });
        return;
      }
      sb.from('auditoria')
        .insert({ actor_id: docente!.id, actor_email: docente!.email, nivel: null, accion, entidad: 'transferencia', entidad_id: entidadId, detalle })
        .then(({ error }) => { if (error) console.error('auditoria_fallo', accion, error.message); });
    };

    switch (accion) {
      // La docente de origen (o el admin) genera el pase: nace 'pendiente' y
      // el link para la familia se devuelve UNA sola vez.
      case 'solicitar': {
        const { alumno_id, escuela_destino_id } = body;
        if (!noVacio(alumno_id) || !noVacio(escuela_destino_id)) return json({ error: 'datos_invalidos' }, 400);
        const al = await alumnoDe(alumno_id);
        if (!al) return json({ error: 'alumno_inexistente' }, 404);
        if (docente && al.docente_id !== docente.id) return json({ error: 'no_es_tuyo' }, 403);
        const { data: destino } = await sb.from('escuela').select('id').eq('id', escuela_destino_id).maybeSingle();
        if (!destino) return json({ error: 'escuela_inexistente' }, 404);
        if (al.escuela_id === escuela_destino_id) return json({ error: 'misma_escuela' }, 400);

        // 128 bits aleatorios; a la DB va SOLO el hash. El fragment (#token)
        // no llega a logs de server: el link entero solo existe en esta respuesta.
        const token = tokenHex(crypto.getRandomValues(new Uint8Array(16)));
        const tokenHash = await sha256Hex(token);
        const { data: cfg } = await sb.from('plataforma_config').select('valor').eq('clave', 'transferencia_dias_expiracion').maybeSingle();
        const expiraAt = calcularExpiracion(new Date(), diasExpiracion((cfg as { valor?: unknown } | null)?.valor));

        const { data: t, error } = await sb.from('transferencia')
          .insert({
            alumno_id, escuela_origen: al.escuela_id, escuela_destino: escuela_destino_id,
            solicitada_por: actorId, token_hash: tokenHash, expira_at: expiraAt,
          })
          .select(COLS_VISTA)
          .single();
        if (error) {
          // El índice parcial transferencia_una_pendiente: a lo sumo UNA pendiente.
          if ((error as { code?: string }).code === '23505') return json({ error: 'transferencia_pendiente_existente' }, 409);
          throw error;
        }
        const tr = t as { id: string };
        auditar('transferencia_solicitada', tr.id, { alumno_id, escuela_destino_id });
        return json({ transferencia: t, link: armarLinkTransferencia(tr.id, token) });
      }

      // Los pases de la seño: los que solicitó ella + los de sus alumnos
      // actuales (tras confirmarse, el alumno deja de ser suyo — por eso el
      // OR con solicitada_por: sus pases confirmados no desaparecen).
      case 'propias': {
        if (!docente) return json({ error: 'solo_docente' }, 403);
        const { data: mios } = await sb.from('perfil').select('id').eq('rol', 'alumno').eq('docente_id', docente.id);
        const ids = ((mios ?? []) as { id: string }[]).map((a) => a.id);
        let q = sb.from('transferencia').select(COLS_LISTADO).order('created_at', { ascending: false });
        q = ids.length ? q.or(`solicitada_por.eq.${docente.id},alumno_id.in.(${ids.join(',')})`) : q.eq('solicitada_por', docente.id);
        const { data, error } = await q;
        if (error) throw error;
        return json({ transferencias: data ?? [] });
      }

      // Recién llegados a MI escuela: matrícula activa sin docente (la abrió
      // la confirmación de la familia; falta que una seño los adopte).
      case 'llegadas': {
        if (!docente) return json({ error: 'solo_docente' }, 403);
        if (!docente.escuela_id) return json({ llegadas: [] });
        const { data, error } = await sb.from('matricula')
          .select('id, fecha_inicio, alumno:alumno_id(id, nombre, avatar, estado)')
          .eq('escuela_id', docente.escuela_id)
          .is('fecha_fin', null)
          .is('docente_id', null)
          .order('fecha_inicio', { ascending: false });
        if (error) throw error;
        // eslint no corre en Deno: el shape anidado se aplana a mano.
        const llegadas = ((data ?? []) as unknown as { id: string; fecha_inicio: string; alumno: { id: string; nombre: string; avatar: string; estado: string } | null }[])
          .filter((m) => m.alumno)
          .map((m) => ({ matricula_id: m.id, fecha_inicio: m.fecha_inicio, alumno_id: m.alumno!.id, nombre: m.alumno!.nombre, avatar: m.alumno!.avatar, estado: m.alumno!.estado }));
        return json({ llegadas });
      }

      // La seño de destino adopta al recién llegado: aula + grado en la
      // matrícula (el trigger sincroniza el caché de perfil) y credencial
      // nueva para que el chico vuelva a entrar (la vieja la revocó el cierre).
      case 'activar_alumno_transferido': {
        if (!docente) return json({ error: 'solo_docente' }, 403);
        const { alumno_id, aula_id, grado, pin } = body;
        if (!/^\d{4}$/.test(String(pin ?? ''))) return json({ error: 'pin_invalido' }, 400);
        if (!gradoValido(grado)) return json({ error: 'grado_invalido' }, 400);
        if (!(await aulaMia(aula_id))) return json({ error: 'no_es_tuyo' }, 403);
        const { data: m } = await sb.from('matricula')
          .select('id')
          .eq('alumno_id', alumno_id).eq('escuela_id', docente.escuela_id)
          .is('fecha_fin', null).is('docente_id', null)
          .maybeSingle();
        if (!m) return json({ error: 'sin_matricula_de_llegada' }, 409);
        const { error: mErr } = await sb.from('matricula')
          .update({ aula_id, docente_id: docente.id, grado })
          .eq('id', (m as { id: string }).id);
        if (mErr) throw mErr;
        // El auth user es el MISMO (el legajo viaja con el id): se rotan email
        // opaco y password (patrón crear_alumno) y el PIN lo pone la seño.
        const email = `alu-${tokenHex(crypto.getRandomValues(new Uint8Array(6)))}@students.edutia.local`;
        const password = tokenHex(crypto.getRandomValues(new Uint8Array(24)));
        const { error: uErr } = await sb.auth.admin.updateUserById(alumno_id, { email, password, email_confirm: true });
        if (uErr) throw uErr;
        const { error: cErr } = await sb.rpc('set_alumno_cred', {
          p_perfil: alumno_id, p_aula: aula_id, p_pin: String(pin), p_email: email, p_password: password,
        });
        if (cErr) throw cErr;
        auditar('alumno_transferido_activado', (m as { id: string }).id, { alumno_id, aula_id, grado });
        return json({ ok: true });
      }

      // Vía asistida (SOLO admin): la familia está presente — consentimiento,
      // cierre, apertura y transferencia confirmada en un solo request.
      case 'asistida': {
        if (!admin) return json({ error: 'solo_admin' }, 403);
        const { alumno_id, escuela_destino_id, adulto_nombre, adulto_vinculo } = body;
        if (!noVacio(alumno_id) || !noVacio(escuela_destino_id)) return json({ error: 'datos_invalidos' }, 400);
        if (!noVacio(adulto_nombre) || !vinculoValido(adulto_vinculo)) return json({ error: 'datos_invalidos' }, 400);
        const al = await alumnoDe(alumno_id);
        if (!al) return json({ error: 'alumno_inexistente' }, 404);
        const { data: destino } = await sb.from('escuela').select('id').eq('id', escuela_destino_id).maybeSingle();
        if (!destino) return json({ error: 'escuela_inexistente' }, 404);
        if (al.escuela_id === escuela_destino_id) return json({ error: 'misma_escuela' }, 400);

        const ahora = new Date().toISOString();
        // 1) El consentimiento presencial: la firma de la familia, registrada
        // por el admin que la tiene enfrente.
        const { data: cons, error: consErr } = await sb.from('consentimiento')
          .insert({
            alumno_id, escuela_id: escuela_destino_id, adulto_nombre: String(adulto_nombre).trim(),
            adulto_vinculo, alcance: 'transferencia', via: 'asistida', estado: 'vigente',
            otorgado_at: ahora, registrado_por: admin.user.id,
          })
          .select('id').single();
        if (consErr) throw consErr;
        const consId = (cons as { id: string }).id;

        // 2) Si tenía matrícula activa, se cierra por migración (revoca el login).
        const { data: activa } = await sb.from('matricula').select('id').eq('alumno_id', alumno_id).is('fecha_fin', null).maybeSingle();
        if (activa) {
          const { error } = await sb.rpc('matricula_cerrar', {
            p_matricula: (activa as { id: string }).id, p_motivo: 'migracion', p_actor: admin.user.id,
          });
          if (error) return json({ error: codigoDeError(error.message) }, 409);
        }

        // 3) Abrir en destino (sin aula/docente/grado: los completa la seño
        // que lo reciba). Si la RPC lo rechaza (p. ej. alumno baja), el código
        // sube tal cual al caller.
        const { error: abrirErr } = await sb.rpc('matricula_abrir', {
          p_alumno: alumno_id, p_escuela: escuela_destino_id, p_aula: null, p_docente: null,
          p_grado: null, p_actor: admin.user.id, p_consentimiento: consId,
        });
        if (abrirErr) return json({ error: codigoDeError(abrirErr.message) }, 409);

        // 4) La transferencia queda confirmada. Si había un link pendiente
        // HACIA ESTE destino, se confirma ese (la familia eligió venir en
        // persona); un pendiente hacia OTRA escuela se deniega (quedó superado
        // — el consentimiento es hacia UNA escuela, no vale para confirmarlo)
        // y nace una fila nueva ya confirmada.
        const patchConfirmada = { estado: 'confirmada', consentimiento_id: consId, confirmada_via: 'asistida', resuelta_at: ahora };
        const { data: upd } = await sb.from('transferencia')
          .update(patchConfirmada)
          .eq('alumno_id', alumno_id).eq('estado', 'pendiente').eq('escuela_destino', escuela_destino_id)
          .select('id');
        let transferenciaId = (upd as { id: string }[] | null)?.[0]?.id;
        if (!transferenciaId) {
          await sb.from('transferencia')
            .update({ estado: 'denegada', resuelta_at: ahora })
            .eq('alumno_id', alumno_id).eq('estado', 'pendiente');
          const { data: nueva, error: nErr } = await sb.from('transferencia')
            .insert({
              alumno_id, escuela_origen: al.escuela_id, escuela_destino: escuela_destino_id,
              solicitada_por: admin.user.id, expira_at: ahora, ...patchConfirmada,
            })
            .select('id').single();
          if (nErr) throw nErr;
          transferenciaId = (nueva as { id: string }).id;
        }
        auditar('transferencia_asistida', transferenciaId, { alumno_id, escuela_destino_id, adulto_vinculo });
        return json({ ok: true, transferencia_id: transferenciaId });
      }

      // Cancelar un pase pendiente: el admin, la docente del alumno o quien
      // lo solicitó. El link deja de servir al instante (el estado manda).
      case 'denegar': {
        const { transferencia_id } = body;
        if (!noVacio(transferencia_id)) return json({ error: 'datos_invalidos' }, 400);
        const { data: t } = await sb.from('transferencia').select('id, alumno_id, solicitada_por, estado').eq('id', transferencia_id).maybeSingle();
        if (!t) return json({ error: 'transferencia_inexistente' }, 404);
        const tr = t as { id: string; alumno_id: string; solicitada_por: string | null };
        if (docente) {
          const al = await alumnoDe(tr.alumno_id);
          if (al?.docente_id !== docente.id && tr.solicitada_por !== docente.id) return json({ error: 'no_es_tuyo' }, 403);
        }
        const { data: upd, error } = await sb.from('transferencia')
          .update({ estado: 'denegada', resuelta_at: new Date().toISOString() })
          .eq('id', tr.id).eq('estado', 'pendiente')
          .select('id');
        if (error) throw error;
        if (!(upd as unknown[] | null)?.length) return json({ error: 'ya_resuelta' }, 409);
        auditar('transferencia_denegada', tr.id, { alumno_id: tr.alumno_id });
        return json({ ok: true });
      }

      // Vista de operación (SOLO admin): todas, con nombres, filtro por estado.
      case 'listar': {
        if (!admin) return json({ error: 'solo_admin' }, 403);
        const { estado } = body;
        let q = sb.from('transferencia').select(COLS_LISTADO).order('created_at', { ascending: false }).limit(200);
        if (noVacio(estado)) q = q.eq('estado', estado);
        const { data, error } = await q;
        if (error) throw error;
        return json({ transferencias: data ?? [] });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
