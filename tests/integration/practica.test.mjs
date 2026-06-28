// Tests de integración SP-4a: el alumno registra su práctica (sesion + respuesta)
// y la RLS lo protege (solo lo suyo). Idempotente; usa envs de Supabase (skip si faltan).
// npm run test:db
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
const asAlumno = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

async function nuevoAlumno() {
  const email = `alu-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const id = (await (await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: sr(), body: JSON.stringify({ email, password, email_confirm: true }) })).json()).id;
  await fetch(`${URL}/rest/v1/perfil`, { method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ id, rol: 'alumno', nombre: 'Test Alu', grado: 3, escuela_id: ESCUELA }]) });
  const tok = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  return { id, access_token: tok.access_token };
}
const insSR = async (table, row) => (await (await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...sr(), Prefer: 'return=representation' }, body: JSON.stringify(row) })).json())[0];

test('SP-4a: el alumno registra sesion+respuesta; otro alumno no las ve (RLS)', { skip }, async () => {
  let prog, alumno, otro;
  try {
    // contenido efímero (service_role)
    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Test', orden: 0 });
    const ejer = await insSR('ejercicio', { nodo_id: nodo.id, enunciado: '2+2', opciones: ['3', '4'], correcta: '4', dificultad: 1, tipo: 'reconocer' });

    alumno = await nuevoAlumno();

    // el alumno crea su sesion
    const ses = await (await fetch(`${URL}/rest/v1/sesion`, { method: 'POST', headers: { ...asAlumno(alumno.access_token), Prefer: 'return=representation' }, body: JSON.stringify({ alumno_id: alumno.id, nodo_id: nodo.id, duracion_seg: 5, aciertos: 1, total: 1 }) })).json();
    assert.ok(Array.isArray(ses) && ses[0]?.id, 'el alumno crea su sesion');

    // y su respuesta
    const resp = await fetch(`${URL}/rest/v1/respuesta`, { method: 'POST', headers: { ...asAlumno(alumno.access_token), Prefer: 'return=representation' }, body: JSON.stringify({ sesion_id: ses[0].id, ejercicio_id: ejer.id, dada: '4', correcta: true, reintentos: 0, tiempo_seg: 3 }) });
    assert.equal(resp.status, 201, 'el alumno registra su respuesta');

    // RLS: otro alumno NO ve esa sesion
    otro = await nuevoAlumno();
    const ajeno = await (await fetch(`${URL}/rest/v1/sesion?id=eq.${ses[0].id}`, { headers: asAlumno(otro.access_token) })).json();
    assert.deepEqual(ajeno, [], 'otro alumno no ve la sesion ajena');
  } finally {
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    for (const u of [alumno, otro]) if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
  }
});
