// Tests de integración: invariantes de seguridad del login del alumno.
// Pegan a la Supabase remota. Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const AULA = 'CERRO-3A';
const SECRETO = 'aula2026';

const callFn = (name, body) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const rpcAnon = (name, args) => fetch(`${URL}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
});
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

test('anon NO puede ejecutar el RPC alumno_login directo (no saltea la Edge Function)', { skip }, async () => {
  const r = await rpcAnon('alumno_login', { p_codigo: 'x', p_secreto: 'x', p_perfil: '00000000-0000-0000-0000-000000000000', p_pin: '0' });
  assert.equal(r.status, 401);
});

test('anon NO puede ejecutar set_alumno_cred (no puede reescribir credenciales)', { skip }, async () => {
  const r = await rpcAnon('set_alumno_cred', { p_perfil: '00000000-0000-0000-0000-000000000000', p_aula: '00000000-0000-0000-0000-000000000000', p_pin: '0', p_email: 'x', p_password: 'x' });
  assert.equal(r.status, 401);
});

test('aula-students: secreto incorrecto → 401, sin lista', { skip }, async () => {
  const r = await callFn('aula-students', { codigo: AULA, secreto: 'incorrecto' });
  assert.equal(r.status, 401);
});

test('aula-students: secreto correcto → lista de alumnos', { skip }, async () => {
  const r = await callFn('aula-students', { codigo: AULA, secreto: SECRETO });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.alumnos) && j.alumnos.length >= 1);
  assert.ok(j.alumnos[0].id && j.alumnos[0].nombre);
});

test('anon puede listar colegios y aulas (para el setup), pero NO leer perfil', { skip }, async () => {
  const esc = await fetch(`${URL}/rest/v1/escuela?select=nombre`, { headers: { apikey: ANON } });
  assert.equal(esc.status, 200);
  assert.ok((await esc.json()).length >= 1, 'lista escuelas');

  const perfil = await fetch(`${URL}/rest/v1/perfil?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  assert.deepEqual(await perfil.json(), [], 'RLS: anon ve 0 perfiles');
});

test('Auth directo con email adivinable falla (creds opacas)', { skip }, async () => {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mateo@edutia.local', password: 'EDU1111' }),
  });
  assert.equal(r.ok, false);
});

test('alumno-login: PIN correcto → sesión; lockout al 8° intento fallido, 3 min (alumno efímero)', { skip }, async () => {
  // aula real
  const aula = (await (await fetch(`${URL}/rest/v1/aula?codigo=eq.${AULA}&select=id,escuela_id`, { headers: { apikey: ANON } })).json())[0];
  assert.ok(aula, 'existe el aula de prueba');

  const email = `test-${Math.random().toString(16).slice(2)}@students.edutia.local`;
  const pass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  let id;
  try {
    // crear alumno efímero
    const cr = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: srHeaders(), body: JSON.stringify({ email, password: pass, email_confirm: true }) });
    id = (await cr.json()).id;
    assert.ok(id, 'creó el user efímero');
    await fetch(`${URL}/rest/v1/perfil`, { method: 'POST', headers: { ...srHeaders(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ id, rol: 'alumno', nombre: 'Test', escuela_id: aula.escuela_id, aula_id: aula.id }]) });
    await fetch(`${URL}/rest/v1/rpc/set_alumno_cred`, { method: 'POST', headers: srHeaders(), body: JSON.stringify({ p_perfil: id, p_aula: aula.id, p_pin: '1234', p_email: email, p_password: pass }) });

    // PIN correcto → sesión
    const ok = await (await callFn('alumno-login', { codigo: AULA, secreto: SECRETO, perfilId: id, pin: '1234' })).json();
    assert.ok(ok.session && ok.session.access_token, 'PIN correcto devuelve sesión');

    // 7 PIN incorrectos → todavía NO bloquea (migración 0015: 8 intentos / 3 min)
    let last;
    for (let i = 0; i < 7; i++) {
      last = await (await callFn('alumno-login', { codigo: AULA, secreto: SECRETO, perfilId: id, pin: '0000' })).json();
      assert.equal(last.error, 'pin_invalido', `fallo ${i + 1} de 7: pin_invalido, todavía sin bloqueo`);
    }
    assert.equal(last.dato, 1, 'tras 7 fallos avisa que queda 1 intento');

    // 8° PIN incorrecto → bloqueado (server-authoritative), con segundos del bloqueo de 3 min
    last = await (await callFn('alumno-login', { codigo: AULA, secreto: SECRETO, perfilId: id, pin: '0000' })).json();
    assert.equal(last.error, 'bloqueado', 'al 8° intento queda bloqueado');
    assert.ok(Number.isFinite(last.dato) && last.dato > 0 && last.dato <= 180,
      `dato trae segundos restantes coherentes con 3 minutos (vino ${last.dato})`);
  } finally {
    if (id) {
      // Idempotencia: el bloqueo dura 3 min; borramos explícitamente la fila de
      // intento_login (además del cascade perfil → intento_login) para no heredar
      // estado si el test se corre dos veces seguidas.
      await fetch(`${URL}/rest/v1/intento_login?perfil_id=eq.${id}`, { method: 'DELETE', headers: srHeaders() });
      await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: srHeaders() });
    }
  }
});
