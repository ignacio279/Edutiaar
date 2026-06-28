// Tests de integración SP-4c: evaluar-sesion (modo mock, sin ANTHROPIC_API_KEY) crea
// evaluacion_sesion; la docente del alumno la ve por RLS; el alumno no puede evaluar
// sesiones ajenas. Idempotente. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const ESCUELA = '11111111-1111-4111-8111-111111111111';
const MATERIA = '22222222-2222-4222-8222-222222222222';
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const auth = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });
const callFn = (name, body, tok) => fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: auth(tok), body: JSON.stringify(body) });

async function nuevoUsuario(rol, extra = {}) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const id = (await (await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: sr(), body: JSON.stringify({ email, password, email_confirm: true }) })).json()).id;
  await fetch(`${URL}/rest/v1/perfil`, { method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, escuela_id: ESCUELA, ...extra }]) });
  const tok = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  return { id, access_token: tok.access_token };
}
const insSR = async (table, row) => (await (await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...sr(), Prefer: 'return=representation' }, body: JSON.stringify(row) })).json())[0];

test('SP-4c: evaluar-sesion (mock) crea diagnóstico; la docente lo ve, otro alumno no puede evaluarla', { skip }, async () => {
  let prog, docente, alumno, otro;
  try {
    docente = await nuevoUsuario('docente');
    alumno = await nuevoUsuario('alumno', { grado: 3, docente_id: docente.id });

    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'TestNodo', orden: 0 });
    const ejer = await insSR('ejercicio', { nodo_id: nodo.id, enunciado: '2+2', opciones: ['3', '4'], correcta: '4', dificultad: 1, tipo: 'reconocer' });

    // el alumno crea su sesion + una respuesta (fallada, para que haya diagnóstico)
    const ses = (await (await fetch(`${URL}/rest/v1/sesion`, { method: 'POST', headers: { ...auth(alumno.access_token), Prefer: 'return=representation' }, body: JSON.stringify({ alumno_id: alumno.id, nodo_id: nodo.id, duracion_seg: 5, aciertos: 0, total: 1 }) })).json())[0];
    await fetch(`${URL}/rest/v1/respuesta`, { method: 'POST', headers: auth(alumno.access_token), body: JSON.stringify({ sesion_id: ses.id, ejercicio_id: ejer.id, dada: '3', correcta: false, reintentos: 2, tiempo_seg: 4 }) });

    // 1) el alumno evalúa SU sesion (mock)
    const r = await callFn('evaluar-sesion', { sesion_id: ses.id, mock: true }, alumno.access_token);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.evaluacion?.resumen, 'devuelve diagnóstico');
    assert.deepEqual(j.evaluacion.a_reforzar, ['TestNodo'], 'sesión floja → a_reforzar el nodo');

    // 2) la docente del alumno ve la evaluacion (RLS es_mi_alumno)
    const vistas = await (await fetch(`${URL}/rest/v1/evaluacion_sesion?select=id,resumen,sesion:sesion_id!inner(alumno_id)&sesion.alumno_id=eq.${alumno.id}`, { headers: auth(docente.access_token) })).json();
    assert.ok(Array.isArray(vistas) && vistas.length >= 1, 'la docente ve el análisis de su alumno');

    // 3) otro alumno NO puede evaluar esa sesion ajena → 403
    otro = await nuevoUsuario('alumno', { grado: 3 });
    const r2 = await callFn('evaluar-sesion', { sesion_id: ses.id, mock: true }, otro.access_token);
    assert.equal(r2.status, 403, 'no se puede evaluar una sesión ajena');
  } finally {
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    for (const u of [docente, alumno, otro]) if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
  }
});
