// Tests de integración SP-4b: el alumno escribe su estado de nodo (alumno_nodo) y la
// RLS lo protege. La regla que decide el estado es pura (tests/unit/dominio.test.mjs);
// acá se valida el camino de escritura que usa la práctica. npm run test:db
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

test('SP-4b: el alumno escribe su alumno_nodo (estado/puntaje); otro no lo ve (RLS)', { skip }, async () => {
  let prog, alumno, otro;
  try {
    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Test', orden: 0 });
    alumno = await nuevoAlumno();

    // upsert del estado por el propio alumno (lo que hace la práctica al cerrar)
    const up = await fetch(`${URL}/rest/v1/alumno_nodo?on_conflict=alumno_id,nodo_id`, {
      method: 'POST',
      headers: { ...asAlumno(alumno.access_token), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ alumno_id: alumno.id, nodo_id: nodo.id, estado: 'dominado', puntaje: 88 }),
    });
    const fila = await up.json();
    assert.equal(fila[0]?.estado, 'dominado', 'el alumno guarda su estado de nodo');

    // RLS: otro alumno no ve ese alumno_nodo
    otro = await nuevoAlumno();
    const ajeno = await (await fetch(`${URL}/rest/v1/alumno_nodo?nodo_id=eq.${nodo.id}`, { headers: asAlumno(otro.access_token) })).json();
    assert.deepEqual(ajeno, [], 'otro alumno no ve el estado ajeno');
  } finally {
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    for (const u of [alumno, otro]) if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
  }
});
