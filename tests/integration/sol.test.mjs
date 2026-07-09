// Test de integración de la Edge Function `sol` (Fase 2 / SP-1).
// Desde 2026-07 `sol` está ENDURECIDA (verify_jwt=true + getUser adentro): era un
// endpoint público sin uso en el front y, sin auth, un vector de costo Claude.
// Estos tests verifican que ya NO se puede llamar sin sesión. No pegan a Claude,
// así que solo necesitan los envs de Supabase. Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = (URL && ANON) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY';

const callSol = (auth) => fetch(`${URL}/functions/v1/sol`, {
  method: 'POST',
  headers: { apikey: ANON, ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json' },
  body: JSON.stringify({ programa_id: '00000000-0000-0000-0000-000000000000' }),
});

test('sol: con la anon key del front (sin sesión) → rechazado, no gasta Claude', { skip }, async () => {
  const r = await callSol(ANON);
  assert.equal(r.status, 401, 'la anon key no alcanza para llamar a sol');
});

test('sol: sin Authorization → rechazado por el gate', { skip }, async () => {
  const r = await callSol(null);
  assert.equal(r.status, 401);
});
