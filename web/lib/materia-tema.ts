// Identidad visual de una materia a partir de su NOMBRE (las materias reales
// vienen de la DB por nombre, no por la clave fija del mock). Devuelve color +
// tinte + borde + claves de emblema/patrón (que consumen art.materiaEmblem /
// art.materiaPattern). Materias conocidas matchean por nombre; las desconocidas
// caen, de forma DETERMINÍSTICA por nombre, a uno de los temas (mismo nombre →
// mismo color en todas las pantallas).
//
// Standalone a propósito (no importa de art): Next quiere el import sin extensión
// y `node --test` lo quiere con .ts. Igual criterio que panel.ts. El componente
// pasa las claves emblem/pattern a las funciones de art.ts.

export type TemaMateria = {
  color: string;
  tint: string;
  tintBorder: string;
  emblem: string; // clave para art.materiaEmblem
  pattern: string; // clave para art.materiaPattern
};

const LENGUA: TemaMateria = { color: '#F4A93B', tint: '#FBEFD9', tintBorder: '#F4D9A6', emblem: 'lengua', pattern: 'lengua' };
const MATE: TemaMateria = { color: '#6FB7D4', tint: '#E3EEF4', tintBorder: '#BFDCEA', emblem: 'mate', pattern: 'mate' };
const CIENCIAS: TemaMateria = { color: '#7FB069', tint: '#E6F0DC', tintBorder: '#C2DBB0', emblem: 'ciencias', pattern: 'ciencias' };

// Orden del ciclo de fallback para nombres desconocidos.
const TEMAS: TemaMateria[] = [LENGUA, MATE, CIENCIAS];

// Suma de códigos de caracter → índice estable por nombre (determinístico).
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function temaMateria(nombre: string): TemaMateria {
  const n = (nombre || '').toLowerCase();
  if (n.includes('lengua') || n.includes('lectura') || n.includes('lectoescritura') || n.includes('práctica del lenguaje') || n.includes('practica del lenguaje')) return LENGUA;
  if (n.includes('matem')) return MATE;
  if (n.includes('cienci') || n.includes('natural') || n.includes('ambient')) return CIENCIAS;
  return TEMAS[hash(n) % TEMAS.length];
}

// Claves de ícono de nodo en orden de recorrido (espejo de art.NODE_ICON_KEYS;
// duplicado acá para mantener este módulo standalone/testeable).
const ICON_KEYS = [
  'vocales', 'silabas', 'palabras', 'oraciones', 'lectura', 'cuento',
  'numeros', 'contar', 'sumar', 'restar', 'figuras', 'problemas',
  'animales', 'plantas', 'cuerpo', 'agua', 'clima', 'tierra',
];

// Clave de ícono para el nodo en posición `index` (cicla la lista). El componente
// la pasa a art.nodeIcon(...).
export function iconoNodo(index: number): string {
  const len = ICON_KEYS.length;
  return ICON_KEYS[(((index % len) + len) % len)];
}
