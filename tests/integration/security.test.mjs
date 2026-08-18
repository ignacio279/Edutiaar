// Tests de integración: invariantes de seguridad del login del alumno.
// Pegan a la Supabase remota. Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db
//
// Cada test arma su propio colegio + aula + secreto efímeros y los borra al
// final. Antes usaban el aula semilla con su secreto hardcodeado, y eso los
// ataba a un dato que cambia (el 2026-08-18 se uniformaron las credenciales de
// demo y estos tests se pusieron rojos sin que nada de seguridad se rompiera).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const callFn = (name, body) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const rpcAnon = (name, args) => fetch(`${URL}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
});
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...srHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];
const delSR = (table, filtro) =>
  fetch(`${URL}/rest/v1/${table}?${filtro}`, { method: 'DELETE', headers: srHeaders() });

// Aula efímera con secreto propio, en un colegio efímero operativo (las Edge
// Functions cortan por estado del colegio, no por licencia, en este camino).
async function aulaEfimera() {
  const secreto = `sec-${rnd()}`;
  const escuela = await insSR('escuela', { nombre: `Escuela Efimera Seguridad ${rnd().slice(0, 6)}`, estado: 'activo' });
  const codigo = `SEG-${rnd().slice(0, 6).toUpperCase()}`;
  const aula = await insSR('aula', { escuela_id: escuela.id, nombre: '3° seguridad', grado: 3, codigo });
  await fetch(`${URL}/rest/v1/rpc/set_aula_secreto`, {
    method: 'POST', headers: srHeaders(), body: JSON.stringify({ p_aula: aula.id, p_secreto: secreto }),
  });
  const limpiar = async (extraUsers = []) => {
    for (const id of extraUsers) await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: srHeaders() });
    await delSR('aula', `id=eq.${aula.id}`);
    await delSR('escuela', `id=eq.${escuela.id}`);
  };
  return { escuela, aula, codigo, secreto, limpiar };
}

// Alumno efímero con credencial en un aula dada (mismo camino que crear_alumno:
// perfil + set_alumno_cred; el perfil se inserta, que perfil_guard no bloquea).
async function alumnoEfimero(aula, escuelaId, pin = '1234') {
  const email = `test-${rnd().slice(0, 10)}@students.edutia.local`;
  const password = rnd();
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: srHeaders(), body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const { id } = await cr.json();
  assert.ok(id, 'creó el user efímero');
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...srHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol: 'alumno', nombre: 'Test', avatar: 'fox', escuela_id: escuelaId, aula_id: aula.id }]),
  });
  await fetch(`${URL}/rest/v1/rpc/set_alumno_cred`, {
    method: 'POST', headers: srHeaders(),
    body: JSON.stringify({ p_perfil: id, p_aula: aula.id, p_pin: pin, p_email: email, p_password: password }),
  });
  return { id, email, password };
}

test('anon NO puede ejecutar el RPC alumno_login directo (no saltea la Edge Function)', { skip }, async () => {
  const r = await rpcAnon('alumno_login', { p_codigo: 'x', p_secreto: 'x', p_perfil: '00000000-0000-0000-0000-000000000000', p_pin: '0' });
  assert.equal(r.status, 401);
});

test('anon NO puede ejecutar set_alumno_cred (no puede reescribir credenciales)', { skip }, async () => {
  const r = await rpcAnon('set_alumno_cred', { p_perfil: '00000000-0000-0000-0000-000000000000', p_aula: '00000000-0000-0000-0000-000000000000', p_pin: '0', p_email: 'x', p_password: 'x' });
  assert.equal(r.status, 401);
});

test('aula-students: secreto incorrecto → 401, sin lista', { skip }, async () => {
  const f = await aulaEfimera();
  try {
    const r = await callFn('aula-students', { codigo: f.codigo, secreto: 'incorrecto' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).alumnos, undefined, 'no filtra la lista en el error');
  } finally { await f.limpiar(); }
});

test('aula-students: secreto correcto → lista de alumnos', { skip }, async () => {
  const f = await aulaEfimera();
  let alumno;
  try {
    alumno = await alumnoEfimero(f.aula, f.escuela.id);
    const r = await callFn('aula-students', { codigo: f.codigo, secreto: f.secreto });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(Array.isArray(j.alumnos) && j.alumnos.length >= 1);
    assert.ok(j.alumnos[0].id && j.alumnos[0].nombre);
  } finally { await f.limpiar(alumno ? [alumno.id] : []); }
});

test('anon lee el listado del setup por las vistas públicas, NO las tablas', { skip }, async () => {
  // 0018 le sacó a anon el SELECT de escuela/aula (era enumeración) y puso
  // escuela_publica/aula_publica con solo las columnas no sensibles. Ojo: RLS
  // devuelve 200 con [] — "vacío" no es "error", y eso ya costó un debug entero.
  for (const vista of ['escuela_publica', 'aula_publica']) {
    const r = await fetch(`${URL}/rest/v1/${vista}?select=nombre`, { headers: { apikey: ANON } });
    assert.equal(r.status, 200, `${vista} responde`);
    assert.ok((await r.json()).length >= 1, `${vista} lista algo (lo que usa /setup)`);
  }
  for (const tabla of ['escuela', 'aula', 'perfil']) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    assert.deepEqual(await r.json(), [], `RLS: anon ve 0 filas de ${tabla}`);
  }
});

test('Auth directo con email adivinable falla (creds opacas)', { skip }, async () => {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mateo@edutia.local', password: 'EDU1111' }),
  });
  assert.equal(r.ok, false);
});

test('alumno-login: PIN correcto → sesión; lockout al 8° intento fallido, 3 min (alumno efímero)', { skip }, async () => {
  const f = await aulaEfimera();
  let alumno;
  try {
    alumno = await alumnoEfimero(f.aula, f.escuela.id, '1234');
    const entrar = (pin) => callFn('alumno-login', { codigo: f.codigo, secreto: f.secreto, perfilId: alumno.id, pin })
      .then((r) => r.json());

    // PIN correcto → sesión
    const ok = await entrar('1234');
    assert.ok(ok.session && ok.session.access_token, 'PIN correcto devuelve sesión');

    // 7 PIN incorrectos → todavía NO bloquea (migración 0015: 8 intentos / 3 min)
    let last;
    for (let i = 0; i < 7; i++) {
      last = await entrar('0000');
      assert.equal(last.error, 'pin_invalido', `fallo ${i + 1} de 7: pin_invalido, todavía sin bloqueo`);
    }
    assert.equal(last.dato, 1, 'tras 7 fallos avisa que queda 1 intento');

    // 8° PIN incorrecto → bloqueado (server-authoritative), con segundos del bloqueo de 3 min
    last = await entrar('0000');
    assert.equal(last.error, 'bloqueado', 'al 8° intento queda bloqueado');
    assert.ok(Number.isFinite(last.dato) && last.dato > 0 && last.dato <= 180,
      `dato trae segundos restantes coherentes con 3 minutos (vino ${last.dato})`);
  } finally {
    // Idempotencia: el bloqueo dura 3 min; borramos la fila de intento_login
    // explícitamente (además del cascade perfil → intento_login) para no
    // heredar estado si el test se corre dos veces seguidas.
    if (alumno) await delSR('intento_login', `perfil_id=eq.${alumno.id}`);
    await f.limpiar(alumno ? [alumno.id] : []);
  }
});
