// Tests de integración "Mis materias": RLS de despublicar (sol_materia_update)
// y de eliminar definitivo (programa_delete_autor, migración 0013).
// La policy de delete exige dueña + estado 'borrador' (dos pasos server-side);
// el cascade de borrar programa arrastra sol_materia, nodo, ejercicio y sesion.
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// materia semilla siempre presente en la DB de desarrollo
const MATERIA = '22222222-2222-4222-8222-222222222222';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

async function nuevoUsuario(escuelaId, rol, docenteId = null) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  const perfilData = { id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId };
  if (docenteId) perfilData.docente_id = docenteId;
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

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];

// PATCH/DELETE devolviendo las filas afectadas (Prefer: return=representation);
// PostgREST responde 200/204 aunque la RLS filtre todo, así que se cuenta.
const patchAs = async (tok, table, filtro, body) =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH',
    headers: { ...asUser(tok), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })).json();
const deleteAs = async (tok, table, filtro) =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'DELETE',
    headers: { ...asUser(tok), Prefer: 'return=representation' },
  })).json();
const countSR = async (table, filtro) => {
  const rows = await (await fetch(`${URL}/rest/v1/${table}?${filtro}&select=id`, { headers: sr() })).json();
  return Array.isArray(rows) ? rows.length : 0;
};

test('Mis materias: despublicar y eliminar respetan dueña + estado (RLS 0013)', { skip }, async () => {
  let escuela, prog, docente, docenteX, alumno;
  try {
    // Seed: escuela + docente dueña A + docente ajena X + alumno de A;
    // programa con nodo, ejercicio, sesión del alumno y sol_materia publicada de A.
    escuela = await insSR('escuela', { nombre: 'Escuela Efimera Materias Test' });
    docente = await nuevoUsuario(escuela.id, 'docente');
    docenteX = await nuevoUsuario(escuela.id, 'docente');
    alumno = await nuevoUsuario(escuela.id, 'alumno', docente.id);

    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test mis materias' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo Materias', orden: 0 });
    const ej = await insSR('ejercicio', { nodo_id: nodo.id, enunciado: '¿?', opciones: ['a', 'b'], correcta: 0, dificultad: 1 });
    const ses = await insSR('sesion', { alumno_id: alumno.id, nodo_id: nodo.id, aciertos: 1, total: 1, duracion_seg: 10 });
    const sm = await insSR('sol_materia', {
      programa_id: prog.id, docente_id: docente.id, escuela_id: escuela.id, estado: 'publicado',
    });
    assert.ok(sm?.id && ej?.id && ses?.id, 'seed completo');

    // 1. Despublicar ajena: X no toca la sol_materia de A
    const despX = await patchAs(docenteX.access_token, 'sol_materia', `id=eq.${sm.id}`, { estado: 'borrador' });
    assert.equal(Array.isArray(despX) ? despX.length : 0, 0, 'docente ajena no despublica');

    // 2. Delete bloqueado mientras está publicada (aun siendo la dueña)
    const delPublicada = await deleteAs(docente.access_token, 'programa', `id=eq.${prog.id}`);
    assert.equal(Array.isArray(delPublicada) ? delPublicada.length : 0, 0, 'publicada no se borra (dos pasos)');
    assert.equal(await countSR('programa', `id=eq.${prog.id}`), 1, 'el programa sigue existiendo');

    // 3. Despublicar dueña: 1 fila
    const despA = await patchAs(docente.access_token, 'sol_materia', `id=eq.${sm.id}`, { estado: 'borrador' });
    assert.equal(despA.length, 1, 'la dueña despublica su materia');

    // 4. En borrador: ni la docente ajena ni el alumno pueden borrar
    const delX = await deleteAs(docenteX.access_token, 'programa', `id=eq.${prog.id}`);
    assert.equal(Array.isArray(delX) ? delX.length : 0, 0, 'docente ajena no borra');
    const delAlumno = await deleteAs(alumno.access_token, 'programa', `id=eq.${prog.id}`);
    assert.equal(Array.isArray(delAlumno) ? delAlumno.length : 0, 0, 'alumno no borra');

    // 5. La dueña borra en borrador y el cascade arrastra todo
    const delA = await deleteAs(docente.access_token, 'programa', `id=eq.${prog.id}`);
    assert.equal(delA.length, 1, 'la dueña borra su materia en borrador');
    assert.equal(await countSR('sol_materia', `id=eq.${sm.id}`), 0, 'cascade: sol_materia');
    assert.equal(await countSR('nodo', `id=eq.${nodo.id}`), 0, 'cascade: nodo');
    assert.equal(await countSR('ejercicio', `id=eq.${ej.id}`), 0, 'cascade: ejercicio');
    assert.equal(await countSR('sesion', `id=eq.${ses.id}`), 0, 'cascade: sesion');
    prog = null; // ya no hay que limpiarlo
  } finally {
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    for (const u of [alumno, docente, docenteX]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (escuela) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});
