// Lógica PURA del panel de la docente (Etapa 4): actividad del día, etiqueta de
// estado "a quién atender" e histórico mes a mes. Sin DOM ni red → unit-testeable
// (igual que art.ts / mapa-layout.ts). Toma `now: Date` por parámetro: nada de
// new Date() adentro, así los tests son deterministas.
//
// Standalone a propósito: no importa de mapa-layout para no chocar la resolución
// de módulos (Next quiere import sin extensión; `node --test` la quiere con .ts).
// El color lo resuelve el componente con estadoColor(); acá solo va la data.

export type EstadoNodo = 'no_empezado' | 'en_construccion' | 'a_reforzar' | 'dominado';

export const ESTADO_LABEL: Record<EstadoNodo, string> = {
  no_empezado: 'Sin empezar',
  en_construccion: 'En camino',
  a_reforzar: 'A reforzar',
  dominado: 'Lo domina',
};

// Sesión mínima que necesita el panel (subset de la tabla `sesion`).
export type SesionLite = { fecha: string; aciertos?: number | null; total?: number | null };

// Prioridad de atención: a_reforzar primero (más urgente), dominado último.
// no_empezado pesa más que dominado: "le faltan temas" merece más mirada que
// "ya lo domina".
const PRIORIDAD: EstadoNodo[] = ['a_reforzar', 'en_construccion', 'no_empezado', 'dominado'];

// Límites del día local de `now` como instantes ISO (UTC). Sirven para filtrar
// sesiones de hoy o para un .gte()/.lt() contra `sesion.fecha`.
export function rangoHoy(now: Date): { desde: string; hasta: string } {
  const desde = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hasta = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

// Etiqueta de estado del alumno = peor estado entre sus nodos (a quién atender).
// Lista vacía → 'no_empezado'. No incluye color: lo pone el componente.
export function etiquetaEstado(nodos: { estado: string }[]): { estado: EstadoNodo; label: string } {
  const presentes = new Set(nodos.map((n) => n.estado));
  const estado = PRIORIDAD.find((e) => presentes.has(e)) ?? 'no_empezado';
  return { estado, label: ESTADO_LABEL[estado] };
}

// Clave de orden para la lista: menor = atender primero. Dentro del mismo estado,
// el que NO practicó hoy va antes (necesita el empujón).
export function prioridadAlumno(a: { estado: string; practicoHoy: boolean }): number {
  const rank = PRIORIDAD.indexOf(a.estado as EstadoNodo);
  const r = rank < 0 ? PRIORIDAD.length : rank;
  return r * 2 + (a.practicoHoy ? 1 : 0);
}

// Resumen de la actividad de hoy: cuántas sesiones y aciertos/total acumulados.
export function resumenHoy(sesiones: SesionLite[], now: Date): { cantidad: number; aciertos: number; total: number } {
  const { desde, hasta } = rangoHoy(now);
  const d = new Date(desde).getTime();
  const h = new Date(hasta).getTime();
  const hoy = sesiones.filter((s) => {
    const t = new Date(s.fecha).getTime();
    return t >= d && t < h;
  });
  return {
    cantidad: hoy.length,
    aciertos: hoy.reduce((acc, s) => acc + (s.aciertos ?? 0), 0),
    total: hoy.reduce((acc, s) => acc + (s.total ?? 0), 0),
  };
}

// Fecha de la sesión más reciente, o null si no hay ninguna.
export function ultimaSesion(sesiones: SesionLite[]): Date | null {
  let max: number | null = null;
  for (const s of sesiones) {
    const t = new Date(s.fecha).getTime();
    if (max === null || t > max) max = t;
  }
  return max === null ? null : new Date(max);
}

// "hoy" / "ayer" / "hace N días" / "hace N meses" — en días de calendario local.
export function haceCuanto(fecha: Date | string, now: Date): string {
  const f = new Date(fecha);
  const startF = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
  const startN = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dias = Math.round((startN - startF) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// 'YYYY-MM' → 'Junio 2026'. Mes fuera de rango cae elegante a la clave cruda.
export function nombreMes(mesISO: string): string {
  const [y, m] = mesISO.split('-').map(Number);
  const nombre = MESES[m - 1];
  return nombre ? `${nombre} ${y}` : mesISO;
}

export type GrupoMes = { mes: string; label: string; cantidad: number; aciertos: number; total: number };

// Agrupa sesiones por mes calendario local, más reciente primero.
export function agruparPorMes(sesiones: SesionLite[]): GrupoMes[] {
  const mapa = new Map<string, { cantidad: number; aciertos: number; total: number }>();
  for (const s of sesiones) {
    const f = new Date(s.fecha);
    const mes = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
    const g = mapa.get(mes) ?? { cantidad: 0, aciertos: 0, total: 0 };
    g.cantidad += 1;
    g.aciertos += s.aciertos ?? 0;
    g.total += s.total ?? 0;
    mapa.set(mes, g);
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([mes, g]) => ({ mes, label: nombreMes(mes), ...g }));
}
