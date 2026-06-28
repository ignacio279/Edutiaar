// Layout PURO del mapa del alumno: posiciones serpentina para N nodos + color por
// estado + saludo por materia. Sin DOM ni red → unit-testeable (igual que art.ts).

export type EstadoNodo = 'no_empezado' | 'en_construccion' | 'a_reforzar' | 'dominado';

const COLORES: Record<EstadoNodo, string> = {
  no_empezado: '#C9BCA6',
  en_construccion: '#E89B42',
  a_reforzar: '#D46A5A',
  dominado: '#7FB069',
};

// Color de un nodo según su estado; lo desconocido/ausente cae a 'no_empezado'.
export function estadoColor(estado: string | null | undefined): string {
  return COLORES[(estado ?? 'no_empezado') as EstadoNodo] ?? COLORES.no_empezado;
}

export const LEGEND: { label: string; c: string }[] = [
  { label: 'Lo domina', c: COLORES.dominado },
  { label: 'En camino', c: COLORES.en_construccion },
  { label: 'A reforzar', c: COLORES.a_reforzar },
  { label: 'Sin empezar', c: COLORES.no_empezado },
];

// Serpentina: N nodos en zig-zag dentro del viewBox 0..100. Las filas alternan
// izquierda→derecha / derecha→izquierda → un caminito tipo "juego de tablero".
// El orden del array sigue el recorrido (para que catmull dibuje el camino bien).
export function serpentine(n: number, perRow = 3): [number, number][] {
  if (n <= 0) return [];
  if (n === 1) return [[50, 50]];
  const marginX = 16;
  const marginY = 18;
  const rows = Math.ceil(n / perRow);
  const colGap = perRow > 1 ? (100 - marginX * 2) / (perRow - 1) : 0;
  const rowGap = rows > 1 ? (100 - marginY * 2) / (rows - 1) : 0;
  const coords: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const slot = row % 2 === 0 ? col : perRow - 1 - col; // zig-zag
    const x = perRow > 1 ? marginX + slot * colGap : 50;
    const y = rows > 1 ? marginY + row * rowGap : 50;
    coords.push([x, y]);
  }
  return coords;
}

// Saludo cálido de SOL para la pantalla de practicar (tono rioplatense).
export function saludoMateria(materia: string, alumno?: string): string {
  const hola = alumno ? `¡Hola ${alumno}!` : '¡Hola!';
  const m = materia || 'esto';
  return `${hola} Soy SOL. Cuando estés listo practicamos ${m} juntos: te muestro un dibujo y vos tocás la respuesta.`;
}
