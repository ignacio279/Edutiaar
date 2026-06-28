// Validadores PUROS de gestion-alumnos (crear/editar aulas y alumnos desde la docente).
// Sin Deno, sin DOM: se testean desde Node (tests/unit/gestion.test.mjs). La Edge
// Function (index.ts) los importa y es la FUENTE DE VERDAD de la validación; el front
// hace una versión liviana para feedback. No confiar nunca solo en el front (Rule 5).

// Set de avatares disponibles (claves de animal() en web/lib/art.ts).
export const AVATARES = ['fox', 'owl', 'turtle', 'cat', 'sheep'] as const;

export type Resultado = { ok: true } | { ok: false; error: string };

export function pinValido(pin: unknown): boolean {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export function avatarValido(a: unknown): boolean {
  return typeof a === 'string' && (AVATARES as readonly string[]).includes(a);
}

export function codigoNormalizado(c: unknown): string {
  return String(c ?? '').trim().toUpperCase();
}

function gradoValido(g: unknown): boolean {
  return typeof g === 'number' && Number.isInteger(g) && g >= 1 && g <= 7;
}

function noVacio(s: unknown): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

export function validarCrearAula(d: { nombre?: unknown; codigo?: unknown; secreto?: unknown; grado?: unknown }): Resultado {
  if (!noVacio(d.nombre)) return { ok: false, error: 'Poné un nombre para el aula.' };
  if (!noVacio(codigoNormalizado(d.codigo))) return { ok: false, error: 'Poné un código para el aula.' };
  if (!noVacio(d.secreto)) return { ok: false, error: 'Poné un secreto para el aula.' };
  if (d.grado !== undefined && d.grado !== null && !gradoValido(d.grado)) return { ok: false, error: 'El grado tiene que ser de 1 a 7.' };
  return { ok: true };
}

export function validarCrearAlumno(d: {
  nombre?: unknown; avatar?: unknown; grado?: unknown; pin?: unknown; aula_id?: unknown;
}): Resultado {
  if (!noVacio(d.nombre)) return { ok: false, error: 'Poné el nombre del alumno.' };
  if (!avatarValido(d.avatar)) return { ok: false, error: 'Elegí un avatar.' };
  if (!gradoValido(d.grado)) return { ok: false, error: 'El grado tiene que ser de 1 a 7.' };
  if (!pinValido(d.pin)) return { ok: false, error: 'El PIN tiene que ser de 4 dígitos.' };
  if (!noVacio(d.aula_id)) return { ok: false, error: 'Elegí un aula.' };
  return { ok: true };
}
