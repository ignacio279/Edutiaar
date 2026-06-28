// Test de integración de la Edge Function `sol` (Fase 2 / SP-1).
// Pega a Claude REAL, así que además de los envs de Supabase necesita que la función
// tenga ANTHROPIC_API_KEY seteada como secret. Convención: si tenés la key, exportala
// también en el shell del test (ANTHROPIC_API_KEY) para que estos tests corran; si
// falta cualquier env, se saltean. Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = process.env.ANTHROPIC_API_KEY;
const skip = (URL && ANON && SR && KEY) ? false : 'faltan envs SUPABASE_* y/o ANTHROPIC_API_KEY (test live de SOL)';

const callFn = (name, body) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('sol: dado un programa sembrado, Claude usa leer_programa y devuelve texto', { skip }, async () => {
  // Tomamos un programa existente (solo lectura → idempotente, no toca la semilla).
  const prog = (await (await fetch(`${URL}/rest/v1/programa?select=id&limit=1`, {
    headers: { apikey: SR, Authorization: `Bearer ${SR}` },
  })).json())[0];
  assert.ok(prog?.id, 'existe al menos un programa sembrado');

  const r = await callFn('sol', { programa_id: prog.id });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(typeof j.texto === 'string' && j.texto.length > 0, 'devuelve texto no vacío');
  assert.ok(j.iters >= 2, 'al menos 2 iteraciones: pidió la tool y luego respondió');
});

test('sol: sin programa_id → 400', { skip }, async () => {
  const r = await callFn('sol', {});
  assert.equal(r.status, 400);
});
