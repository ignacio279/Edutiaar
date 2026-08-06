// Tests de integración de admin-colegios (WP1 — Dashboard admin v3):
// guard no_admin con token de docente, suspensión → acceso_de bloqueado, y
// colegio archivado invisible en escuela_publica. Idempotentes: crean y borran
// sus propios datos efímeros (cleanup en finally). Necesitan envs (si faltan,
// se saltean): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// OJO: los tests que pegan a la Edge Function necesitan admin-colegios
// DEPLOYADA; si no lo está, el fetch da 404 y esperarStatus muestra el body.
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

const callFn = (accion, body, token) => fetch(`${URL}/functions/v1/admin-colegios`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion, ...body }),
});

// Assertea el status con el BODY en el mensaje: si la fn no está deployada el
// fetch da 404 y sin esto el fallo se ve como un "404 !== 403" mudo (patrón de
// generador-ejercicios.test.mjs).
async function esperarStatus(r, esperado, contexto) {
  if (r.status !== esperado) {
    assert.fail(`${contexto}: status ${r.status} (esperado ${esperado}) — body: ${(await r.text()).slice(0, 300)}`);
  }
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

async function nuevoUsuario(escuelaId, rol) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  if (rol !== 'admin') {
    // El admin de plataforma NO tiene fila en perfil (ADR-009).
    const perfilData = { id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId };
    if (rol === 'alumno') perfilData.grado = 3;
    await fetch(`${URL}/rest/v1/perfil`, {
      method: 'POST',
      headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([perfilData]),
    });
  }
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

test('admin-colegios: un token de DOCENTE recibe 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const r = await callFn('crear', { nombre: 'Colegio pirata', tipo: 'rural' }, doc.access_token);
    await esperarStatus(r, 403, 'docente llamando crear');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('suspender un colegio → acceso_de(docente) da bloqueado', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');

    // Suspender vía REST con service_role (mismo efecto que la acción
    // cambiar_estado de la fn: un UPDATE de escuela.estado).
    const patch = await fetch(`${URL}/rest/v1/escuela?id=eq.${esc.id}`, {
      method: 'PATCH', headers: sr(), body: JSON.stringify({ estado: 'suspendido' }),
    });
    assert.ok(patch.ok, `patch de estado ok (status ${patch.status})`);

    // acceso_de: EXECUTE solo service_role (0018).
    const r = await fetch(`${URL}/rest/v1/rpc/acceso_de`, {
      method: 'POST', headers: sr(), body: JSON.stringify({ p_perfil: doc.id }),
    });
    assert.equal(r.status, 200, 'service_role llama acceso_de');
    const acceso = await r.json();
    assert.equal(acceso.estado, 'bloqueado', 'colegio suspendido → acceso bloqueado');
    assert.equal(acceso.motivo, 'colegio_suspendido');
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('colegio archivado no aparece en escuela_publica', { skip }, async () => {
  let esc;
  try {
    esc = await insSR('escuela', { nombre: `EfimeraArch-${rnd()}`, zona: 'test', estado: 'archivado' });
    const rows = await (await fetch(
      `${URL}/rest/v1/escuela_publica?select=id&id=eq.${esc.id}`,
      { headers: asAnon() },
    )).json();
    assert.ok(Array.isArray(rows) && rows.length === 0, 'el archivado desapareció del setup');
  } finally {
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

// Happy path por la Edge Function real (necesita deploy): un admin efímero
// crea un colegio → trial de 30 días, fila en escuela_feature plan docente,
// auditoría escrita; el operativo NO puede archivar (requiere_super).
test('crear vía la fn: trial+30, escuela_feature docente, auditoría; archivar exige super', { skip }, async () => {
  let admin, colegioId;
  try {
    admin = await nuevoUsuario(null, 'admin');
    await insSR('plataforma_admin', { perfil_id: admin.id, nivel: 'operativo', nombre: 'Efimero' });

    const r = await callFn('crear', { nombre: `EfimeroFn-${rnd()}`, zona: 'test', tipo: 'plurigrado' }, admin.access_token);
    await esperarStatus(r, 200, 'crear vía fn (¿está deployada admin-colegios?)');
    const { colegio } = await r.json();
    colegioId = colegio.id;
    assert.equal(colegio.estado, 'trial');
    assert.ok(colegio.trial_inicio && colegio.trial_fin, 'trial con fechas');
    const dias = Math.round((new Date(colegio.trial_fin) - new Date(colegio.trial_inicio)) / 86400000);
    assert.equal(dias, 30, 'trial de 30 días');

    const feat = await (await fetch(
      `${URL}/rest/v1/escuela_feature?escuela_id=eq.${colegioId}&select=plan,flags`,
      { headers: sr() },
    )).json();
    assert.equal(feat.length, 1, 'fila de escuela_feature creada');
    assert.equal(feat[0].plan, 'docente');
    assert.deepEqual(feat[0].flags, {
      sol: true,
      luna: { activa: true, alertas: true, boletines: true, chat: true },
      terra: false,
    });

    // La mutación quedó auditada (la auditoría es fire-and-forget: dar un respiro).
    await new Promise((res) => setTimeout(res, 1500));
    const aud = await (await fetch(
      `${URL}/rest/v1/auditoria?entidad_id=eq.${colegioId}&accion=eq.crear_colegio&select=actor_id,nivel`,
      { headers: sr() },
    )).json();
    assert.equal(aud.length, 1, 'auditoría de crear_colegio escrita');
    assert.equal(aud[0].actor_id, admin.id);

    // Operativo intentando archivar → 403 requiere_super.
    const rx = await callFn('cambiar_estado', { escuela_id: colegioId, estado: 'archivado' }, admin.access_token);
    await esperarStatus(rx, 403, 'operativo archivando');
    assert.deepEqual(await rx.json(), { error: 'requiere_super' });
  } finally {
    if (colegioId) {
      await borrarSR('auditoria', `entidad_id=eq.${colegioId}`);
      await borrarSR('escuela', `id=eq.${colegioId}`); // cascadea escuela_feature
    }
    if (admin) {
      await borrarSR('plataforma_admin', `perfil_id=eq.${admin.id}`);
      await borrarUser(admin.id);
    }
  }
});
