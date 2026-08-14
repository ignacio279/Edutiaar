import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

test('el catálogo NAP no es legible por anon', async () => {
  for (const tabla of ['nap_eje', 'nap_tema']) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const cuerpo = await r.json();
    // RLS sin policies: 200 con [] o 401/403. Lo que NO puede pasar es que
    // devuelva filas.
    const filas = Array.isArray(cuerpo) ? cuerpo : [];
    assert.equal(filas.length, 0, `${tabla} filtró filas a anon`);
  }
});

test('admin-observatorio sigue exigiendo un admin', async () => {
  const r = await fetch(`${URL}/functions/v1/admin-observatorio`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'desempeno', materia: 'Matemática', grado: 4 }),
  });
  assert.ok(r.status === 401 || r.status === 403, `esperaba 401/403, vino ${r.status}`);
});
