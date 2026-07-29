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

// Texto a leer según el formato del ejercicio. Puro. 'escribir' lee SOLO la consigna (no
// la respuesta). Para 'ordenar'/'unir' hay que pasar los items YA en el orden en que se
// MUESTRAN (mezclado), para no regalar la solución al leerla.
export function textoEjercicio(params: {
  enunciado: string;
  formato?: string | null;
  opciones?: string[]; // formato 'opciones'
  fichas?: string[]; // formato 'ordenar' (mezcladas)
  izq?: string[]; // formato 'unir', columna A
  der?: string[]; // formato 'unir', columna B (mezclada)
}): string {
  const consigna = (params.enunciado ?? '').trim();
  const limpiar = (xs?: string[]) => (xs ?? []).map((x) => String(x).trim()).filter(Boolean);
  switch (params.formato) {
    case 'escribir':
      return consigna;
    case 'ordenar': {
      const fichas = limpiar(params.fichas);
      if (!fichas.length) return consigna;
      return consigna ? `${consigna}. Fichas: ${fichas.join(', ')}.` : `Fichas: ${fichas.join(', ')}.`;
    }
    case 'unir': {
      const izq = limpiar(params.izq);
      const der = limpiar(params.der);
      const parts = [consigna];
      if (izq.length) parts.push(`Columna A: ${izq.join(', ')}.`);
      if (der.length) parts.push(`Columna B: ${der.join(', ')}.`);
      return parts.filter(Boolean).join(' ');
    }
    default: // 'opciones' (o desconocido): consigna + opciones
      return textoParaLeer(consigna, params.opciones ?? []);
  }
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
