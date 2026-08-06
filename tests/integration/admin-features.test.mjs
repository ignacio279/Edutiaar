// Tests de integración de features por colegio (WP4, Dashboard admin v3):
// RLS de escuela_feature (la docente LEE solo la suya, no escribe nada) y
// mi_acceso() reflejando los flags reales del colegio.
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

const FLAGS_DOCENTE = { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: true }, terra: false };
const FLAGS_BASICO = { sol: true, luna: { activa: false, alertas: false, boletines: false, chat: false }, terra: false };

async function nuevoUsuario(escuelaId, rol) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId }]),
  });
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];

const borrarUser = (id) =>
  fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: sr() });
const borrarSR = (table, filtro) =>
  fetch(`${URL}/rest/v1/${table}?${filtro}`, { method: 'DELETE', headers: sr() });

test('escuela_feature: RLS de lectura, escritura vedada y mi_acceso() con flags reales', { skip }, async () => {
  let escA, escB, doc;
  try {
    escA = await insSR('escuela', { nombre: `EfimeraA-${rnd()}`, zona: 'test', estado: 'activo' });
    escB = await insSR('escuela', { nombre: `EfimeraB-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(escA.id, 'docente');
    await insSR('escuela_feature', { escuela_id: escA.id, flags: FLAGS_DOCENTE, plan: 'docente' });
    await insSR('escuela_feature', { escuela_id: escB.id, flags: FLAGS_DOCENTE, plan: 'docente' });

    // (1) La docente de A LEE su fila… y NO la de B (RLS por mi_escuela()).
    let rows = await (await fetch(
      `${URL}/rest/v1/escuela_feature?select=escuela_id,flags,plan&escuela_id=eq.${escA.id}`,
      { headers: asUser(doc.access_token) },
    )).json();
    assert.equal(rows.length, 1, 'la docente no ve la fila de SU colegio');
    assert.equal(rows[0].plan, 'docente');
    assert.equal(rows[0].flags.luna.activa, true);

    rows = await (await fetch(
      `${URL}/rest/v1/escuela_feature?select=escuela_id&escuela_id=eq.${escB.id}`,
      { headers: asUser(doc.access_token) },
    )).json();
    assert.equal(rows.length, 0, 'la docente ve la fila de OTRO colegio');

    // (2) La docente NO puede escribir: sin policy de UPDATE, el PATCH pega en
    // 0 filas (con return=representation el body vuelve vacío).
    const patch = await fetch(`${URL}/rest/v1/escuela_feature?escuela_id=eq.${escA.id}`, {
      method: 'PATCH',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ flags: FLAGS_BASICO, plan: 'basico' }),
    });
    const tocadas = await patch.json().catch(() => []);
    assert.ok(!Array.isArray(tocadas) || tocadas.length === 0, 'la docente pudo actualizar escuela_feature');
    // Y la fila sigue intacta (leída con service_role).
    const intacta = await (await fetch(
      `${URL}/rest/v1/escuela_feature?select=plan&escuela_id=eq.${escA.id}`,
      { headers: sr() },
    )).json();
    assert.equal(intacta[0].plan, 'docente', 'el PATCH de la docente pisó la fila');

    // (3) Con flags 'basico' en A (via service_role, como hace admin-features),
    // mi_acceso() de la docente devuelve luna apagada.
    await fetch(`${URL}/rest/v1/escuela_feature?escuela_id=eq.${escA.id}`, {
      method: 'PATCH',
      headers: sr(),
      body: JSON.stringify({ flags: FLAGS_BASICO, plan: 'basico' }),
    });
    const r = await fetch(`${URL}/rest/v1/rpc/mi_acceso`, {
      method: 'POST',
      headers: asUser(doc.access_token),
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 200);
    const acceso = await r.json();
    assert.equal(acceso.estado, 'activo');
    assert.equal(acceso.features.sol, true);
    assert.equal(acceso.features.luna.activa, false, 'mi_acceso no refleja los flags basico');
    assert.equal(acceso.features.terra, false);
  } finally {
    if (escA) await borrarSR('escuela_feature', `escuela_id=eq.${escA.id}`);
    if (escB) await borrarSR('escuela_feature', `escuela_id=eq.${escB.id}`);
    if (doc) await borrarUser(doc.id);
    if (escA) await borrarSR('escuela', `id=eq.${escA.id}`);
    if (escB) await borrarSR('escuela', `id=eq.${escB.id}`);
  }
});
