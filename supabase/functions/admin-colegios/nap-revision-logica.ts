// Lógica PURA de la cola de revisión del mapeo NAP (Task 7). index.ts trae
// las filas de nodo/sol_materia/nap_tema desde la base; este módulo arma la
// forma que ve el admin, sin Deno ni red — testeable desde Node, mismo patrón
// que observatorio-logica.ts y admin-jobs/nap-backfill-logica.ts.
//
// A propósito NO filtra por materia (Regla 4 del brief de Task 6/7): el
// catálogo de temas_posibles de un nodo son los del GRADO de su programa, las
// cuatro materias, porque ya está verificado que hay nodos legítimamente
// cruzados (ver progress.md: nodos de "conteo" archivados en un programa de
// Lengua que mapean bien a Matemática) y que el nombre de materia que carga
// la docente puede no calzar con el nombre oficial del marco.
import { esMateriaDeTest } from '../admin-jobs/nap-backfill-logica.ts';
import { bandaNap } from '../_shared/nap-bandas.ts';

export type NodoNapRaw = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  nap_tema_id: string | null;
  nap_confianza: number | null;
  nap_intentos: number;
  programa_id: string;
  programa: { grado: number; materia: { nombre: string } | null } | null;
};

export type TemaCatalogoOut = {
  id: string;
  nombre: string;
  eje: string;
  materia: string;
  texto_oficial: string | null;
};

// nap_eje llega embebido por PostgREST: en la práctica un objeto (relación
// muchos-a-uno), pero se tolera también el shape array de 1 por si cambia la
// versión del cliente — nunca se asume una forma sin chequearla.
type EjeEmbebido = { materia: string; nombre: string; orden: number } | null;
export type NapTemaRaw = {
  id: string;
  nombre: string;
  texto_oficial: string | null;
  orden: number;
  nap_eje: EjeEmbebido | EjeEmbebido[] | null;
};

function ejeDe(fila: NapTemaRaw): EjeEmbebido {
  const e = fila.nap_eje;
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
}

// Arma el catálogo de un grado, ordenado materia → eje → tema (así el
// <select> del front se agrupa en optgroups legibles en vez de salir en el
// orden que devolvió la consulta).
export function armarCatalogoGrado(filas: NapTemaRaw[]): TemaCatalogoOut[] {
  const conOrden = filas.map((f) => {
    const eje = ejeDe(f);
    return {
      id: f.id,
      nombre: f.nombre,
      eje: eje?.nombre ?? '',
      materia: eje?.materia ?? '',
      texto_oficial: f.texto_oficial ?? null,
      ejeOrden: eje?.orden ?? 0,
      temaOrden: f.orden ?? 0,
    };
  });
  conOrden.sort((a, b) =>
    a.materia.localeCompare(b.materia)
    || a.ejeOrden - b.ejeOrden
    || a.temaOrden - b.temaOrden
    || a.nombre.localeCompare(b.nombre));
  return conOrden.map(({ ejeOrden, temaOrden, ...tema }) => tema);
}

export type NodoRevisionOut = {
  id: string;
  nombre: string;
  descripcion: string | null;
  ejemplos: string[];
  colegio: string;
  materia: string;
  grado: number | null;
  nap_tema_id: string | null;
  nap_confianza: number | null;
  nap_intentos: number;
  temas_posibles: TemaCatalogoOut[];
};

// Copy de fallback cuando el programa del nodo no tiene sol_materia (nodos de
// fixtures/tests que quedaron en la base sin publicar — ver progress.md,
// "Nodo golondrina"/materia TestRep). No es tarea de esta cola limpiarlos:
// se muestran igual, sin romper la pantalla.
export const SIN_COLEGIO = 'Sin colegio asignado';

// Hallazgo 2 de la review final: `nap_backfill` ya excluye las materias de
// test por prefijo (`esMateriaDeTest`, mismo módulo) para no gastar API real
// clasificando basura de `npm run test:db` que nunca limpió su corrida — pero
// esta cola no aplicaba el mismo filtro, así que esos nodos (con descripción
// real, sin tema) se acumulaban en la vista de un humano para siempre y el
// badge del sidebar nunca podía bajar de esa cantidad. Filtra la VISTA, no la
// base: nunca se borran esas filas (regla del proyecto), solo se sacan de lo
// que ve el admin.
export function soloNodosReales(nodos: NodoNapRaw[]): NodoNapRaw[] {
  return nodos.filter((n) => !esMateriaDeTest(n.programa?.materia?.nombre));
}

