// Lógica PURA del backfill NAP (Task 6). Vive en admin-jobs porque la API key
// de Claude tiene que estar SOLO del lado del servidor (Regla 1): un script
// local que la necesitara la habría sacado de Supabase sin necesidad, así que
// esto corre como una acción más de admin-jobs, con el mismo guard dual (cron
// service-key / admin humano) que ya tiene esa función.
//
// Reusa TAL CUAL, sin reescribir nada, lo que ya exporta dividir-nodos/dividir.ts
// (Task 5): catalogoParaPrompt (el bloque del catálogo), NAP_INSTRUCCION (el
// criterio de clasificación, palabra por palabra), TOOL_GUARDAR_DIVISION (la
// misma tool) y parseDivision (la misma validación: id fuera del catálogo →
// null, confianza acotada a 0..1). Si el backfill clasificara distinto que la
// publicación, el catálogo terminaría con dos criterios y nadie sabría cuál
// mapeo mirar.
//
// Sin Deno, sin fetch propio, sin Deno.env: todo lo que toca red/DB vive en
// index.ts (inyectado), así este archivo se testea desde Node como
// nocturno-logica.ts y dividir.ts.
import { catalogoParaPrompt, NAP_INSTRUCCION, parseDivision } from '../dividir-nodos/dividir.ts';
import type { TemaCatalogo } from '../dividir-nodos/dividir.ts';

// Basura de corridas viejas de `npm run test:db` (tests de integración que no
// limpiaron su materia efímera): NO es contenido real de ningún colegio.
// Clasificarla gastaría API real para ensuciar el catálogo NAP con datos que
// no son de nadie. Se excluye por PREFIJO DE NOMBRE DE MATERIA — nunca se
// borra (no es tarea de este backfill, y no hay que tocar datos existentes).
export const PREFIJOS_MATERIA_TEST = ['TestRep', 'TestGen', 'TEST-bor-'];
export function esMateriaDeTest(nombreMateria: string | null | undefined): boolean {
  return PREFIJOS_MATERIA_TEST.some((p) => (nombreMateria ?? '').startsWith(p));
}

export type NodoAClasificar = { id: string; nombre: string; descripcion: string | null };

// El único texto NUEVO de este backfill: no hay "prompt de backfill" en
// Task 5 porque ahí se dividía contenido de cero. Acá los nodos YA existen,
// así que el intro solo dice eso — el criterio de clasificación en sí
// (NAP_INSTRUCCION) y el catálogo (catalogoParaPrompt) son los mismos que usa
// la publicación.
export function construirPromptBackfill(
  materiaLabel: string, grado: number, nodos: NodoAClasificar[], temas: TemaCatalogo[],
): { system: string; user: string } {
  const intro = [
    `Estos son nodos YA EXISTENTES de "${materiaLabel}" de ${grado}° grado, de una escuela`,
    'rural de Argentina (no los estás inventando, ya fueron publicados). No inventes nodos',
    'nuevos, no los combines, no los separes y no los reordenes: devolvé, llamando a la tool',
    `guardar_division, EXACTAMENTE estos ${nodos.length} nodo(s), en el mismo orden en que te`,
    'los doy (mismo nombre y descripción), agregando solo nap_tema_id y nap_confianza a cada uno.',
  ].join(' ');
  const listado = nodos
    .map((n, i) => `${i + 1}. "${n.nombre}"${n.descripcion ? ` — ${n.descripcion}` : ' (sin descripción)'}`)
    .join('\n');
  const system = [intro, NAP_INSTRUCCION, catalogoParaPrompt(materiaLabel, grado, temas)].join('\n\n');
  const user = `Nodos a clasificar (en este orden):\n${listado}`;
  return { system, user };
}

export type ResultadoNodo = {
  nodo_id: string;
  nombre: string;
  nap_tema_id: string | null;
  nap_confianza: number | null;
};

// Valida la respuesta de Claude con la MISMA validación que usa la
// publicación (parseDivision — no se reimplementa acá) y la empareja POR
// POSICIÓN con los nodos reales que se mandaron: se le pidió a Claude que no
// reordene, y esto lo verifica (cantidad exacta; si no calza, lanza y el
// caller no escribe nada de este programa) y avisa (sin bloquear) si algún
// nombre echoed no coincide con el real, señal de que la posición podría
// estar mintiendo.
export function emparejarResultado(
  nodosDePrograma: NodoAClasificar[],
  capturado: unknown,
  materiaLabel: string,
  grado: number,
  temas: TemaCatalogo[],
): { resultados: ResultadoNodo[]; avisos: string[] } {
  const division = parseDivision(capturado, materiaLabel, grado, temas);
  if (division.nodos.length !== nodosDePrograma.length) {
    throw new Error(
      `Claude devolvió ${division.nodos.length} nodo(s), esperaba ${nodosDePrograma.length} ` +
      '(mismo orden, sin agregar ni quitar). No se escribe nada de este programa.',
    );
  }
  const avisos: string[] = [];
  const resultados = nodosDePrograma.map((n, i) => {
    const propuesto = division.nodos[i];
    if (propuesto.nombre.trim() !== n.nombre.trim()) {
      avisos.push(
        `posición ${i}: Claude devolvió "${propuesto.nombre}" pero el nodo real es "${n.nombre}" ` +
        '(se usa igual por posición)',
      );
    }
    return {
      nodo_id: n.id,
      nombre: n.nombre,
      nap_tema_id: propuesto.nap_tema_id,
      nap_confianza: propuesto.nap_confianza,
    };
  });
  return { resultados, avisos };
}

// Agrupa nodos por programa_id (comparten materia + grado ⇒ comparten
// catálogo) y devuelve la lista en orden ESTABLE (por programa_id) para que
// la paginación por `offset` de index.ts sea determinística entre llamadas.
export function agruparPorPrograma<T extends { programa_id: string }>(
  nodos: T[],
): [string, T[]][] {
  const mapa = new Map<string, T[]>();
  for (const n of nodos) {
    if (!mapa.has(n.programa_id)) mapa.set(n.programa_id, []);
    mapa.get(n.programa_id)!.push(n);
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
}
