// Tests de integración de admin-costos (WP6 — Dashboard admin v3): la tabla
// uso_api es server-only (RLS sin policies → 0 filas para authenticated,
// aunque PostgREST responda 2xx igual) y la Edge Function admin-costos exige
// plataforma_admin (guard verificarAdmin → 403 no_admin para una docente).
// Idempotentes: crean y borran sus propios datos efímeros (cleanup en
// finally), sin tocar la data semilla.
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// OJO: el test que pega a la Edge Function necesita admin-costos DEPLOYADA;
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

const callFn = (accion, body, token) => fetch(`${URL}/functions/v1/admin-costos`, {
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

test('uso_api: service_role inserta filas sintéticas y el count/suma cuadra', { skip }, async () => {
  let esc;
  const filas = [
    { funcion: 'sol', modelo: 'claude-haiku-4-5', costo_usd: 0.0123, ok: true, latencia_ms: 812, tokens_entrada: 500, tokens_salida: 120 },
    { funcion: 'sol-chat', modelo: 'claude-haiku-4-5', costo_usd: 0.0056, ok: true, latencia_ms: 640, tokens_entrada: 300, tokens_salida: 80 },
    { funcion: 'dividir-nodos', modelo: 'claude-sonnet-4-6', costo_usd: 0.2410, ok: false, latencia_ms: 15200, tokens_entrada: 4000, tokens_salida: 0, error_codigo: 'timeout' },
    { funcion: 'luna-boletin', modelo: 'claude-sonnet-4-6', costo_usd: 0.0899, ok: true, latencia_ms: 3100, tokens_entrada: 1800, tokens_salida: 600 },
  ];
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    for (const f of filas) await insSR('uso_api', { ...f, escuela_id: esc.id });

    const rows = await (await fetch(
      `${URL}/rest/v1/uso_api?select=funcion,modelo,costo_usd,ok,latencia_ms&escuela_id=eq.${esc.id}`,
      { headers: sr() },
    )).json();
    assert.equal(rows.length, filas.length, 'insertó las filas esperadas');
    const sumaEsperada = filas.reduce((acc, f) => acc + f.costo_usd, 0);
    const sumaLeida = rows.reduce((acc, r) => acc + Number(r.costo_usd), 0);
    assert.ok(Math.abs(sumaLeida - sumaEsperada) < 1e-6, `suma de costo_usd cuadra (${sumaLeida} vs ${sumaEsperada})`);
    assert.equal(rows.filter((r) => !r.ok).length, 1, 'una fila marcada como error');
  } finally {
    if (esc) {
      await borrarSR('uso_api', `escuela_id=eq.${esc.id}`);
      await borrarSR('escuela', `id=eq.${esc.id}`);
    }
  }
});

test('uso_api: una docente no lee ni inserta por PostgREST (server-only)', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    await insSR('uso_api', { escuela_id: esc.id, funcion: 'sol', costo_usd: 0.01, ok: true });

    const lectura = await (await fetch(
      `${URL}/rest/v1/uso_api?select=*&limit=10`,
      { headers: asUser(doc.access_token) },
    )).json().catch(() => null);
    assert.ok(!Array.isArray(lectura) || lectura.length === 0, 'la docente no ve filas de uso_api');

    const insert = await fetch(`${URL}/rest/v1/uso_api`, {
      method: 'POST',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ escuela_id: esc.id, funcion: 'sol', costo_usd: 99 }),
    });
    if (insert.status < 400) {
      const insertadas = await insert.json().catch(() => []);
      assert.equal(insertadas.length, 0, `la docente no puede insertar en uso_api (status ${insert.status})`);
    }
  } finally {
    if (esc) {
      await borrarSR('uso_api', `escuela_id=eq.${esc.id}`);
    }
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('admin-costos: un token de DOCENTE recibe 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const r = await callFn('costos', { agrupar: 'colegio', rango_dias: 30 }, doc.access_token);
    await esperarStatus(r, 403, 'docente llamando admin-costos (¿está deployada admin-costos?)');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});
