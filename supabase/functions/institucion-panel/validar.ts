// Validadores y agregadores PUROS de institucion-panel (Alumno golondrina,
// WP-C): el panel del admin de INSTITUCIÓN. Sin Deno, sin DOM: se testean
// desde Node (tests/unit/licencias.test.mjs).
//
// REGLA INQUEBRANTABLE (0025): este panel JAMÁS devuelve datos de alumnos
// individuales — ni nombres, ni ids, ni legajos. Todo lo que sale de acá son
// NÚMEROS ya agregados; las métricas de desempeño llevan el mismo k-anonimato
// k=5 del observatorio (D-OA3 — la constante se replica porque las fns no
// comparten archivos entre sí, solo _shared).
import { esProvinciaValida } from '../_shared/provincias.ts';
import { validarIdentidad, type IdentidadEntrada } from '../_shared/identidad.ts';

export type Resultado = { ok: true } | { ok: false; error: string };

export const K_ANONIMATO = 5;

const noVacio = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

// ── Alta de colegio (espejo acotado de admin-colegios/validar.ts) ───────────

export const TIPOS_COLEGIO = ['rural', 'unidocente', 'plurigrado'] as const;
export const TRIAL_DIAS = 30;

export function tipoColegioValido(t: unknown): boolean {
  return typeof t === 'string' && (TIPOS_COLEGIO as readonly string[]).includes(t);
}

export function validarColegioCrear(d: {
  nombre?: unknown; provincia?: unknown; tipo?: unknown;
} & IdentidadEntrada): Resultado {
  if (!noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  // Provincia opcional (eje del observatorio); si viene, tiene que ser real.
  if (d.provincia !== undefined && d.provincia !== null && !esProvinciaValida(d.provincia)) {
    return { ok: false, error: 'provincia_invalida' };
  }
  if (d.tipo !== undefined && d.tipo !== null && !tipoColegioValido(d.tipo)) {
    return { ok: false, error: 'tipo_invalido' };
  }
  // Identidad oficial (0033): opcional acá también, con las MISMAS reglas que
  // el alta de plataforma — el CUE no puede depender de por dónde entró.
  return validarIdentidad(d);
}

// Flags default de escuela_feature — copia literal de features_default() (0018),
// igual que en admin-colegios (el alta institucional no puede dejar un colegio
// sin fila de features cuando el alta de plataforma sí la crea).
export const FEATURES_DEFAULT = {
  sol: true,
  luna: { activa: true, alertas: true, boletines: true, chat: true },
  terra: false,
} as const;

// Fechas del trial en UTC (yyyy-mm-dd): arranca hoy, vence a los 30 días.
export function fechasTrial(hoy: Date): { trial_inicio: string; trial_fin: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const fin = new Date(hoy.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000);
  return { trial_inicio: iso(hoy), trial_fin: iso(fin) };
}

// ── Alta de docente (patrón admin-maestras) ─────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarDocenteCrear(d: {
  escuela_id?: unknown; nombre?: unknown; email?: unknown;
}): Resultado {
  if (!noVacio(d.escuela_id)) return { ok: false, error: 'escuela_requerida' };
  if (!noVacio(d.nombre)) return { ok: false, error: 'nombre_vacio' };
  if (typeof d.email !== 'string' || !EMAIL_RE.test(d.email.trim())) {
    return { ok: false, error: 'email_invalido' };
  }
  return { ok: true };
}

export function emailNormalizado(e: unknown): string {
  return String(e ?? '').trim().toLowerCase();
}

// Password temporal legible, copia del patrón admin-maestras (una vez, jamás
// persistida — el canal primario es el link de recovery).
export const PALABRAS = [
  'sol', 'luna', 'rio', 'monte', 'nube', 'flor', 'faro', 'lago',
  'puma', 'tero', 'ceibo', 'trigo', 'viento', 'brote', 'cielo', 'campo',
  'hornero', 'zorro', 'yerba', 'sauce', 'junco', 'cobre', 'duende', 'tilo',
] as const;

export type Azar = (max: number) => number;

function azarCrypto(max: number): number {
  const limite = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limite);
  return n % max;
}

export function generarPasswordTemporal(azar: Azar = azarCrypto): string {
  const palabras = Array.from({ length: 3 }, () => PALABRAS[azar(PALABRAS.length)]);
  const digitos = Array.from({ length: 3 }, () => String(azar(10))).join('');
  return `${palabras.join('-')}-${digitos}`;
}

// ── Desempeño contra el marco NAP ───────────────────────────────────────────
// La precisión cruda POR COLEGIO se retiró de este panel (2026-08-18): no es
// comparable entre colegios —distintos grados, distintos nodos y dificultad
// adaptativa por chico— y acá la miraba justo quien tiene poder de ranking
// sobre esas escuelas. El aprendizaje se mide contra la vara fija de los NAP,
// con el mismo k-anonimato de siempre (lo aplica _shared/observatorio-logica.ts).

export const MATERIAS_NAP = ['Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales'] as const;

// `grado` es obligatorio y entero: los temas de los NAP se definen POR grado,
// mezclarlos juntaría contenidos distintos bajo un mismo nombre. La materia se
// valida contra las cuatro del marco (el front usa chips, nunca tipea).
export function validarDesempeno(d: { materia?: unknown; grado?: unknown }): Resultado {
  if (!noVacio(d.materia)) return { ok: false, error: 'falta_materia' };
  if (!(MATERIAS_NAP as readonly string[]).includes(d.materia.trim())) {
    return { ok: false, error: 'materia_invalida' };
  }
  if (!Number.isInteger(d.grado) || (d.grado as number) < 1 || (d.grado as number) > 7) {
    return { ok: false, error: 'grado_invalido' };
  }
  return { ok: true };
}
