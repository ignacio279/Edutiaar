// Lógica pura de "Mis materias" (sin DOM, testeable con node --test):
// view-model del listado y validación de la confirmación de borrado.

export type EstadoMateria = 'borrador' | 'publicado';

export type SolMateriaFila = {
  id: string;
  programa_id: string;
  estado: EstadoMateria;
  created_at?: string;
  programa?: { grado?: number | null; materia?: { nombre?: string | null } | null } | null;
};

export type NodoLite = { id: string; programa_id: string; nombre: string; orden: number };

export type MateriaVista = {
  sol_materia_id: string;
  programa_id: string;
  nombre: string;
  grado: number;
  estado: EstadoMateria;
  nodos: NodoLite[];
};

// Join en memoria de sol_materia (+ programa/materia embebidos) con sus nodos.
// Descarta filas con el join roto (sin nombre o sin grado). Nodos por programa
// ordenados por `orden`. Orden del listado: borradores primero (trabajo
// pendiente a la vista), después publicadas; adentro por nombre y grado.
export function armarListadoMaterias(sms: SolMateriaFila[], nodos: NodoLite[]): MateriaVista[] {
  const porPrograma = new Map<string, NodoLite[]>();
  for (const n of nodos) {
    const lista = porPrograma.get(n.programa_id) ?? [];
    lista.push(n);
    porPrograma.set(n.programa_id, lista);
  }
  for (const lista of porPrograma.values()) lista.sort((a, b) => a.orden - b.orden);

  const vistas: MateriaVista[] = [];
  for (const sm of sms) {
    const nombre = sm.programa?.materia?.nombre;
    const grado = sm.programa?.grado;
    if (!nombre || grado == null) continue; // join roto: no se puede mostrar
    vistas.push({
      sol_materia_id: sm.id,
      programa_id: sm.programa_id,
      nombre,
      grado,
      estado: sm.estado,
      nodos: porPrograma.get(sm.programa_id) ?? [],
    });
  }
  vistas.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'borrador' ? -1 : 1;
    const porNombre = a.nombre.localeCompare(b.nombre, 'es');
    return porNombre !== 0 ? porNombre : a.grado - b.grado;
  });
  return vistas;
}

// trim + colapsa espacios internos + minúsculas + sin acentos (NFD).
export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// La confirmación de borrado exige tipear el nombre de la materia.
// Compara normalizado; lo vacío nunca confirma.
export function confirmaBorrado(nombreMateria: string, tipeado: string): boolean {
  const objetivo = normalizarNombre(nombreMateria);
  const escrito = normalizarNombre(tipeado);
  return escrito.length > 0 && escrito === objetivo;
}

// Espejo de la policy programa_delete_autor (0013): solo se borra en borrador.
export function puedeBorrar(estado: EstadoMateria): boolean {
  return estado === 'borrador';
}
