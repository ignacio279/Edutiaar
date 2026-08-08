// Tests de integración de admin-metricas (WP5 — Dashboard admin v3): el guard
// no_admin (un token de DOCENTE no entra por ninguna acción), no_autenticado
// sin sesión, y validaciones de entrada. Solo LECTURAS: la fn no muta nada, así
// que estos tests no ensucian la base; igual crean y borran sus propios datos
// efímeros (cleanup en finally). Necesitan envs (si faltan, se saltean):
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// OJO: necesitan admin-metricas DEPLOYADA; si no lo está, el fetch da 404 y
// esperarStatus muestra el body con el diagnóstico.
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFn = (accion, body, token) => fetch(`${URL}/functions/v1/admin-metricas`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion, ...body }),
});

// Assertea el status con el BODY en el mensaje: si la fn no está deployada el
// fetch da 404 y sin esto el fallo se ve como un "404 !== 403" mudo (patrón de
// admin-colegios.test.mjs).
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

async function nuevoDocente(escuelaId) {
  const email = `docente-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol: 'docente', nombre: 'Test docente', escuela_id: escuelaId }]),
  });
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

test('admin-metricas: un token de DOCENTE recibe 403 no_admin en TODAS las acciones', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoDocente(esc.id);

    const acciones = [
      ['resumen', {}],
      ['adopcion', { rango_dias: 30 }],
      ['uso', { rango_dias: 30 }],
      ['funnel', {}],
      ['comparativa', { rango_dias: 30 }],
      ['feed', { limite: 10 }],
      ['detalle_colegio', { escuela_id: esc.id }],
    ];
    for (const [accion, payload] of acciones) {
      const r = await callFn(accion, payload, doc.access_token);
      await esperarStatus(r, 403, `docente llamando ${accion}`);
      assert.deepEqual(await r.json(), { error: 'no_admin' }, `body de ${accion}`);
    }
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('admin-metricas: sin sesión (solo anon key) → 401 no_autenticado', { skip }, async () => {
  const r = await callFn('resumen', {}, ANON);
  await esperarStatus(r, 401, 'anon sin sesión llamando resumen');
  assert.deepEqual(await r.json(), { error: 'no_autenticado' });
});

test('admin-metricas: token basura → 401, nunca datos', { skip }, async () => {
  const r = await callFn('resumen', {}, 'token.trucho.jaja');
  assert.ok(r.status === 401 || r.status === 403, `status ${r.status} (esperado 401 o 403)`);
  const body = await r.json().catch(() => ({}));
  assert.ok(!body.adopcion && !body.uso, 'no filtra métricas a un token inválido');
});

// El guard corre ANTES de validar el body: un docente no llega ni a
// 'accion_desconocida'. La validación de entrada (falta_escuela_id,
// accion_desconocida) solo se puede ejercitar con un admin real, así que acá
// se chequea lo que importa para la seguridad: nadie que no sea admin pasa.
test('admin-metricas: el guard corre antes que la validación de acción', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoDocente(esc.id);
    const r = await callFn('accion_que_no_existe', {}, doc.access_token);
    await esperarStatus(r, 403, 'docente con acción inexistente');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});
