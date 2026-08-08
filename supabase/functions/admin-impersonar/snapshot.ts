// Armado PURO del snapshot "ver como maestra" (Dashboard admin v3, WP9).
// Recibe las filas que juntó index.ts (service_role) y devuelve el shape
// read-only que pinta /admin/ver-como/[docenteId]. Sin Deno, sin DOM, sin red:
// se testea desde Node (tests/unit/admin-impersonar.test.mjs) y toma `now`
// por parámetro para que los tests sean deterministas.
// D12: acá JAMÁS hay tokens, emails de alumnos, PINs ni credenciales — datos
// mínimos (Regla 5): nombre de pila, grado y desempeño.

export type PerfilFila = { id: string; nombre: string };
export type EscuelaFila = { id: string; nombre: string };
export type AulaFila = { id: string; nombre: string; grado: number | null; codigo: string };
export type AlumnoFila = { id: string; nombre: string; grado: number | null; aula_id: string | null };
export type SesionFila = { alumno_id: string; fecha: string; aciertos?: number | null; total?: number | null };
export type MateriaFila = { id: string; nombre: string; estado: string; nodos: number };
export type BoletinFila = { estado: string };

export type AlumnoSnapshot = {
  id: string;
  nombre: string;
  grado: number | null;
  aula_id: string | null;
  ultimaSesion: string | null; // fecha ISO de la sesión más nueva, o null
  sesionesHoy: number; // sesiones en el día local de `now`
  precisionReciente: number | null; // % de aciertos sobre las sesiones recibidas (14 días), o null sin datos
};

export type ActividadSnapshot = { alumnoNombre: string; fecha: string; aciertos: number; total: number };

export type Snapshot = {
  docente: { id: string; nombre: string };
  escuela: { id: string; nombre: string } | null;
  aulas: AulaFila[];
  alumnos: AlumnoSnapshot[];
  materias: MateriaFila[];
  boletines: { aprobados: number; borradores: number };
  actividadReciente: ActividadSnapshot[];
};

// Cuántas sesiones muestra "actividad reciente".
export const ACTIVIDAD_MAX = 10;

// Límites del día local de `now` en ms (mismo criterio que panel.ts:rangoHoy).
function rangoHoyMs(now: Date): { desde: number; hasta: number } {
  const desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const hasta = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return { desde, hasta };
}

export function armarSnapshot(
  filas: {
    perfil: PerfilFila;
    escuela: EscuelaFila | null;
    aulas: AulaFila[];
    alumnos: AlumnoFila[];
    sesiones: SesionFila[]; // sesiones de los últimos 14 días de sus alumnos
    materias: MateriaFila[];
    boletines: BoletinFila[]; // boletines del período actual de la docente
  },
  now: Date,
): Snapshot {
  const { desde, hasta } = rangoHoyMs(now);
  const sesiones = filas.sesiones ?? [];

  const alumnos: AlumnoSnapshot[] = (filas.alumnos ?? []).map((a) => {
    let ultima: string | null = null;
    let ultimaMs = -Infinity;
    let sesionesHoy = 0;
    let aciertos = 0;
    let total = 0;
    for (const s of sesiones) {
      if (s.alumno_id !== a.id) continue;
      const t = new Date(s.fecha).getTime();
      if (t > ultimaMs) { ultimaMs = t; ultima = s.fecha; }
      if (t >= desde && t < hasta) sesionesHoy += 1;
      aciertos += s.aciertos ?? 0;
      total += s.total ?? 0;
    }
    return {
      id: a.id,
      nombre: a.nombre,
      grado: a.grado ?? null,
      aula_id: a.aula_id ?? null,
      ultimaSesion: ultima,
      sesionesHoy,
      precisionReciente: total > 0 ? Math.round((100 * aciertos) / total) : null,
    };
  });

  const nombreDe = new Map((filas.alumnos ?? []).map((a) => [a.id, a.nombre]));
  const actividadReciente: ActividadSnapshot[] = [...sesiones]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, ACTIVIDAD_MAX)
    .map((s) => ({
      alumnoNombre: nombreDe.get(s.alumno_id) ?? 'Alumno',
      fecha: s.fecha,
      aciertos: s.aciertos ?? 0,
      total: s.total ?? 0,
    }));

  const boletines = filas.boletines ?? [];
  return {
    docente: { id: filas.perfil.id, nombre: filas.perfil.nombre },
    escuela: filas.escuela ? { id: filas.escuela.id, nombre: filas.escuela.nombre } : null,
    aulas: (filas.aulas ?? []).map((a) => ({ id: a.id, nombre: a.nombre, grado: a.grado ?? null, codigo: a.codigo })),
    alumnos,
    materias: (filas.materias ?? []).map((m) => ({ id: m.id, nombre: m.nombre, estado: m.estado, nodos: m.nodos })),
    boletines: {
      aprobados: boletines.filter((b) => b.estado === 'aprobado').length,
      borradores: boletines.filter((b) => b.estado === 'borrador').length,
    },
    actividadReciente,
  };
}
