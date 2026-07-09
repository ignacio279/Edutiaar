// Lectura en voz alta para pre-lectores (1°-2°). Usa la Web Speech API del
// navegador (SpeechSynthesis): gratis, on-device, funciona offline. `textoParaLeer`
// es PURO y unit-testeable; `hablar`/`puedeHablar` tocan el DOM (window.speechSynthesis).

// Arma el texto a leer: consigna + opciones. Puro (sin DOM).
export function textoParaLeer(enunciado: string, opciones: string[]): string {
  const consigna = (enunciado ?? '').trim();
  const ops = (opciones ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (!ops.length) return consigna;
  return consigna ? `${consigna}. Opciones: ${ops.join(', ')}.` : `Opciones: ${ops.join(', ')}.`;
}

// ¿El navegador puede hablar? Feature-detection (evita romper donde no hay TTS).
export function puedeHablar(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

// Elige una voz en español (preferencia es-AR); si no hay, la default del sistema.
function vozEspanol(): SpeechSynthesisVoice | null {
  try {
    const voces = window.speechSynthesis.getVoices();
    return voces.find((v) => /es[-_]AR/i.test(v.lang)) || voces.find((v) => /^es/i.test(v.lang)) || null;
  } catch {
    return null;
  }
}

// Lee un texto en voz alta (corta lo que estuviera diciendo). No-op si no hay TTS.
export function hablar(texto: string): void {
  if (!puedeHablar() || !texto.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-AR';
    u.rate = 0.95; // un toque más lento, para chicos
    const v = vozEspanol();
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch {
    /* sin audio: silencioso, no rompe la práctica */
  }
}
