// Aula configurada en el device (localStorage). Solo cliente.
const AULA_LS = 'edutia_aula';

export type Aula = { codigo: string; secreto: string };

export function getAula(): Aula | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(AULA_LS) || 'null');
  } catch {
    return null;
  }
}

export function setAula(a: Aula) {
  localStorage.setItem(AULA_LS, JSON.stringify(a));
}

export function clearAula() {
  localStorage.removeItem(AULA_LS);
}
