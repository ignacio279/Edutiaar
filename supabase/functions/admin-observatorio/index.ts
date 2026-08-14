// admin-observatorio (WP-A — fase "Observatorio y avisos"): agregados
// educativos ANÓNIMOS para /admin/observatorio — por jurisdicción (provincia),
// por materia × grado y desempeño contra el marco curricular NAP (por eje y
// tema). Solo LECTURAS (por eso no audita: "toda mutación audita" no aplica
// acá). Guard verificarAdmin (plataforma_admin) + service_role.
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
  agregarPorMateria, agregarPorProvincia, desempenoPorEje, indexarCurriculo,
  type AlumnoNodoObs, type AlumnoNodoNap, type AlumnoObs, type EjeCat,
  type EscuelaObs, type MateriaObs, type NodoNap, type NodoObs,
  type ProgramaObs, type SesionObs, type TemaCat,
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

    // Oposición ARCO (migración 0024): un alumno con excluido_procesamiento
    // queda FUERA de todo agregado no esencial — este universo es la única
    // puerta de entrada de alumnos al observatorio, así que el filtro va acá
    // y soloIncluidos() (abajo) saca sus filas de sesion/alumno_nodo ANTES de
    // computar (sin él, los agregados sin filtro de provincia las contarían).
    const traerAlumnos = async (): Promise<AlumnoObs[]> => {
      const { data, error } = await sb
        .from('perfil')
        .select('id, grado, escuela_id')
        .eq('rol', 'alumno')
        .eq('excluido_procesamiento', false)
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as AlumnoObs[];
    };

    // Filtra filas keyed por alumno_id al universo NO excluido (la oposición
    // se respeta antes de agregar; el k-anonimato k=5 sigue intacto después).
    const soloIncluidos = <T extends { alumno_id: string }>(filas: T[], alumnos: AlumnoObs[]): T[] => {
      const incluidos = new Set(alumnos.map((a) => a.id));
      return filas.filter((f) => incluidos.has(f.alumno_id));
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

    // ── Lecturas del marco NAP (desempenoPorEje) ────────────────────────────
    const traerNodosNap = () => traerTabla<NodoNap>('nodo', 'id, nap_tema_id');

    const traerAlumnoNodo = () =>
      traerTabla<AlumnoNodoNap>('alumno_nodo', 'alumno_id, nodo_id, puntaje, estado');

    // Ejes del marco NAP de una materia (nap_eje.materia acota directo).
    const traerEjes = async (materia: string): Promise<EjeCat[]> => {
      const { data, error } = await sb
        .from('nap_eje')
        .select('id, materia, nombre, orden')
        .eq('materia', materia)
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as EjeCat[];
    };

    // Temas del marco NAP de una materia + grado. nap_tema no tiene columna
    // materia propia (cuelga de nap_eje), así que el filtro va por join.
    const traerTemas = async (materia: string, grado: number): Promise<TemaCat[]> => {
      const { data, error } = await sb
        .from('nap_tema')
        .select('id, eje_id, nombre, grado, orden, nap_eje!inner(materia)')
        .eq('grado', grado)
        .eq('nap_eje.materia', materia)
        .limit(MAX_FILAS);
      if (error) throw error;
      return (data ?? []) as TemaCat[];
    };

    // Map alumnoId → escuela_id, para colegiosConTema/colegiosTotal de
    // desempenoPorEje (a diferencia de armarProvinciaDeAlumno, acá no hace
    // falta pasar por escuela: perfil.escuela_id ya es el dato).
    const armarEscuelaDeAlumno = (alumnos: AlumnoObs[]): Map<string, string> => {
      const escuelaDeAlumno = new Map<string, string>();
      for (const a of alumnos) {
        if (a.escuela_id) escuelaDeAlumno.set(a.id, a.escuela_id);
      }
      return escuelaDeAlumno;
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
        const { filas, sinProvincia } = agregarPorProvincia({
          escuelas, alumnos, sesiones: soloIncluidos(sesiones, alumnos),
        });
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
          {
            sesiones: soloIncluidos(sesiones, alumnos),
            curriculo,
            alumnoNodo: soloIncluidos(alumnoNodo, alumnos),
            provinciaDeAlumno,
          },
          undefined,
          esProvinciaValida(provincia) ? provincia : undefined,
        );
        return json({ rango_dias: rango, filas });
      }

      // Desempeño contra el marco NAP (D-NAP1..D-NAP8). `grado` OBLIGATORIO:
      // los temas de los NAP se definen por grado, mezclarlos juntaría
      // contenidos distintos bajo un mismo nombre.
      case 'desempeno': {
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
        const [escuelas, alumnos, sesiones, nodos, alumnoNodo, ejes, temas] = await Promise.all([
          traerEscuelas(), traerAlumnos(), traerSesiones(), traerNodosNap(),
          traerAlumnoNodo(), traerEjes(materia), traerTemas(materia, grado),
        ]);
        const incluidos = soloIncluidos(sesiones, alumnos);
        const ejesOut = desempenoPorEje(
          {
            sesiones: incluidos,
            alumnoNodo: soloIncluidos(alumnoNodo, alumnos),
            nodos,
            ejes,
            temas,
            escuelaDeAlumno: armarEscuelaDeAlumno(alumnos),
            provinciaDeAlumno: armarProvinciaDeAlumno(escuelas, alumnos),
          },
          { materia, grado, provincia: esProvinciaValida(provincia) ? provincia : undefined },
        );
        return json({ rango_dias: rango, ejes: ejesOut });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
