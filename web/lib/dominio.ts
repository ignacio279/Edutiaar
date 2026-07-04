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

// ── Motor ELO-lite (spec 2026-07-03-puntaje-progresivo) ───────────────────────
// El puntaje del nodo (0..100) se mueve con cada PRIMER intento: acertar algo
// más difícil que tu nivel suma mucho; acertar lo fácil casi nada; bajar resta
// la mitad (asimetría pro-motivación, DP3). Determinístico, sin IA (DP1).

export const K_ELO = 8; // paso base
export const ESCALA_ELO = 40; // sensibilidad de lo "esperado"
export const DIVISOR_BAJA = 2; // bajar cuesta la mitad que subir

// Peso por tipo (producir y ordenar valen más). La dificultad NO entra acá:
// ya entra vía `esperado` (si no, contaría doble).
export function pesoTipo(tipo: string): number {
  return tipo === 'producir' ? 2 : tipo === 'ordenar' ? 1.5 : 1;
}

// Probabilidad esperada de acertar al primer intento, según puntaje vs dificultad.
export function esperado(puntaje: number, dificultad: number): number {
  const nivel = dificultad * 25; // 1→25, 2→50, 3→75
  return 1 / (1 + Math.pow(10, (nivel - puntaje) / ESCALA_ELO));
}

// Un paso del motor. Solo el primer intento cuenta: acierto limpio = 1, el resto = 0
// (si acertó con reintentos, el primer intento igual falló).
export function aplicarRespuesta(puntaje: number, r: RespuestaEval): number {
  const resultado = esPrimerIntento(r) ? 1 : 0;
  let delta = K_ELO * pesoTipo(r.tipo) * (resultado - esperado(puntaje, r.dificultad));
  if (delta < 0) delta = delta / DIVISOR_BAJA;
  return Math.min(100, Math.max(0, puntaje + delta));
}

// Replay de una sesión completa (en orden cronológico) sobre el puntaje persistido.
export function puntajeSesion(inicial: number, cronologicas: RespuestaEval[]): number {
  const fin = cronologicas.reduce((p, r) => aplicarRespuesta(p, r), inicial);
  return Math.round(fin * 100) / 100;
}

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

// ── Estados derivados del puntaje (DP2) ───────────────────────────────────────
export const UMBRAL_DOMINIO = 70; // puntaje mínimo para dominar
export const MIN_EJERCICIOS_DOMINIO = 50; // constancia: ejercicios respondidos (DP4)

// Cobertura HISTÓRICA (todas las respuestas del chico en el nodo, no ventana):
// cuántos `producir` y cuántos difíciles acertó al primer intento.
export function coberturaHistorica(todas: RespuestaEval[]): { producir: number; dificil: number } {
  const limpios = todas.filter(esPrimerIntento);
  return {
    producir: limpios.filter((r) => r.tipo === 'producir').length,
    dificil: limpios.filter((r) => r.dificultad >= DIF_DIFICIL).length,
  };
}

// Señal "se está trabando AHORA": las 2 últimas respuestas de la sesión fallaron
// al primer intento. Recibe la sesión en orden cronológico.
export function dosUltimasMal(cronologicas: RespuestaEval[]): boolean {
  const n = cronologicas.length;
  if (n < 2) return false;
  return !esPrimerIntento(cronologicas[n - 1]) && !esPrimerIntento(cronologicas[n - 2]);
}

// Estado derivado del puntaje + señales. `dominado` es hito pegajoso (DP2):
// una vez alcanzado, solo lo tocan el override docente y el decaimiento (spec aparte).
export function calcularEstadoProgresivo(args: {
  puntaje: number;
  totalRespondidos: number;
  cobertura: { producir: number; dificil: number };
  dosUltimasMal: boolean;
  tasaSesion: number;
  estadoActual?: EstadoNodo;
}): EstadoNodo {
  const { puntaje, totalRespondidos, cobertura, estadoActual = 'no_empezado' } = args;
  if (estadoActual === 'dominado') return 'dominado'; // pegajoso
  if (totalRespondidos === 0) return 'no_empezado';
  const domina =
    puntaje >= UMBRAL_DOMINIO &&
    totalRespondidos >= MIN_EJERCICIOS_DOMINIO &&
    cobertura.producir >= MIN_PRODUCIR &&
    cobertura.dificil >= 1;
  if (domina) return 'dominado';
  if (args.dosUltimasMal || args.tasaSesion < PISO_REFORZAR) return 'a_reforzar';
  return 'en_construccion';
}
