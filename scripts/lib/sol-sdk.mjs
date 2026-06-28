// Wrapper del Claude Agent SDK para los generadores LOCALES (Etapa 2, MVP local).
// Usa la SUSCRIPCIÓN de Claude Code del usuario (no API key) → generación costo cero
// para desarrollo. Headless, sin tools (solo generación de texto).
import { query } from '@anthropic-ai/claude-agent-sdk';

// Corre un prompt one-shot y devuelve el texto final de Claude.
export async function generar({ system, user, model = 'claude-sonnet-4-6' }) {
  const prompt = system ? `${system}\n\n${user}` : user;
  let out = '';
  for await (const m of query({ prompt, options: { allowedTools: [], maxTurns: 1, model } })) {
    if (m.type === 'result' && m.subtype === 'success') out = m.result ?? out;
    else if (m.type === 'assistant') {
      for (const b of m.message?.content ?? []) if (b.type === 'text') out += b.text;
    }
  }
  return out.trim();
}

// Extrae un objeto/array JSON de la respuesta (saca fences ```json y recorta al JSON).
export function extraerJSON(texto) {
  let t = (texto ?? '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const starts = ['{', '['].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

// Genera + parsea con 1 reintento si el JSON viene mal.
export async function generarJSON({ system, user, model }, parse) {
  for (let intento = 0; intento < 2; intento++) {
    const texto = await generar({ system, user, model });
    try {
      return parse(extraerJSON(texto));
    } catch (e) {
      if (intento === 1) throw new Error(`No se pudo parsear la salida de Claude: ${e.message}`);
    }
  }
}
