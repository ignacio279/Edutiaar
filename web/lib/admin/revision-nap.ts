// Lógica PURA de la cola de revisión del mapeo NAP (Task 7). El shape espeja
// la respuesta de admin-colegios/nap_revision_listar (la verdad vive ahí);
// acá solo se agrupa "por colegio y materia" (Step 2 del brief) y se marca
// qué nodos llegaron al tope de intentos del clasificador.

export type TemaOpcion = {
  id: string;
  nombre: string; // etiqueta corta NUESTRA (la que se lee en el <select>)
  eje: string;
  materia: string;
  texto_oficial: string | null; // la cita textual del NAP — la fuente de autoridad
};

export type NodoRevision = {
  id: string;
  nombre: string;
  descripcion: string | null; // lo que escribió/generó la autoría — contexto para decidir
  ejemplos: string[]; // hasta 3 enunciados reales del pool del nodo
  colegio: string;
  materia: string;
  grado: number | null;
  nap_tema_id: string | null;
  nap_confianza: number | null;
  nap_intentos: number;
  temas_posibles: TemaOpcion[];
};

// El backfill deja de tomar un nodo al llegar acá (migración 0030): con 3
// intentos y sin tema, ninguna máquina lo va a resolver sola.
export const NAP_INTENTOS_TOPE = 3;

export function alTope(n: Pick<NodoRevision, 'nap_intentos'>): boolean {
  return n.nap_intentos >= NAP_INTENTOS_TOPE;
}

export type GrupoRevision = { colegio: string; materia: string; nodos: NodoRevision[] };

// Agrupa preservando el orden de llegada (la Edge Function ya ordena por
// nap_intentos desc, así que dentro de cada grupo el que más lo necesita
// queda arriba). La clave sale de JSON.stringify del par [colegio, materia]:
// evita la colisión entre "A"+"BC" y "AB"+"C" sin recurrir a un separador de
// control (un byte NUL literal en el fuente vuelve binario el archivo entero
// para git — revisión del Hallazgo 2 de la Task 7).
export function agruparPorColegioMateria(nodos: NodoRevision[]): GrupoRevision[] {
  const mapa = new Map<string, GrupoRevision>();
  for (const n of nodos) {
    const key = JSON.stringify([n.colegio, n.materia]);
    let grupo = mapa.get(key);
    if (!grupo) {
      grupo = { colegio: n.colegio, materia: n.materia, nodos: [] };
      mapa.set(key, grupo);
    }
    grupo.nodos.push(n);
  }
  return [...mapa.values()];
}

// Texto de la confianza reportada por el clasificador, o "sin propuesta" si
// nunca llegó a mapear el nodo (nap_tema_id null desde el vamos).
export function textoConfianza(n: Pick<NodoRevision, 'nap_tema_id' | 'nap_confianza'>): string {
  if (!n.nap_tema_id || n.nap_confianza === null) return 'Sin propuesta';
  return `${Math.round(n.nap_confianza * 100)}% de confianza`;
}

// Agrupa el catálogo del <select> por materia (para <optgroup>), preservando
// el orden en que llegó (armarCatalogoGrado del server ya ordena materia →
// eje → tema).
export type GrupoTemas = { materia: string; temas: TemaOpcion[] };
export function agruparTemasPorMateria(temas: TemaOpcion[]): GrupoTemas[] {
  const mapa = new Map<string, TemaOpcion[]>();
  for (const t of temas) {
    const arr = mapa.get(t.materia);
    if (arr) arr.push(t);
    else mapa.set(t.materia, [t]);
  }
  return [...mapa.entries()].map(([materia, temasDeMateria]) => ({ materia, temas: temasDeMateria }));
}

// El tema actualmente elegido en el <select> de una fila (para mostrar su
// texto oficial en el panel de "qué dice el NAP" — D2 del brief).
export function temaPorId(temas: TemaOpcion[], id: string | null): TemaOpcion | null {
  if (!id) return null;
  return temas.find((t) => t.id === id) ?? null;
}
