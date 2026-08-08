// admin-impersonar (Dashboard admin v3, WP9): "ver como maestra" en SOLO
// LECTURA. D12: JAMÁS se emite una sesión ni un token de la docente (sus
// contraseñas son reales) — esta función NO toca auth: junta con service_role
// un snapshot read-only con datos mínimos (Regla 5: nombre de pila, grado,
// desempeño; nada de emails de alumnos, PINs ni credenciales) y CADA vista
// queda auditada antes de devolver nada. El armado del shape es puro
// (snapshot.ts, testeable desde Node); acá solo hay I/O.
// Guard verificarAdmin: nivel operativo alcanza (es solo lectura).
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import { registrarAuditoria } from '../_shared/auditoria.ts';
import {
  armarSnapshot,
  type AlumnoFila,
  type AulaFila,
  type BoletinFila,
  type EscuelaFila,
  type MateriaFila,
  type SesionFila,
} from './snapshot.ts';

const DIAS_SESIONES = 14; // ventana de actividad que ve el admin
const MAX_SESIONES = 500; // techo defensivo del query (aulas rurales: sobra)

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const { accion } = body;

    switch (accion) {
      case 'vista_docente': {
        const docenteId = (body as { docente_id?: unknown }).docente_id;
        if (!noVacio(docenteId)) return json({ error: 'no_existe' }, 404);

        // Solo perfiles rol 'docente': jamás se snapshotea un alumno u otro perfil.
        const { data: p } = await sb
          .from('perfil')
          .select('id, nombre, rol, escuela_id')
          .eq('id', docenteId)
          .maybeSingle();
        const doc = p as { id: string; nombre: string; rol: string; escuela_id: string | null } | null;
        if (!doc || doc.rol !== 'docente') return json({ error: 'no_existe' }, 404);

        // AUDITA SIEMPRE, ANTES de devolver el snapshot: cada vista queda
        // registrada aunque el armado posterior falle (D12).
        registrarAuditoria(sb, ctx, { accion: 'ver_como', entidad: 'perfil', entidad_id: doc.id });

        const now = new Date();
        const desdeSesiones = new Date(now.getTime() - DIAS_SESIONES * 86_400_000).toISOString();
        const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Filas base en paralelo (todo service_role, todo lectura).
        const [rEscuela, rAulas, rAlumnos, rMaterias, rBoletines] = await Promise.all([
          doc.escuela_id
            ? sb.from('escuela').select('id, nombre').eq('id', doc.escuela_id).maybeSingle()
            : Promise.resolve({ data: null }),
          sb.from('aula').select('id, nombre, grado, codigo').eq('docente_id', doc.id).order('nombre'),
          sb.from('perfil').select('id, nombre, grado, aula_id').eq('rol', 'alumno').eq('docente_id', doc.id).order('nombre'),
          sb.from('sol_materia')
            .select('id, estado, programa_id, programa:programa_id (materia:materia_id (nombre))')
            .eq('docente_id', doc.id),
          sb.from('boletin').select('estado').eq('docente_id', doc.id).eq('periodo', periodo),
        ]);

        const escuela = (rEscuela.data ?? null) as EscuelaFila | null;
        const aulas = (rAulas.data ?? []) as AulaFila[];
        const alumnos = (rAlumnos.data ?? []) as AlumnoFila[];
        const materiasRaw = (rMaterias.data ?? []) as unknown as {
          id: string;
          estado: string;
          programa_id: string;
          programa: { materia: { nombre: string } | null } | null;
        }[];
        const boletines = (rBoletines.data ?? []) as BoletinFila[];

        // Sesiones de los últimos 14 días de SUS alumnos.
        let sesiones: SesionFila[] = [];
        if (alumnos.length) {
          const { data } = await sb
            .from('sesion')
            .select('alumno_id, fecha, aciertos, total')
            .in('alumno_id', alumnos.map((a) => a.id))
            .gte('fecha', desdeSesiones)
            .order('fecha', { ascending: false })
            .limit(MAX_SESIONES);
          sesiones = (data ?? []) as SesionFila[];
        }

        // Count de nodos por programa (client-side: pocas materias por docente).
        const nodosPorPrograma = new Map<string, number>();
        if (materiasRaw.length) {
          const { data } = await sb
            .from('nodo')
            .select('programa_id')
            .in('programa_id', materiasRaw.map((m) => m.programa_id));
          for (const n of (data ?? []) as { programa_id: string }[]) {
            nodosPorPrograma.set(n.programa_id, (nodosPorPrograma.get(n.programa_id) ?? 0) + 1);
          }
        }
        const materias: MateriaFila[] = materiasRaw.map((m) => ({
          id: m.id,
          nombre: m.programa?.materia?.nombre ?? 'Materia',
          estado: m.estado,
          nodos: nodosPorPrograma.get(m.programa_id) ?? 0,
        }));

        const snapshot = armarSnapshot(
          { perfil: { id: doc.id, nombre: doc.nombre }, escuela, aulas, alumnos, sesiones, materias, boletines },
          now,
        );
        return json({ snapshot });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
