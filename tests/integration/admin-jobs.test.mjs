// Tests de integración de admin-jobs (fase Observatorio y avisos): guard dual
// (sin token 401 / docente 403 / SERVICE_ROLE como Bearer = caller cron), la
// corrida nocturna que persiste en admin_alerta sin duplicar (upsert por clave
// determinística), la atendida que no revive, el trial extendido que mata la
// clave vieja y admin_alerta invisible por PostgREST para authenticated
// (server-only: RLS sin policies — patrón 0018/0019/0021).
// Idempotentes: crean y borran sus propios datos efímeros (cleanup en
// finally), sin tocar la data semilla. Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// OJO: los tests que pegan a la Edge Function necesitan admin-jobs DEPLOYADA;
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

const callFn = (accion, body, token) => fetch(`${URL}/functions/v1/admin-jobs`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion, ...body }),
});

// El caller cron: el SERVICE_ROLE key tal cual como Bearer (guard dual).
const callCron = (accion) => fetch(`${URL}/functions/v1/admin-jobs`, {
  method: 'POST',
  headers: sr(),
  body: JSON.stringify({ accion }),
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

// Fecha local 'YYYY-MM-DD' a N días de hoy (mismo calendario que diasHasta).
function enDias(n) {
  const f = new Date();
  f.setDate(f.getDate() + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

const alertasDe = async (escuelaId) =>
  (await fetch(`${URL}/rest/v1/admin_alerta?escuela_id=eq.${escuelaId}&select=clave,tipo,prioridad,escuela_nombre,generada_at`, {
    headers: sr(),
  })).json();

test('admin-jobs: sin Authorization → 401', { skip }, async () => {
  const r = await fetch(`${URL}/functions/v1/admin-jobs`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'nocturno' }),
  });
  assert.equal(r.status, 401, `sin token → 401 (fue ${r.status}: ${(await r.text()).slice(0, 200)})`);
});

test('admin-jobs: un token de DOCENTE recibe 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const r = await callFn('nocturno', {}, doc.access_token);
    await esperarStatus(r, 403, 'docente llamando admin-jobs (¿está deployada admin-jobs?)');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

// La corrida entera por la ruta del cron: persiste la clave determinística,
// no duplica al recorrer, la atendida no revive y extender el trial rota la
// clave (la vieja muere del snapshot).
test('nocturno vía cron: persiste, no duplica, atendida no revive, trial extendido rota la clave', { skip }, async () => {
  let esc;
  const finTrial = enDias(3); // vence en 3 días → alerta trial prioridad alta
  let claveTrial;
  try {
    esc = await insSR('escuela', {
      nombre: `EfimeraJobs-${rnd()}`, zona: 'test', estado: 'trial',
      trial_inicio: enDias(-27), trial_fin: finTrial,
    });
    claveTrial = `trial:${esc.id}:${finTrial}`;

    // Primera corrida: la clave del trial aparece en admin_alerta.
    const r1 = await callCron('nocturno');
    await esperarStatus(r1, 200, 'primera corrida nocturna (¿está deployada admin-jobs?)');
    const body1 = await r1.json();
    assert.equal(body1.ok, true);
    assert.ok(typeof body1.generadas === 'number' && typeof body1.borradas === 'number' && body1.corrida_at, 'shape {ok, generadas, borradas, corrida_at}');

    let filas = await alertasDe(esc.id);
    const trial1 = filas.filter((f) => f.clave === claveTrial);
    assert.equal(trial1.length, 1, `la corrida persistió ${claveTrial} (hay: ${filas.map((f) => f.clave).join(', ')})`);
    assert.equal(trial1[0].prioridad, 'alta');
    assert.equal(trial1[0].escuela_nombre, esc.nombre);
    const countAntes = filas.length;

    // Segunda corrida: mismo count para la escuela (upsert idempotente).
    const r2 = await callCron('nocturno');
    await esperarStatus(r2, 200, 'segunda corrida nocturna');
    filas = await alertasDe(esc.id);
    assert.equal(filas.length, countAntes, 'recorrer no duplica filas');
    assert.equal(filas.filter((f) => f.clave === claveTrial).length, 1, 'la clave del trial sigue única');

    // Atendida: la clave se marca en admin_alerta_atendida y al recorrer NO
    // revive en el snapshot (evaluarAlertas la filtra).
    await insSR('admin_alerta_atendida', { clave: claveTrial, atendida_por: crypto.randomUUID() });
    const r3 = await callCron('nocturno');
    await esperarStatus(r3, 200, 'corrida post-atender');
    filas = await alertasDe(esc.id);
    assert.equal(filas.filter((f) => f.clave === claveTrial).length, 0, 'la atendida no revive');

    // Trial extendido (+30 días → fuera de la ventana de aviso): la clave
    // vieja no debe quedar en el snapshot (si estuviera, el plan la borra).
    const patch = await fetch(`${URL}/rest/v1/escuela?id=eq.${esc.id}`, {
      method: 'PATCH', headers: sr(), body: JSON.stringify({ trial_fin: enDias(33) }),
    });
    assert.ok(patch.ok, `patch de trial_fin ok (status ${patch.status})`);
    const r4 = await callCron('nocturno');
    await esperarStatus(r4, 200, 'corrida post-extensión');
    filas = await alertasDe(esc.id);
    assert.equal(
      filas.filter((f) => f.clave.startsWith('trial:')).length, 0,
      `sin alerta de trial tras extender (hay: ${filas.map((f) => f.clave).join(', ')})`,
    );
  } finally {
    if (claveTrial) await borrarSR('admin_alerta_atendida', `clave=eq.${encodeURIComponent(claveTrial)}`);
    // El cascade de escuela limpia sus filas de admin_alerta (fk on delete
    // cascade, 0021); las corridas de otros colegios reales no se tocan.
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('admin_alerta: un token authenticated (docente) no la lee por PostgREST', { skip }, async () => {
  let esc, doc, clave;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    clave = `pirata:${esc.id}:test`;
    await insSR('admin_alerta', {
      clave, tipo: 'colegio_inactivo', prioridad: 'media',
      escuela_id: esc.id, escuela_nombre: esc.nombre,
      titulo: 'Fila efímera de test', detalle: 'server-only',
    });

    const rows = await (await fetch(
      `${URL}/rest/v1/admin_alerta?select=*&limit=10`,
      { headers: asUser(doc.access_token) },
    )).json().catch(() => null);
    assert.ok(!Array.isArray(rows) || rows.length === 0, 'la docente lee admin_alerta');

    // Y con service_role sí está (la fila existe, no es un falso negativo).
    const conSR = await alertasDe(esc.id);
    assert.equal(conSR.filter((f) => f.clave === clave).length, 1, 'service_role sí la ve');
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`); // cascadea admin_alerta
  }
});
