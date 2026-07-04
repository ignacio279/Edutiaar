// Regla de dominio del nodo (spec 2026-07-03-puntaje-progresivo.md). DETERMINÍSTICA
// y pura: el motor progresivo (ELO-lite) acumula un puntaje 0..100 por cada primer
// intento y de ahí se deriva el estado del nodo, al cerrar la sesión. La IA NO
// interviene acá.

export type EstadoNodo = 'no_empezado' | 'en_construccion' | 'a_reforzar' | 'dominado';

export type RespuestaEval = { correcta: boolean; reintentos: number; tipo: string; dificultad: number };

// Valores de la regla (a validar con la docente; la FORMA no cambia).
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
