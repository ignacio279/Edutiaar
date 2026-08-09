// admin-metricas (WP5 — Dashboard admin v3): adopción, uso, funnel de
// onboarding, comparativa entre colegios y feed de actividad para la home del
// panel /admin. Solo LECTURAS (por eso no audita: "toda mutación audita" no
// aplica acá). Guard verificarAdmin (plataforma_admin) + service_role.
//
// DÓNDE SE CALCULA (decisión del WP): esta función devuelve FILAS CRUDAS YA
// ACOTADAS y el FRONT importa `web/lib/admin/metricas.ts` y calcula con las
// funciones puras (resumenAdopcion, metricasUso, funnelColegio,
// compararColegios, armarFeed, fechaRelativa, serieSemanal). Motivo: la fn
// corre en Deno y metricas.ts vive en web/lib — importarlo cruzado sería feo y
// frágil, y así la lógica se testea UNA sola vez desde Node
// (tests/unit/admin-metricas.test.mjs). Los shapes que devuelve cada acción
// son exactamente los tipos de entrada de esas funciones (DatosAdopcion,
// DatosUso, DatosFunnel, ColegioComparado, EventoFeed, SesionFila…).
//
// ÚNICA EXCEPCIÓN: las agregaciones POR COLEGIO (`comparativa` y el
// `comparado` de `detalle_colegio`) se suman acá, porque la función pura
// espera el shape YA agrupado (ColegioComparado) y mandar todas las sesiones
// de todos los colegios al browser no escala.
//
// APROXIMACIONES DOCUMENTADAS (heredadas de metricas.ts):
// - `perfil` NO tiene created_at (0001) → el feed no tiene eventos de alta de
//   maestra (no se inventan) y la etapa "maestras invitadas" del funnel queda
//   hecha pero sin fecha.
// - `uso_api` se llena recién en la Fase final → todo lo que dependa de ella
//   degrada a 0 con copy honesto ("sin datos todavía"), nunca a NaN.
// - "Maestra activa" ya NO es solo aproximación: `resumen` trae el
//   `last_sign_in_at` real de Supabase Auth (listarUsuariosAuth) y el front
//   cuenta activa a quien se logueó en los últimos 7 días. Los rastros de
//   trabajo (boletín tocado, chat de LUNA, uso_api) se mantienen como señal
//   complementaria: cubren sesiones largas sin re-login.
// - Los rangos SIEMPRE se acotan (default 30 días, máximo 90) y las consultas
//   llevan tope de filas, para no acercarse al límite de ~150 s de las Edge
//   Functions.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { listarUsuariosAuth } from '../_shared/auth-users.ts';

const DIA_MS = 86_400_000;

// Tope de filas por consulta (MVP): con el tope diario de ejercicios (240) y
// los topes de LUNA, 90 días de las escuelas piloto entran cómodos. Si algún
// día se queda corto, el paso siguiente es agregar en SQL, no subir el tope.
const MAX_FILAS = 10000;

// Rango en días: default 30, mínimo 1, máximo 90 (ver arriba).
function rangoValido(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 30;
  return Math.min(90, v);
}

// Límite del feed: default 30, máximo 100.
function limiteValido(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 30;
  return Math.min(100, v);
}

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

type PerfilFila = { id: string; rol: string; nombre: string | null; escuela_id: string | null };
type EscuelaFila = { id: string; nombre: string | null; estado: string | null; created_at: string | null };
type SesionFila = { alumno_id: string; fecha: string; aciertos?: number | null; total?: number | null };
type BoletinFila = {
  alumno_id?: string | null;
  docente_id?: string | null;
  estado?: string | null;
  version?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  aprobado_at?: string | null;
};
type MensajeFila = { docente_id: string | null; role: string | null; created_at: string | null };
type EventoFeed = {
  tipo: 'sesion' | 'boletin_aprobado' | 'alta_maestra' | 'alta_colegio';
  fecha: string;
  alumno?: string | null;
  nodo?: string | null;
  escuela?: string | null;
  nombre?: string | null;
};

