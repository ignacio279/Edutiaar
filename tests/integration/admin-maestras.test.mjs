// Tests de integración de admin-maestras (Dashboard admin v3, WP2):
// guard no_admin con token docente, suspender/reactivar reflejado en
// acceso_de(), y el alta completa vía la Edge Function (si está deployada).
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db — idempotentes, cleanup en finally SIEMPRE con
// auth admin delete de todo user creado.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

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

// Admin de plataforma efímero: auth user SIN perfil + fila en plataforma_admin
// (ADR-009: la identidad admin es solo esa tabla).
async function nuevoAdmin(nivel = 'super') {
  const email = `admin-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  await fetch(`${URL}/rest/v1/plataforma_admin`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ perfil_id: id, nivel, nombre: 'Admin Efimero' }),
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

const callFn = (body, token) => fetch(`${URL}/functions/v1/admin-maestras`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Assertea el status mostrando el BODY (patrón generador-ejercicios): sin esto
// un fallo upstream se ve como un "409 !== 200" mudo.
async function esperarStatus(r, esperado, contexto) {
  if (r.status !== esperado) {
    assert.fail(`${contexto}: status ${r.status} (esperado ${esperado}) — body: ${(await r.text()).slice(0, 300)}`);
  }
}

// La fn puede no estar deployada todavía (los WP se deployan juntos al final):
// en ese caso la plataforma responde 404 y el test se da por no corrible.
function fnNoDeployada(r) {
  if (r.status === 404) {
    console.log('admin-maestras no está deployada: test salteado.');
    return true;
  }
  return false;
}

const rpcSR = async (fn, args) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: sr(), body: JSON.stringify(args),
  });
  return await r.json().catch(() => null);
};

test('admin-maestras: token de docente → 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const r = await callFn({ accion: 'listar' }, doc.access_token);
    if (fnNoDeployada(r)) return;
    await esperarStatus(r, 403, 'listar con token docente');
    const j = await r.json();
    assert.equal(j.error, 'no_admin');
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('docente_acceso: suspendida → acceso_de bloqueada; reactivar → activa', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');

    await insSR('docente_acceso', { perfil_id: doc.id, estado: 'suspendido' });
    let acc = await rpcSR('acceso_de', { p_perfil: doc.id });
    assert.equal(acc.estado, 'bloqueado');
    assert.equal(acc.motivo, 'cuenta_suspendida');

    // La variante que fundaciones no cubre: reactivar (upsert a 'activo').
    await fetch(`${URL}/rest/v1/docente_acceso?perfil_id=eq.${doc.id}`, {
      method: 'PATCH', headers: sr(), body: JSON.stringify({ estado: 'activo' }),
    });
    acc = await rpcSR('acceso_de', { p_perfil: doc.id });
    assert.equal(acc.estado, 'activo');
    assert.equal(acc.motivo, null);
  } finally {
    if (doc) { await borrarSR('docente_acceso', `perfil_id=eq.${doc.id}`); await borrarUser(doc.id); }
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('crear_maestra vía la fn: alta completa, password una vez, email duplicado 409', { skip }, async () => {
  let esc, admin, maestraId;
  const emailMaestra = `maestra-${rnd()}@efimeros.edutia.local`;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    admin = await nuevoAdmin('super');

    const r = await callFn(
      { accion: 'crear_maestra', email: emailMaestra, nombre: 'Seño Efímera', escuela_id: esc.id },
      admin.access_token,
    );
    if (fnNoDeployada(r)) return;
    await esperarStatus(r, 200, 'crear_maestra');
    const j = await r.json();
    maestraId = j.maestra?.id;
    assert.ok(maestraId, 'devuelve el id de la maestra');
    assert.equal(j.maestra.email, emailMaestra);
    assert.ok(j.invitacion?.password_temporal?.length >= 12, 'password temporal presente');
    if (!j.invitacion.warning) {
      assert.ok(String(j.invitacion.link).startsWith('http'), 'link de recovery presente');
    }

    // El alta dejó perfil docente + docente_acceso activo.
    const perfil = await (await fetch(
      `${URL}/rest/v1/perfil?id=eq.${maestraId}&select=rol,nombre,escuela_id`, { headers: sr() },
    )).json();
    assert.equal(perfil[0]?.rol, 'docente');
    assert.equal(perfil[0]?.escuela_id, esc.id);
    const acceso = await (await fetch(
      `${URL}/rest/v1/docente_acceso?perfil_id=eq.${maestraId}&select=estado`, { headers: sr() },
    )).json();
    assert.equal(acceso[0]?.estado, 'activo');

    // Auditoría escrita (fire-and-forget: reintenta unos segundos).
    let audit = [];
    for (let i = 0; i < 6 && audit.length === 0; i++) {
      await new Promise((res) => setTimeout(res, 500));
      audit = await (await fetch(
        `${URL}/rest/v1/auditoria?entidad_id=eq.${maestraId}&accion=eq.crear_maestra&select=actor_id`,
        { headers: sr() },
      )).json();
    }
    assert.equal(audit[0]?.actor_id, admin.id, 'auditoría de crear_maestra con el actor correcto');

    // Mismo email de nuevo → 409 email_en_uso (y no deja user colgado).
    const r2 = await callFn(
      { accion: 'crear_maestra', email: emailMaestra, nombre: 'Otra', escuela_id: esc.id },
      admin.access_token,
    );
    await esperarStatus(r2, 409, 'crear_maestra duplicada');
    assert.equal((await r2.json()).error, 'email_en_uso');
  } finally {
    if (maestraId) { await borrarSR('docente_acceso', `perfil_id=eq.${maestraId}`); await borrarUser(maestraId); }
    if (admin) { await borrarSR('plataforma_admin', `perfil_id=eq.${admin.id}`); await borrarUser(admin.id); }
    if (esc) { await borrarSR('auditoria', `entidad_id=eq.${maestraId ?? '00000000-0000-0000-0000-000000000000'}`); await borrarSR('escuela', `id=eq.${esc.id}`); }
  }
});
