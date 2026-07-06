// Persistencia local de la tanda de práctica en curso (mismo dispositivo): si el
// chico sale a mitad de tanda, al volver retoma donde quedó — mismos ejercicios,
// respuestas ya dadas y chat completo. Clave por alumno+nodo (los dispositivos de
// la escuela son compartidos: sin alumno_id en la clave, la tanda de un chico se
// filtraría al que loguea después). El storage es inyectable → unit-testeable sin DOM.

import type { Ejercicio, RespuestaReg } from './practica';

export type MsgGuardado = { who: 'sol' | 'kid'; kind: 'text' | 'q'; text?: string; ejIdx?: number };

export type ProgresoTanda = {
  v: 1;
  ejercicios: Ejercicio[];
  idx: number;
  reintentos: number;
  respuestas: RespuestaReg[];
  msgs: MsgGuardado[];
  chatCount: number;
  nodoNombre: string;
  materia: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // navegador con storage bloqueado (modo privado estricto)
  }
}

export function claveProgreso(alumnoId: string, nodoId: string): string {
  return `edutia:practica:${alumnoId}:${nodoId}`;
}

export function guardarProgreso(
  alumnoId: string,
  nodoId: string,
  p: Omit<ProgresoTanda, 'v'>,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(claveProgreso(alumnoId, nodoId), JSON.stringify({ ...p, v: 1 }));
  } catch {
    /* storage lleno o bloqueado: la tanda sigue, solo que sin resume */
  }
}

export function leerProgreso(
  alumnoId: string,
  nodoId: string,
  storage: StorageLike | null = defaultStorage(),
): ProgresoTanda | null {
  if (!storage) return null;
  const clave = claveProgreso(alumnoId, nodoId);
  const raw = storage.getItem(clave);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as ProgresoTanda;
    const valido =
      p && p.v === 1 &&
      Array.isArray(p.ejercicios) && p.ejercicios.length > 0 &&
      Number.isInteger(p.idx) && p.idx >= 0 && p.idx < p.ejercicios.length &&
      Array.isArray(p.respuestas) && Array.isArray(p.msgs) && p.msgs.length > 0;
    if (!valido) {
      storage.removeItem(clave);
      return null;
    }
    return p;
  } catch {
    storage.removeItem(clave); // JSON roto: mejor tanda nueva que pantalla rota
    return null;
  }
}

export function borrarProgreso(
  alumnoId: string,
  nodoId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(claveProgreso(alumnoId, nodoId));
  } catch {
    /* nada que hacer */
  }
}