// Auto-triage por banda (2026-08-18): la cola por defecto es SOLO la banda
// media ("revisar" — incluido el mapeo sin respaldo); lo descartado (<60% o
// sin propuesta) va a la vista del toggle, recuperable. Un confiable que se
// cuele en la consulta (el prefilter de la query es más laxo que la banda) no
// aparece en ninguna: no necesita humano.
export type NodosPorBanda = { pendientes: NodoNapRaw[]; descartados: NodoNapRaw[] };

export function partirPorBanda(nodos: NodoNapRaw[]): NodosPorBanda {
  const out: NodosPorBanda = { pendientes: [], descartados: [] };
  for (const n of nodos) {
    const banda = bandaNap(n);
    if (banda === 'revisar') out.pendientes.push(n);
    else if (banda === 'descartado') out.descartados.push(n);
  }
  return out;
}

// Une cada nodo pendiente con su colegio (mapa programa_id → nombre de
// escuela, ya resuelto en index.ts vía sol_materia) y el catálogo de temas
// del grado de su programa.
export function armarNodosRevision(
  nodos: NodoNapRaw[],
  colegioPorPrograma: Map<string, string>,
  catalogoPorGrado: Map<number, TemaCatalogoOut[]>,
  ejemplosPorNodo: Map<string, string[]> = new Map(),
): NodoRevisionOut[] {
  return nodos.map((n) => {
    const grado = n.programa?.grado ?? null;
    return {
      id: n.id,
      nombre: n.nombre,
      descripcion: n.descripcion ?? null,
      ejemplos: ejemplosPorNodo.get(n.id) ?? [],
      colegio: colegioPorPrograma.get(n.programa_id) ?? SIN_COLEGIO,
      materia: n.programa?.materia?.nombre ?? '(sin materia)',
      grado,
      nap_tema_id: n.nap_tema_id,
      nap_confianza: n.nap_confianza,
      nap_intentos: n.nap_intentos,
      temas_posibles: grado !== null ? (catalogoPorGrado.get(grado) ?? []) : [],
    };
  });
}

export type NapTemaIdNormalizado = { ok: true; value: string | null } | { ok: false };

// `nap_tema_id` en el body de nap_revision_fijar: string no vacío (un id del
// catálogo, validado contra la base en index.ts) o null/ausente = "Fuera del
// marco" (explícito, es una decisión legítima de la revisión, no un error).
// Cualquier otra cosa (número, objeto, string vacío) rebota.
export function normalizarNapTemaId(v: unknown): NapTemaIdNormalizado {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === 'string' && v.trim().length > 0) return { ok: true, value: v.trim() };
  return { ok: false };
}

// Hallazgo 1 de la review (Task 7, fix round 1): `nodo.nap_tema_id` es una FK
// pelada a `nap_tema(id)` (migración 0028), SIN restricción de grado — nada
// en la base impide pegarle a un nodo de 1° un tema de 7°. Por la pantalla no
// pasa porque el <select> ya filtra por grado, pero un curl, un payload viejo
// o un futuro botón de "reclasificar" pueden mandar cualquier id sin que
// nadie se entere (ni error, ni rastro en la auditoría) — justo el tipo de
// corrupción silenciosa que esta fase existe para evitar en el agregado. Este
// chequeo vive en el server (index.ts lo llama antes de escribir), nunca solo
// en el front. "Fuera del marco" (`napTemaId` null) es SIEMPRE válido: no hay
// tema, no hay grado que comparar.
export function gradoCoincide(
  napTemaId: string | null,
  gradoPrograma: number | null,
  gradoTema: number | null,
): boolean {
  if (!napTemaId) return true;
  return gradoPrograma !== null && gradoTema !== null && gradoPrograma === gradoTema;
}
