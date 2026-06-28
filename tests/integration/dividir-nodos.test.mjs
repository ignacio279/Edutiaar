// Tests de integración de la autoría docente (Fase 2 / SP-2): Edge Function
// `dividir-nodos` + RLS de sol_materia/nodo. Corren en modo MOCK → NO necesitan
// ANTHROPIC_API_KEY (sí los envs de Supabase; si faltan, se saltean).
// Idempotentes: crean docentes/materia/programa efímeros y los borran. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const ESCUELA = '11111111-1111-4111-8111-111111111111'; // escuela semilla (scripts/seed.mjs)
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFnAuth = (name, body, token) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Crea un docente efímero y devuelve { id, access_token }.
async function nuevoDocente() {
  const email = `doc-${rnd()}@docentes.edutia.local`;
  const password = rnd();
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: srHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const id = (await cr.json()).id;
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...srHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol: 'docente', nombre: 'Test Seño', escuela_id: ESCUELA }]),
  });
  const tok = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token: tok.access_token };
}

const patchSolMateria = (id, body, token) => fetch(`${URL}/rest/v1/sol_materia?id=eq.${id}`, {
  method: 'PATCH',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(body),
});

test('dividir-nodos (mock): genera sol_materia + nodos borrador; RLS solo deja al dueño publicar', { skip }, async () => {
  const materiaNombre = `TEST-${rnd()}`;
  let docente, otro, programaId, materiaId;
  try {
    docente = await nuevoDocente();
    assert.ok(docente.access_token, 'el docente efímero obtuvo sesión');

    // 1. Generar (modo mock → sin API key)
    const r = await callFnAuth('dividir-nodos', {
      materia_nombre: materiaNombre, grado: 3, contenido: 'Vocales, sílabas, palabras', mock: true,
    }, docente.access_token);
    assert.equal(r.status, 200);
    const j = await r.json();
    programaId = j.programa_id;
    materiaId = j.materia_id;
    assert.ok(j.sol_materia_id && programaId && materiaId, 'devuelve ids');
    assert.equal(j.nodos.length, 3, '3 nodos del contenido');

    // 2. Quedó como borrador (leído con service_role)
    const sm = await (await fetch(`${URL}/rest/v1/sol_materia?id=eq.${j.sol_materia_id}&select=estado,docente_id`, { headers: srHeaders() })).json();
    assert.equal(sm[0].estado, 'borrador');
    assert.equal(sm[0].docente_id, docente.id);

    // 3. RLS: OTRO docente NO puede publicar lo del primero
    otro = await nuevoDocente();
    const ajeno = await patchSolMateria(j.sol_materia_id, { estado: 'publicado' }, otro.access_token);
    assert.deepEqual(await ajeno.json(), [], 'otro docente no toca sol_materia ajeno');

    // 4. El dueño SÍ puede publicar
    const propio = await patchSolMateria(j.sol_materia_id, { estado: 'publicado' }, docente.access_token);
    const upd = await propio.json();
    assert.equal(upd.length, 1);
    assert.equal(upd[0].estado, 'publicado', 'el dueño publica');
  } finally {
    // Borrar el programa cascadea nodos + sol_materia; borrar materia y users.
    if (programaId) await fetch(`${URL}/rest/v1/programa?id=eq.${programaId}`, { method: 'DELETE', headers: srHeaders() });
    if (materiaId) await fetch(`${URL}/rest/v1/materia?id=eq.${materiaId}`, { method: 'DELETE', headers: srHeaders() });
    for (const d of [docente, otro]) {
      if (d?.id) await fetch(`${URL}/auth/v1/admin/users/${d.id}`, { method: 'DELETE', headers: srHeaders() });
    }
  }
});

test('dividir-nodos: sin usuario (solo apikey anon) → 401', { skip }, async () => {
  const r = await callFnAuth('dividir-nodos', { materia_nombre: 'X', grado: 3, contenido: 'a, b', mock: true }, ANON);
  assert.equal(r.status, 401);
});
