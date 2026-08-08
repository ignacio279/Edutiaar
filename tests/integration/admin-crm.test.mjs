// Tests de integración de admin-crm (WP7 — Dashboard admin v3): las tablas
// escuela_nota y admin_alerta_atendida son server-only (RLS sin policies →
// 0 filas para authenticated, aunque PostgREST responda 2xx igual — patrón
// 0018/0019) y la Edge Function admin-crm exige plataforma_admin (guard
// verificarAdmin → 403 no_admin para una docente). Idempotentes: crean y
// borran sus propios datos efímeros (cleanup en finally), sin tocar la data
// semilla.
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// OJO: el test que pega a la Edge Function necesita admin-crm DEPLOYADA;
// si no lo está, el fetch da 404 y esperarStatus muestra el body.
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

const callFn = (accion, body, token) => fetch(`${URL}/functions/v1/admin-crm`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion, ...body }),
});

// Assertea el status con el BODY en el mensaje: si la fn no está deployada el
// fetch da 404 y sin esto el fallo se ve como un "404 !== 403" mudo.
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
  const perfilData = { id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId };
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

test('escuela_nota / admin_alerta_atendida: una docente no lee ni inserta (server-only)', { skip }, async () => {
  let esc, doc, notaId;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const nota = await insSR('escuela_nota', {
      escuela_id: esc.id, autor_id: doc.id, autor_email: 'test@efimeros.edutia.local',
      tipo: 'nota', cuerpo: 'nota efímera de test',
    });
    notaId = nota.id;

    // Lectura: 0 filas para la docente en ambas tablas.
    for (const tabla of ['escuela_nota', 'admin_alerta_atendida']) {
      const rows = await (await fetch(
        `${URL}/rest/v1/${tabla}?select=*&limit=10`,
        { headers: asUser(doc.access_token) },
      )).json().catch(() => null);
      assert.ok(!Array.isArray(rows) || rows.length === 0, `la docente lee ${tabla}`);
    }

    // Insert: no puede crear una nota por PostgREST.
    const insertNota = await fetch(`${URL}/rest/v1/escuela_nota`, {
      method: 'POST',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ escuela_id: esc.id, autor_id: doc.id, tipo: 'nota', cuerpo: 'pirata' }),
    });
    if (insertNota.status < 400) {
      const insertadas = await insertNota.json().catch(() => []);
      assert.equal(insertadas.length, 0, `la docente no puede insertar en escuela_nota (status ${insertNota.status})`);
    }

    // Insert: no puede marcar una alerta como atendida.
    const insertAlerta = await fetch(`${URL}/rest/v1/admin_alerta_atendida`, {
      method: 'POST',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ clave: `pirata:${rnd()}`, atendida_por: doc.id }),
    });
    if (insertAlerta.status < 400) {
      const insertadas = await insertAlerta.json().catch(() => []);
      assert.equal(insertadas.length, 0, `la docente no puede insertar en admin_alerta_atendida (status ${insertAlerta.status})`);
    }
  } finally {
    if (notaId) await borrarSR('escuela_nota', `id=eq.${notaId}`);
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('admin-crm: un token de DOCENTE recibe 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const r = await callFn('notas_listar', { escuela_id: esc.id }, doc.access_token);
    await esperarStatus(r, 403, 'docente llamando admin-crm (¿está deployada admin-crm?)');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('escuela_nota: service_role inserta y lee; el cascade la borra con el colegio', { skip }, async () => {
  let esc, notaId;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    const nota = await insSR('escuela_nota', {
      escuela_id: esc.id, autor_id: crypto.randomUUID(), autor_email: 'admin-efimero@edutia.local',
      tipo: 'acuerdo', cuerpo: 'acuerdo de test efímero',
    });
    notaId = nota.id;

    const leida = await (await fetch(
      `${URL}/rest/v1/escuela_nota?select=id,tipo,cuerpo,escuela_id&id=eq.${notaId}`,
      { headers: sr() },
    )).json();
    assert.equal(leida.length, 1, 'service_role lee la nota insertada');
    assert.equal(leida[0].tipo, 'acuerdo');
    assert.equal(leida[0].escuela_id, esc.id);

    // Borrar el colegio cascadea la nota (fk on delete cascade, 0019).
    await borrarSR('escuela', `id=eq.${esc.id}`);
    esc = null;
    const despues = await (await fetch(
      `${URL}/rest/v1/escuela_nota?select=id&id=eq.${notaId}`,
      { headers: sr() },
    )).json();
    assert.equal(despues.length, 0, 'el cascade borró la nota junto con el colegio');
    notaId = null;
  } finally {
    if (notaId) await borrarSR('escuela_nota', `id=eq.${notaId}`);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});
