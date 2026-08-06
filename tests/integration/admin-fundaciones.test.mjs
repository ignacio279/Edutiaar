// Tests de integración de las fundaciones del dashboard admin (migración 0018):
// tablas server-only invisibles para anon/authenticated, vistas públicas
// mínimas, y RPCs mi_acceso() / admin_nivel() / acceso_de().
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
const asAnon = () => ({ apikey: ANON, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

async function nuevoUsuario(escuelaId, rol, docenteId = null) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  const perfilData = { id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId };
  if (docenteId) perfilData.docente_id = docenteId;
  if (rol === 'alumno') perfilData.grado = 3;
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([perfilData]),
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

const rpcAs = async (tok, fn, args = {}) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: tok ? asUser(tok) : asAnon(),
    body: JSON.stringify(args),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
};

test('0018: anon no lee las tablas server-only ni el estado de escuela', { skip }, async () => {
  // Tablas server-only: RLS sin policies → 0 filas (PostgREST responde 2xx igual).
  for (const tabla of ['plataforma_admin', 'auditoria', 'uso_api', 'docente_acceso']) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=*&limit=1`, { headers: asAnon() });
    const rows = await r.json().catch(() => null);
    assert.ok(!Array.isArray(rows) || rows.length === 0, `anon lee ${tabla}`);
  }
  // La tabla escuela directa ya no tiene policy anon (0018 la dropeó).
  const esc = await (await fetch(`${URL}/rest/v1/escuela?select=estado&limit=1`, { headers: asAnon() })).json();
  assert.ok(!Array.isArray(esc) || esc.length === 0, 'anon lee escuela directa (leak 0004 sigue vivo)');
});

test('0018: escuela_publica lista solo trial/activo y columnas mínimas', { skip }, async () => {
  let escA, escB;
  try {
    escA = await insSR('escuela', { nombre: `EfimeraViva-${rnd()}`, zona: 'test', estado: 'activo' });
    escB = await insSR('escuela', { nombre: `EfimeraArchivada-${rnd()}`, zona: 'test', estado: 'archivado' });
    const rows = await (await fetch(
      `${URL}/rest/v1/escuela_publica?select=*&id=in.(${escA.id},${escB.id})`,
      { headers: asAnon() },
    )).json();
    assert.equal(rows.length, 1, 'solo la activa aparece');
    assert.equal(rows[0].id, escA.id);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'nombre', 'zona'], 'columnas mínimas');
  } finally {
    if (escA) await borrarSR('escuela', `id=eq.${escA.id}`);
    if (escB) await borrarSR('escuela', `id=eq.${escB.id}`);
  }
});

test('0018: mi_acceso() de una docente activa = activo con flags default', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const { status, data } = await rpcAs(doc.access_token, 'mi_acceso');
    assert.equal(status, 200);
    assert.equal(data.estado, 'activo');
    assert.equal(data.features.sol, true);
    assert.equal(data.features.luna.activa, true);
    assert.equal(data.features.terra, false);
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('0018: colegio suspendido → bloqueado; trial vencido → solo_lectura', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'suspendido' });
    doc = await nuevoUsuario(esc.id, 'docente');
    let r = await rpcAs(doc.access_token, 'mi_acceso');
    assert.equal(r.data.estado, 'bloqueado');
    assert.equal(r.data.motivo, 'colegio_suspendido');

    await fetch(`${URL}/rest/v1/escuela?id=eq.${esc.id}`, {
      method: 'PATCH',
      headers: sr(),
      body: JSON.stringify({ estado: 'trial', trial_fin: '2020-01-01' }),
    });
    r = await rpcAs(doc.access_token, 'mi_acceso');
    assert.equal(r.data.estado, 'solo_lectura');
    assert.equal(r.data.motivo, 'trial_vencido');

    // Maestra suspendida en docente_acceso → bloqueado aunque el colegio ande.
    await fetch(`${URL}/rest/v1/escuela?id=eq.${esc.id}`, {
      method: 'PATCH', headers: sr(), body: JSON.stringify({ estado: 'activo', trial_fin: null }),
    });
    await insSR('docente_acceso', { perfil_id: doc.id, estado: 'suspendido' });
    r = await rpcAs(doc.access_token, 'mi_acceso');
    assert.equal(r.data.estado, 'bloqueado');
    assert.equal(r.data.motivo, 'cuenta_suspendida');
  } finally {
    if (doc) { await borrarSR('docente_acceso', `perfil_id=eq.${doc.id}`); await borrarUser(doc.id); }
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('0018: el alumno hereda el acceso de su docente', { skip }, async () => {
  let esc, doc, alu;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    alu = await nuevoUsuario(esc.id, 'alumno', doc.id);
    await insSR('docente_acceso', { perfil_id: doc.id, estado: 'suspendido' });
    const r = await rpcAs(alu.access_token, 'mi_acceso');
    assert.equal(r.data.estado, 'bloqueado', 'docente suspendida → alumno bloqueado');
  } finally {
    if (doc) await borrarSR('docente_acceso', `perfil_id=eq.${doc.id}`);
    if (alu) await borrarUser(alu.id);
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('0018: admin_nivel() — docente null, admin super; acceso_de vedada a authenticated', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');

    let r = await rpcAs(doc.access_token, 'admin_nivel');
    assert.equal(r.data, null, 'una docente no es admin');

    await insSR('plataforma_admin', { perfil_id: doc.id, nivel: 'super', nombre: 'Efimero' });
    r = await rpcAs(doc.access_token, 'admin_nivel');
    assert.equal(r.data, 'super');

    // acceso_de: EXECUTE revocado a authenticated → PostgREST la rechaza.
    r = await rpcAs(doc.access_token, 'acceso_de', { p_perfil: doc.id });
    assert.ok(r.status >= 400, `authenticated pudo llamar acceso_de (status ${r.status})`);
    // anon tampoco llama mi_acceso.
    r = await rpcAs(null, 'mi_acceso');
    assert.ok(r.status >= 400, `anon pudo llamar mi_acceso (status ${r.status})`);
  } finally {
    if (doc) { await borrarSR('plataforma_admin', `perfil_id=eq.${doc.id}`); await borrarUser(doc.id); }
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});
