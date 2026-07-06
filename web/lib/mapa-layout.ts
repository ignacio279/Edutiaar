// Layout PURO del mapa del alumno: posiciones serpentina para N nodos + color por
// estado + saludo por materia. Sin DOM ni red → unit-testeable (igual que art.ts).

export type EstadoNodo = 'no_empezado' | 'en_construccion' | 'a_reforzar' | 'dominado';

export const COLORES: Record<EstadoNodo, string> = {
  no_empezado: '#C9BCA6',
  en_construccion: '#E89B42',
  a_reforzar: '#D46A5A',
  dominado: '#7FB069',
};

// Color de un nodo según su estado; lo desconocido/ausente cae a 'no_empezado'.
export function estadoColor(estado: string | null | undefined): string {
  return COLORES[(estado ?? 'no_empezado') as EstadoNodo] ?? COLORES.no_empezado;
}

// Mezcla lineal de dos colores hex (#rrggbb). t en [0,1].
export function mezclarColor(a: string, b: string, t: number): string {
  const ca = a.replace('#', ''), cb = b.replace('#', '');
  const canal = (i: number) => Math.round(parseInt(ca.slice(i, i + 2), 16) * (1 - t) + parseInt(cb.slice(i, i + 2), 16) * t);
  return `#${[0, 2, 4].map((i) => canal(i).toString(16).padStart(2, '0')).join('')}`;
}

// Color del nodo en el mapa: los estados con significado propio (dominado,
// a_reforzar, no_empezado) mantienen su color; en_construccion es un GRADIENTE
// que se acerca al verde de dominado a medida que crece el puntaje del motor.
export function colorNodo(estado: string | null | undefined, puntaje = 0): string {
  if (estado === 'en_construccion') {
    return mezclarColor(COLORES.en_construccion, COLORES.dominado, Math.min(100, Math.max(0, puntaje)) / 100);
  }
  return estadoColor(estado);
}

// Parada sugerida para "practicar": la primera no dominada en el camino (frontera de
// avance), o la primera si ya domina todo.
export function nodoMasAvanzado<T extends { id: string; estado: string }>(nodos: T[]): string | null {
  if (!nodos.length) return null;
  const pendiente = nodos.find((n) => n.estado !== 'dominado');
  return (pendiente || nodos[0]).id;
}

export const LEGEND: { label: string; c: string }[] = [
  { label: 'Lo domina', c: COLORES.dominado },
  { label: 'En camino', c: COLORES.en_construccion },
  { label: 'A reforzar', c: COLORES.a_reforzar },
  { label: 'Sin empezar', c: COLORES.no_empezado },
];

// Layout del mapa. Hasta 6 paradas: coordenadas hand-tuned del diseño dentro del
// contenedor de aspecto fijo (altoPx = null → el caller usa su aspectRatio).
// Con más de 6: serpentina en zig-zag con PASO FIJO EN PX por fila — el alto del
// contenedor crece con las filas (la pantalla scrollea) y los círculos, que tienen
// tamaño fijo en px, nunca se pisan por más nodos que haya.
export type MapaLayout = { coords: [number, number][]; altoPx: number | null };

// Paso vertical y margen (px) por consumidor: el mapa grande del alumno
// (círculos ~94px + etiqueta) y el chico del panel docente (~64px).
export const ESCALAS_MAPA = {
  alumno: { pitch: 175, margen: 95 },
  docente: { pitch: 125, margen: 72 },
} as const;
export type EscalaMapa = keyof typeof ESCALAS_MAPA;

// Coordenadas hand-tuned del diseño (hasta 6 paradas),
// [x,y] en el viewBox 0..100, en orden de recorrido (para que catmull dibuje bien).
const COORDS_CAMINO: [number, number][] = [
  [14, 22], [36, 40], [58, 25], [81, 44], [60, 68], [33, 80],
];

// Serpentina alta: x en % (zig-zag por fila), y en % de un alto calculado en px.
// El camino baja de a poco TAMBIÉN dentro de cada fila (`bajada` px por parada,
// siguiendo el recorrido) para que no queden tres nodos alineados; en la vuelta
// de fila el salto vertical sigue siendo exactamente `pitch` px (los círculos,
// de tamaño fijo, no se pisan). El orden sigue el recorrido.
function serpentinaAlta(n: number, perRow: number, escala: EscalaMapa): MapaLayout {
  const { pitch, margen } = ESCALAS_MAPA[escala];
  const bajada = pitch / 5; // descenso por parada dentro de la fila
  const rowStep = pitch + (perRow - 1) * bajada; // así la vuelta conserva `pitch` libre
  const rows = Math.ceil(n / perRow);
  const lastCol = (n - 1) % perRow;
  const altoPx = margen * 2 + (rows - 1) * rowStep + lastCol * bajada;
  const marginX = 16;
  const colGap = perRow > 1 ? (100 - marginX * 2) / (perRow - 1) : 0;
  const coords: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow; // avance dentro de la fila, en orden de recorrido
    const slot = row % 2 === 0 ? col : perRow - 1 - col; // zig-zag
    const x = perRow > 1 ? marginX + slot * colGap : 50;
    const y = ((margen + row * rowStep + col * bajada) / altoPx) * 100;
    coords.push([x, y]);
  }
  return { coords, altoPx };
}

export function layoutCamino(n: number, escala: EscalaMapa = 'alumno'): MapaLayout {
  if (n <= 0) return { coords: [], altoPx: null };
  if (n <= COORDS_CAMINO.length) return { coords: COORDS_CAMINO.slice(0, n), altoPx: null };
  return serpentinaAlta(n, 3, escala);
}

// Saludo cálido de SOL para la pantalla de practicar (tono rioplatense).
export function saludoMateria(materia: string, alumno?: string): string {
  const hola = alumno ? `¡Hola ${alumno}!` : '¡Hola!';
  const m = materia || 'esto';
  return `${hola} Soy SOL. Cuando estés listo practicamos ${m} juntos: te muestro un dibujo y vos tocás la respuesta.`;
}
