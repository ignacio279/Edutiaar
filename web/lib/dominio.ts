// Regla de dominio del nodo (spec 2026-06-28-evaluacion-y-dominio-de-nodos.md).
// DETERMINÍSTICA y pura: decide el estado del nodo a partir de la ventana reciente
// de respuestas del chico, al cerrar la sesión. La IA NO interviene acá.

export type EstadoNodo = 'no_empezado' | 'en_construccion' | 'a_reforzar' | 'dominado';

export type RespuestaEval = { correcta: boolean; reintentos: number; tipo: string; dificultad: number };

// Valores de la regla (a validar con la docente; la FORMA no cambia).
export const VENTANA = 8; // mira las últimas N respuestas del nodo
export const MIN_DOMINIO = 6; // aciertos al 1er intento (de la ventana) para dominar
export const MIN_PRODUCIR = 2; // de esos, cuántos de tipo 'producir' (cobertura)
export const DIF_DIFICIL = 3; // dificultad considerada "difícil"
export const PISO_REFORZAR = 0.5; // sesión por debajo de esto => a_reforzar

const esPrimerIntento = (r: RespuestaEval) => r.correcta && r.reintentos === 0;
// Peso para el puntaje: producir y difícil valen más (matan el adivinar).
const peso = (r: RespuestaEval) => r.dificultad * (r.tipo === 'producir' ? 2 : r.tipo === 'ordenar' ? 1.5 : 1);

// Puntaje 0..100: % al primer intento ponderado por tipo y dificultad (gradiente del mapa).
export function puntajeNodo(ventana: RespuestaEval[]): number {
  const total = ventana.reduce((s, r) => s + peso(r), 0);
  if (total === 0) return 0;
  const logrado = ventana.filter(esPrimerIntento).reduce((s, r) => s + peso(r), 0);
  return Math.round((logrado / total) * 100);
}

// Nuevo estado del nodo. `ventana` viene del más reciente al más viejo (máx 8).
// `tasaSesion` = aciertos/total de la sesión recién cerrada. `estadoActual` para no
// castigar (D5): un nodo ya `dominado` no se baja por la regla — el aflojamiento con
// el tiempo es el spec de decaimiento (Fase 2). Nunca vuelve a `no_empezado`.
export function calcularEstado(
  ventana: RespuestaEval[],
  tasaSesion: number,
  estadoActual: EstadoNodo = 'no_empezado',
): { estado: EstadoNodo; puntaje: number } {
  const puntaje = puntajeNodo(ventana);
  if (ventana.length === 0) return { estado: estadoActual, puntaje };
  if (estadoActual === 'dominado') return { estado: 'dominado', puntaje }; // sticky

  const recientes = ventana.slice(0, VENTANA);
  const primerIntento = recientes.filter(esPrimerIntento);
  const domina =
    primerIntento.length >= MIN_DOMINIO &&
    primerIntento.filter((r) => r.tipo === 'producir').length >= MIN_PRODUCIR &&
    primerIntento.filter((r) => r.dificultad >= DIF_DIFICIL).length >= 1;
  if (domina) return { estado: 'dominado', puntaje };

  // a_reforzar: las 2 más recientes fallaron al primer intento, o la sesión fue floja.
  const dosUltimasMal = recientes.length >= 2 && !esPrimerIntento(recientes[0]) && !esPrimerIntento(recientes[1]);
  if (dosUltimasMal || tasaSesion < PISO_REFORZAR) return { estado: 'a_reforzar', puntaje };

  return { estado: 'en_construccion', puntaje };
}

// Override docente (D6): si la seño fijó el estado a mano, la regla lo respeta — devuelve el
// estado manual y conserva el puntaje calculado (sigue alimentando el gradiente del mapa).
export function resolverEstado(
  calculo: { estado: EstadoNodo; puntaje: number },
  override: boolean,
  estadoManual: EstadoNodo,
): { estado: EstadoNodo; puntaje: number } {
  return override ? { estado: estadoManual, puntaje: calculo.puntaje } : calculo;
}
