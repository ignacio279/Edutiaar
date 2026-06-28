// Smoke del Claude Agent SDK sobre la suscripción (Etapa 2 local). Explora la forma
// de los mensajes para confirmar que el motor anda sin API key. Borrable después.
//   node scripts/sol-smoke.mjs
import { query } from '@anthropic-ai/claude-agent-sdk';

const prompt = 'Respondé únicamente con la palabra: OK';

try {
  let texto = '';
  for await (const m of query({ prompt, options: { allowedTools: [], maxTurns: 1, model: 'claude-sonnet-4-6' } })) {
    console.log('--- message.type:', m.type, m.subtype ? `(${m.subtype})` : '');
    if (m.type === 'assistant') {
      for (const b of m.message?.content ?? []) {
        if (b.type === 'text') { texto += b.text; console.log('   text:', JSON.stringify(b.text)); }
      }
    }
    if (m.type === 'result') {
      console.log('   result:', JSON.stringify(m.result ?? m));
    }
  }
  console.log('\n=== TEXTO FINAL ===');
  console.log(texto.trim());
  console.log('=== SMOKE OK ===');
} catch (e) {
  console.error('SMOKE FALLÓ:', e?.message ?? e);
  process.exit(1);
}