// Supabase-js tipa los embeds como objeto o array según la relación; acá se
// normaliza a objeto (o null) sin pelear con los tipos.
function uno<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] ?? null) as T | null;
  return (v ?? null) as T | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json().catch(() => ({}));
    const accion = body?.accion;
    const rango = rangoValido(body?.rango_dias);
    const ahora = Date.now();
    const desdeMs = ahora - rango * DIA_MS;
    const desdeRango = new Date(desdeMs).toISOString();
    // Postgres devuelve timestamptz como "…+00:00" y acá se arman ISO con "Z":
    // comparar esas dos formas COMO STRINGS miente. Siempre por milisegundos.
    const enRango = (iso?: string | null) => {
      const v = iso ? new Date(iso).getTime() : NaN;
      return Number.isFinite(v) && v >= desdeMs && v <= ahora;
    };

    // ── Lecturas base (chiquitas en el MVP: pocas escuelas y perfiles) ──────
    const traerEscuelas = async (): Promise<EscuelaFila[]> => {
      const { data, error } = await sb
        .from('escuela')
        .select('id, nombre, estado, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as EscuelaFila[];
    };

    const traerPerfiles = async (): Promise<PerfilFila[]> => {
      const { data, error } = await sb
        .from('perfil')
        .select('id, rol, nombre, escuela_id')
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as PerfilFila[];
    };

    const traerSesiones = async (desde: string, alumnoIds?: string[]): Promise<SesionFila[]> => {
      if (alumnoIds && !alumnoIds.length) return [];
      let q = sb
        .from('sesion')
        .select('alumno_id, fecha, aciertos, total')
        .gte('fecha', desde)
        .order('fecha', { ascending: false })
        .limit(MAX_FILAS);
      if (alumnoIds) q = q.in('alumno_id', alumnoIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SesionFila[];
    };

    // Boletines SIN filtro de fecha a propósito: el volumen es chico (uno por
    // alumno y mes) y las funciones puras necesitan mirar created_at,
    // updated_at Y aprobado_at para decidir "maestra activa" — filtrar por una
    // sola de las tres dejaría afuera boletines viejos tocados hoy.
    const traerBoletines = async (docenteIds?: string[]): Promise<BoletinFila[]> => {
      if (docenteIds && !docenteIds.length) return [];
      let q = sb
        .from('boletin')
        .select('alumno_id, docente_id, estado, version, created_at, updated_at, aprobado_at')
        .order('created_at', { ascending: false })
        .limit(MAX_FILAS);
      if (docenteIds) q = q.in('docente_id', docenteIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BoletinFila[];
    };

    const traerMensajes = async (desde: string, docenteIds?: string[]): Promise<MensajeFila[]> => {
      if (docenteIds && !docenteIds.length) return [];
      let q = sb
        .from('luna_mensaje')
        .select('docente_id, role, created_at')
        .gte('created_at', desde)
        .limit(MAX_FILAS);
      if (docenteIds) q = q.in('docente_id', docenteIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MensajeFila[];
    };

    const traerCreatedAt = async (tabla: string, desde: string): Promise<{ created_at: string }[]> => {
      const { data, error } = await sb
        .from(tabla)
        .select('created_at')
        .gte('created_at', desde)
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as { created_at: string }[];
    };

    // uso_api todavía está vacía (se llena en la Fase final): si algo falla o
    // no hay nada, devuelve [] y el front muestra 0 con copy honesto.
    const traerUsoApi = async (desde: string): Promise<{ perfil_id: string | null; created_at: string }[]> => {
      const { data } = await sb
        .from('uso_api')
        .select('perfil_id, created_at')
        .gte('created_at', desde)
        .limit(MAX_FILAS);
      return (data ?? []) as { perfil_id: string | null; created_at: string }[];
    };

    // Índices por colegio a partir de la lista de perfiles.
    const indexar = (perfiles: PerfilFila[]) => {
      const alumnosDe = new Map<string, string[]>();
      const docentesDe = new Map<string, string[]>();
      const escuelaDeAlumno = new Map<string, string>();
      const escuelaDeDocente = new Map<string, string>();
      for (const p of perfiles) {
        if (!p.escuela_id) continue;
        if (p.rol === 'alumno') {
          alumnosDe.set(p.escuela_id, [...(alumnosDe.get(p.escuela_id) ?? []), p.id]);
          escuelaDeAlumno.set(p.id, p.escuela_id);
        } else if (p.rol === 'docente') {
          docentesDe.set(p.escuela_id, [...(docentesDe.get(p.escuela_id) ?? []), p.id]);
          escuelaDeDocente.set(p.id, p.escuela_id);
        }
      }
      return { alumnosDe, docentesDe, escuelaDeAlumno, escuelaDeDocente };
    };

    // Eventos del feed (sesiones + boletines aprobados). `alumnoIds` acota a un
    // colegio; sin él, toda la plataforma.
    const traerEventos = async (
      limite: number,
      nombreEscuela: Map<string, string>,
      alumnoIds?: string[],
    ): Promise<EventoFeed[]> => {
      const eventos: EventoFeed[] = [];

      let qs = sb
        .from('sesion')
        .select('fecha, alumno:alumno_id(nombre, escuela_id), nodo:nodo_id(nombre)')
        .order('fecha', { ascending: false })
        .limit(limite);
      if (alumnoIds) qs = qs.in('alumno_id', alumnoIds);
      const { data: ses } = await qs;
      for (const s of (ses ?? []) as Record<string, unknown>[]) {
        const alumno = uno<{ nombre: string | null; escuela_id: string | null }>(s.alumno);
        const nodo = uno<{ nombre: string | null }>(s.nodo);
        eventos.push({
          tipo: 'sesion',
          fecha: String(s.fecha),
          alumno: alumno?.nombre ?? null,
          nodo: nodo?.nombre ?? null,
          escuela: alumno?.escuela_id ? (nombreEscuela.get(alumno.escuela_id) ?? null) : null,
        });
      }

      let qb = sb
        .from('boletin')
        .select('aprobado_at, alumno:alumno_id(nombre, escuela_id)')
        .eq('estado', 'aprobado')
        .not('aprobado_at', 'is', null)
        .order('aprobado_at', { ascending: false })
        .limit(limite);
      if (alumnoIds) qb = qb.in('alumno_id', alumnoIds);
      const { data: bols } = await qb;
      for (const b of (bols ?? []) as Record<string, unknown>[]) {
        const alumno = uno<{ nombre: string | null; escuela_id: string | null }>(b.alumno);
        eventos.push({
          tipo: 'boletin_aprobado',
          fecha: String(b.aprobado_at),
          alumno: alumno?.nombre ?? null,
          escuela: alumno?.escuela_id ? (nombreEscuela.get(alumno.escuela_id) ?? null) : null,
        });
      }

      return eventos;
    };

    switch (accion) {
      // Home del admin: todo lo que necesitan resumenAdopcion (últimos 7 días)
      // y metricasUso (mes en curso). El front arma el Rango con `mes`.
      case 'resumen': {
        // El "mes en curso" se calcula con el reloj del server (UTC) y se
        // manda al front en ISO: los dos lados usan exactamente los mismos
        // bordes, así que no hay corrimiento de husos en el conteo.
        const now = new Date();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
        const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        // 8 días (no 7) de margen: el "hoy" y la ventana de 7 días los calcula
        // el navegador en SU huso horario y el server puede estar en otro.
        const piso = new Date(Math.min(inicioMes.getTime(), ahora - 8 * DIA_MS)).toISOString();

        // listarUsuariosAuth es una llamada extra a Auth (paginada), aceptable
        // solo acá en `resumen`: trae el last_sign_in_at REAL de cada docente
        // para que "maestra activa" no dependa solo de rastros de trabajo.
        const [escuelas, perfiles, sesiones, boletines, mensajes, usoApi, respuestas, ejercicios, usuariosAuth] =
          await Promise.all([
            traerEscuelas(),
            traerPerfiles(),
            traerSesiones(piso),
            traerBoletines(),
            traerMensajes(piso),
            traerUsoApi(piso),
            traerCreatedAt('respuesta', inicioMes.toISOString()),
            traerCreatedAt('ejercicio', inicioMes.toISOString()),
            listarUsuariosAuth(sb),
          ]);

        const docentes = perfiles.filter((p) => p.rol === 'docente').map((p) => ({
          id: p.id,
          last_sign_in_at: usuariosAuth.get(p.id)?.last_sign_in_at ?? null,
        }));

        return json({
          mes: { desde: inicioMes.toISOString(), hasta: finMes.toISOString() },
          // Shape exacto de DatosAdopcion (metricas.ts).
          adopcion: { escuelas, docentes, sesiones, boletines, mensajes, usoApi },
          // Shape exacto de DatosUso (metricas.ts).
          uso: { respuestas, boletines, mensajes, ejerciciosCreados: ejercicios },
        });
      }

      // Serie de adopción: sesiones crudas del rango → serieSemanal en el front.
      case 'adopcion': {
        const sesiones = await traerSesiones(desdeRango);
        return json({ rango_dias: rango, desde: desdeRango, hasta: new Date(ahora).toISOString(), sesiones });
      }

      // Uso del rango (DatosUso) + los bordes del Rango que espera metricasUso.
      case 'uso': {
        const [respuestas, ejercicios, boletines, mensajes] = await Promise.all([
          traerCreatedAt('respuesta', desdeRango),
          traerCreatedAt('ejercicio', desdeRango),
          traerBoletines(),
          traerMensajes(desdeRango),
        ]);
        return json({
          rango_dias: rango,
          desde: desdeRango,
          hasta: new Date(ahora).toISOString(),
          uso: { respuestas, boletines, mensajes, ejerciciosCreados: ejercicios },
        });
      }

      // Funnel de onboarding por colegio: los inputs de funnelColegio. Sin
      // rango — son "primeras veces" históricas. OJO N+1: 2 queries por
      // colegio, aceptable con pocas decenas (patrón de admin-colegios).
      case 'funnel': {
        const [escuelas, perfiles] = await Promise.all([traerEscuelas(), traerPerfiles()]);
        const { alumnosDe, docentesDe } = indexar(perfiles);

        const colegios = [];
        for (const e of escuelas) {
          const alumnos = alumnosDe.get(e.id) ?? [];
          const docentes = docentesDe.get(e.id) ?? [];

          let primeraSesion: string | null = null;
          if (alumnos.length) {
            const { data } = await sb
              .from('sesion')
              .select('fecha')
              .in('alumno_id', alumnos)
              .order('fecha', { ascending: true })
              .limit(1);
            primeraSesion = ((data ?? [])[0] as { fecha?: string } | undefined)?.fecha ?? null;
          }

          let primerBoletinAprobado: string | null = null;
          if (docentes.length) {
            const { data } = await sb
              .from('boletin')
              .select('aprobado_at')
              .in('docente_id', docentes)
              .eq('estado', 'aprobado')
              .not('aprobado_at', 'is', null)
              .order('aprobado_at', { ascending: true })
              .limit(1);
            primerBoletinAprobado = ((data ?? [])[0] as { aprobado_at?: string } | undefined)?.aprobado_at ?? null;
          }

          // Shape exacto de DatosFunnel (docentes va como CANTIDAD: perfil no
          // tiene created_at, así que la lista no aportaría fecha).
          colegios.push({
            escuela: e,
            docentes: docentes.length,
            primeraSesion,
            primerBoletinAprobado,
          });
        }
        return json({ colegios });
      }

      // Comparativa entre colegios: acá SÍ se agrega en el server (ver
      // cabecera) y el front solo ordena/normaliza con compararColegios.
      case 'comparativa': {
        const [escuelas, perfiles] = await Promise.all([traerEscuelas(), traerPerfiles()]);
        const { escuelaDeAlumno, escuelaDeDocente } = indexar(perfiles);

        const sesiones = await traerSesiones(desdeRango);
        const boletines = await traerBoletines();

        const acum = new Map<string, {
          alumnos: Set<string>; sesiones: number; aciertos: number; total: number; boletinesAprobados: number;
        }>();
        const slot = (id: string) => {
          let a = acum.get(id);
          if (!a) {
            a = { alumnos: new Set<string>(), sesiones: 0, aciertos: 0, total: 0, boletinesAprobados: 0 };
            acum.set(id, a);
          }
          return a;
        };

        for (const s of sesiones) {
          const esc = escuelaDeAlumno.get(s.alumno_id);
          if (!esc) continue;
          const a = slot(esc);
          a.alumnos.add(s.alumno_id);
          a.sesiones += 1;
          a.aciertos += Number(s.aciertos ?? 0) || 0;
          a.total += Number(s.total ?? 0) || 0;
        }
        for (const b of boletines) {
          if (b.estado !== 'aprobado' || !b.docente_id || !enRango(b.aprobado_at)) continue;
          const esc = escuelaDeDocente.get(b.docente_id);
          if (!esc) continue;
          slot(esc).boletinesAprobados += 1;
        }

        // Shape exacto de ColegioComparado (metricas.ts).
        const colegios = escuelas.map((e) => {
          const a = acum.get(e.id);
          return {
            escuelaId: e.id,
            nombre: e.nombre,
            estado: e.estado,
            alumnosActivos: a ? a.alumnos.size : 0,
            sesiones: a?.sesiones ?? 0,
            aciertos: a?.aciertos ?? 0,
            total: a?.total ?? 0,
            boletinesAprobados: a?.boletinesAprobados ?? 0,
          };
        });
        return json({ rango_dias: rango, colegios });
      }

      // Feed de actividad: eventos heterogéneos SIN ordenar (los mergea y
      // ordena armarFeed en el front). No hay evento de alta de maestra:
      // `perfil` no tiene created_at y no se inventa una fecha.
      case 'feed': {
        const limite = limiteValido(body?.limite);
        const escuelas = await traerEscuelas();
        const nombreEscuela = new Map<string, string>();
        for (const e of escuelas) nombreEscuela.set(e.id, e.nombre ?? '');

        const eventos = await traerEventos(limite, nombreEscuela);
        for (const e of escuelas.slice(0, limite)) {
          if (e.created_at) eventos.push({ tipo: 'alta_colegio', fecha: e.created_at, nombre: e.nombre });
        }
        return json({ limite, eventos });
      }

      // Tab "Uso" de la ficha de un colegio.
      case 'detalle_colegio': {
        const escuelaId = body?.escuela_id;
        if (!noVacio(escuelaId)) return json({ error: 'falta_escuela_id' }, 400);

        const { data: esc } = await sb
          .from('escuela')
          .select('id, nombre, estado, created_at')
          .eq('id', escuelaId)
          .maybeSingle();
        if (!esc) return json({ error: 'no_existe' }, 404);
        const escuela = esc as EscuelaFila;

        const perfiles = await traerPerfiles();
        const { alumnosDe, docentesDe } = indexar(perfiles);
        const alumnos = alumnosDe.get(escuela.id) ?? [];
        const docentes = docentesDe.get(escuela.id) ?? [];

        const [sesiones, boletines, mensajes] = await Promise.all([
          traerSesiones(desdeRango, alumnos),
          traerBoletines(docentes),
          traerMensajes(desdeRango, docentes),
        ]);

        let aciertos = 0;
        let total = 0;
        const activos = new Set<string>();
        for (const s of sesiones) {
          activos.add(s.alumno_id);
          aciertos += Number(s.aciertos ?? 0) || 0;
          total += Number(s.total ?? 0) || 0;
        }
        const boletinesAprobados = boletines.filter(
          (b) => b.estado === 'aprobado' && enRango(b.aprobado_at),
        ).length;

        const nombreEscuela = new Map<string, string>();
        nombreEscuela.set(escuela.id, escuela.nombre ?? '');
        const eventos = await traerEventos(12, nombreEscuela, alumnos);

        return json({
          rango_dias: rango,
          desde: desdeRango,
          hasta: new Date(ahora).toISOString(),
          escuela,
          counts: { maestras: docentes.length, alumnos: alumnos.length },
          // ColegioComparado ya agregado (ver cabecera).
          comparado: {
            escuelaId: escuela.id,
            nombre: escuela.nombre,
            estado: escuela.estado,
            alumnosActivos: activos.size,
            sesiones: sesiones.length,
            aciertos,
            total,
            boletinesAprobados,
          },
          sesiones, // crudas: serieSemanal en el front
          boletines,
          mensajes,
          eventos,
        });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
