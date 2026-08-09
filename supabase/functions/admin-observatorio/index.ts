// admin-observatorio (WP-A — fase "Observatorio y avisos"): agregados
// educativos ANÓNIMOS para /admin/observatorio — por jurisdicción (provincia),
// por materia × grado y top de "temas que más cuestan". Solo LECTURAS (por eso
// no audita: "toda mutación audita" no aplica acá). Guard verificarAdmin
// (plataforma_admin) + service_role.
//
// DÓNDE SE CALCULA: acá, SERVER-SIDE (a diferencia de admin-metricas, que
// manda filas crudas al front). Motivo (D-OA3): las filas crudas de sesiones
// llevan alumno_id — mandarlas al browser rompería el anonimato. Esta función
// trae filas acotadas de la DB, las pasa por la lógica pura de
// ./observatorio-logica.ts (testeada desde Node) y devuelve SOLO agregados:
// ningún nombre, id de perfil ni dato individual viaja en las respuestas, y
// el k-anonimato (k=5) anula las métricas de desempeño de celdas chicas.
//
// ESCALA: los rangos SIEMPRE se acotan (default 30 días, máximo 90) y cada
// consulta lleva tope de filas (MAX_FILAS). Con los topes de generación (240
// ejercicios/día) las escuelas piloto entran cómodas. Si algún día MAX_FILAS
// queda corto, el paso siguiente es una RPC SQL con group by (agregar en
// Postgres), NO subir el tope.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { esProvinciaValida } from '../_shared/provincias.ts';
import {
  agregarPorMateria, agregarPorProvincia, indexarCurriculo, topTemasQueCuestan,
  type AlumnoNodoObs, type AlumnoObs, type EscuelaObs, type MateriaObs,
  type NodoObs, type ProgramaObs, type SesionObs,
} from './observatorio-logica.ts';

const DIA_MS = 86_400_000;
const MAX_FILAS = 10000;

// Rango en días: default 30, mínimo 1, máximo 90 (patrón admin-metricas).
function rangoValido(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 30;
  return Math.min(90, v);
}

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json().catch(() => ({}));
    const accion = body?.accion;
    const rango = rangoValido(body?.rango_dias);
    const desde = new Date(Date.now() - rango * DIA_MS).toISOString();

    // ── Lecturas base (service_role, SOLO select, siempre con límite) ───────
    // Todas menos las archivadas (un colegio archivado ya no es parte de la
    // foto). `estado` puede ser null en filas viejas → or explícito.
    const traerEscuelas = async (): Promise<EscuelaObs[]> => {
      const { data, error } = await sb
        .from('escuela')
        .select('id, provincia')
        .or('estado.is.null,estado.neq.archivado')
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as EscuelaObs[];
    };

    const traerAlumnos = async (): Promise<AlumnoObs[]> => {
      const { data, error } = await sb
        .from('perfil')
        .select('id, grado, escuela_id')
        .eq('rol', 'alumno')
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as AlumnoObs[];
    };

    const traerSesiones = async (): Promise<SesionObs[]> => {
      const { data, error } = await sb
        .from('sesion')
        .select('alumno_id, nodo_id, aciertos, total')
        .gte('fecha', desde)
        .order('fecha', { ascending: false })
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as SesionObs[];
    };

    const traerTabla = async <T>(tabla: string, cols: string): Promise<T[]> => {
      const { data, error } = await sb.from(tabla).select(cols).limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as T[];
    };

    // Map alumnoId → provincia (vía escuela_id → escuela.provincia). Alumno de
    // escuela sin provincia (o archivada) queda sin entrada: fuera de los
    // agregados por provincia.
    const armarProvinciaDeAlumno = (escuelas: EscuelaObs[], alumnos: AlumnoObs[]) => {
      const provinciaDeEscuela = new Map<string, string>();
      for (const e of escuelas) {
        if (typeof e.provincia === 'string' && e.provincia) provinciaDeEscuela.set(e.id, e.provincia);
      }
      const provinciaDeAlumno = new Map<string, string>();
      for (const a of alumnos) {
        const prov = a.escuela_id ? provinciaDeEscuela.get(a.escuela_id) : undefined;
        if (prov) provinciaDeAlumno.set(a.id, prov);
      }
      return provinciaDeAlumno;
    };

    const traerCurriculo = async () => {
      const [nodos, programas, materias] = await Promise.all([
        traerTabla<NodoObs>('nodo', 'id, nombre, programa_id'),
        traerTabla<ProgramaObs>('programa', 'id, materia_id, grado'),
        traerTabla<MateriaObs>('materia', 'id, nombre'),
      ]);
      return { nodos, curriculo: indexarCurriculo(nodos, programas, materias) };
    };

    switch (accion) {
      // Vista "Por jurisdicción": agregado por provincia + bucket de colegios
      // sin provincia asignada (solo conteo).
      case 'resumen': {
        const [escuelas, alumnos, sesiones] = await Promise.all([
          traerEscuelas(),
          traerAlumnos(),
          traerSesiones(),
        ]);
        const { filas, sinProvincia } = agregarPorProvincia({ escuelas, alumnos, sesiones });
        return json({
          rango_dias: rango,
          generado_en: new Date().toISOString(),
          provincias: filas,
          sinProvincia,
        });
      }

      // Vista "Por materia y grado", opcionalmente acotada a una provincia.
      case 'materias': {
        const provincia = body?.provincia;
        if (provincia !== undefined && provincia !== null && !esProvinciaValida(provincia)) {
          return json({ error: 'provincia_invalida' }, 400);
        }
        const [escuelas, alumnos, sesiones, { curriculo }, alumnoNodo] = await Promise.all([
          traerEscuelas(),
          traerAlumnos(),
          traerSesiones(),
          traerCurriculo(),
          traerTabla<AlumnoNodoObs>('alumno_nodo', 'alumno_id, nodo_id, puntaje'),
        ]);
        const provinciaDeAlumno = armarProvinciaDeAlumno(escuelas, alumnos);
        const filas = agregarPorMateria(
          { sesiones, curriculo, alumnoNodo, provinciaDeAlumno },
          undefined,
          esProvinciaValida(provincia) ? provincia : undefined,
        );
        return json({ rango_dias: rango, filas });
      }

      // Top "temas que más cuestan" de una celda materia + grado (best-effort,
      // SIEMPRE marcado `aproximado`: los nombres de tema los escribe cada
      // docente y se agrupan por texto normalizado).
      case 'temas': {
        const materia = body?.materia;
        if (!noVacio(materia)) return json({ error: 'falta_materia' }, 400);
        const grado = body?.grado;
        if (!Number.isInteger(grado) || grado < 1 || grado > 7) {
          return json({ error: 'grado_invalido' }, 400);
        }
        const provincia = body?.provincia;
        if (provincia !== undefined && provincia !== null && !esProvinciaValida(provincia)) {
          return json({ error: 'provincia_invalida' }, 400);
        }
        const [escuelas, alumnos, sesiones, { nodos, curriculo }] = await Promise.all([
          traerEscuelas(),
          traerAlumnos(),
          traerSesiones(),
          traerCurriculo(),
        ]);
        const provinciaDeAlumno = armarProvinciaDeAlumno(escuelas, alumnos);
        const { temas, aproximado } = topTemasQueCuestan(
          { sesiones, nodos, curriculo, provinciaDeAlumno },
          { materia, grado, provincia: esProvinciaValida(provincia) ? provincia : undefined },
        );
        return json({ rango_dias: rango, temas, aproximado });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
