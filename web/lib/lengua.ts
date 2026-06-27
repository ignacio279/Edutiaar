// Contenido estático de Lengua para el mapa (verbatim de frontend/app/app.js).
// Los nodos reales vienen en una etapa posterior (SOL). Por ahora, muestra.

export const SC = {
  domina: '#7FB069',
  camino: '#E89B42',
  reforzar: '#D46A5A',
  bloqueado: '#C9BCA6',
} as const;

export const COORDS: number[][] = [
  [14, 22],
  [36, 40],
  [58, 25],
  [81, 44],
  [60, 68],
  [33, 80],
];

export const LENGUA = {
  nombre: 'Lengua',
  color: '#F4A93B',
  labels: ['Vocales', 'Sílabas', 'Palabras', 'Oraciones', 'Lectura', 'Cuento'],
  icons: ['vocales', 'silabas', 'palabras', 'oraciones', 'lectura', 'cuento'],
  states: ['domina', 'domina', 'reforzar', 'camino', 'bloqueado', 'bloqueado'] as Array<
    keyof typeof SC
  >,
  greeting:
    '¡Hola! Soy SOL. Cuando esté listo, vamos a practicar Lengua juntos: te voy a mostrar un dibujo y vos tocás la respuesta.',
};

export const LEGEND = [
  { label: 'Lo domina', c: '#7FB069' },
  { label: 'En camino', c: '#E89B42' },
  { label: 'A reforzar', c: '#D46A5A' },
  { label: 'Bloqueado', c: '#C9BCA6' },
];
