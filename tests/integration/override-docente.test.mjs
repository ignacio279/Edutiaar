// Tests de integración SP-4e: RLS del override docente en alumno_nodo.
// Verifica que la docente dueña puede fijar estado_override en el nodo de su alumno,
// y que una docente ajena no puede (RLS la bloquea).
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// materia semilla siempre presente en la DB de desarrollo (igual que dominio.test.mjs)
const MATERIA = '22222222-2222-4222-8222-222222222222';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

// Crea un user en auth + perfil; retorna { id, access_token }
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

test('SP-4e: la docente dueña fija el estado_override; una docente ajena no puede (RLS)', { skip }, async () => {
  let escuela, prog, docente, alumno, docenteX;
  try {
    // 1. Sembrar con service role
    escuela = await insSR('escuela', { nombre: 'Escuela Efimera Override Test' });
    assert.ok(escuela?.id, 'escuela efímera creada');

    docente  = await nuevoUsuario(escuela.id, 'docente');
    alumno   = await nuevoUsuario(escuela.id, 'alumno', docente.id);  // docente_id → es_mi_alumno verdadero

    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test override docente' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo Override', orden: 0 });

    const semilla = await insSR('alumno_nodo', {
      alumno_id: alumno.id,
      nodo_id: nodo.id,
      estado: 'en_construccion',
    });
    assert.ok(semilla?.id, 'alumno_nodo sembrado en_construccion');

    // 2. Como docente D (dueña de A): fijar estado=dominado, estado_override=true → debe funcionar
    const upDocente = await fetch(
      `${URL}/rest/v1/alumno_nodo?on_conflict=alumno_id,nodo_id`,
      {
        method: 'POST',
        headers: { ...asUser(docente.access_token), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ alumno_id: alumno.id, nodo_id: nodo.id, estado: 'dominado', estado_override: true }),
      }
    );
    const filaDocente = await upDocente.json();
    assert.equal(filaDocente[0]?.estado, 'dominado', 'docente dueña puede fijar el estado a dominado');
    assert.equal(filaDocente[0]?.estado_override, true, 'docente dueña activa el override');

    // 3. Como docente X (no dueña de A): el mismo upsert debe fallar o afectar 0 filas (RLS bloquea)
    docenteX = await nuevoUsuario(escuela.id, 'docente');  // sin docente_id para A → es_mi_alumno falso

    const upX = await fetch(
      `${URL}/rest/v1/alumno_nodo?on_conflict=alumno_id,nodo_id`,
      {
        method: 'POST',
        headers: { ...asUser(docenteX.access_token), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ alumno_id: alumno.id, nodo_id: nodo.id, estado: 'no_empezado', estado_override: false }),
      }
    );
    const filaX = await upX.json();
    // RLS bloquea: array vacío o error — en ambos casos 0 filas afectadas
    const afecto = Array.isArray(filaX) ? filaX.length : 0;
    assert.equal(afecto, 0, 'docente ajena no puede modificar el alumno_nodo de otro alumno');

    // Verificar que el estado del alumno NO fue pisado por el tercero
    const check = await (await fetch(
      `${URL}/rest/v1/alumno_nodo?alumno_id=eq.${alumno.id}&nodo_id=eq.${nodo.id}`,
      { headers: sr() }
    )).json();
    assert.equal(check[0]?.estado, 'dominado', 'el estado sigue siendo dominado (no lo pisó el tercero)');
    assert.equal(check[0]?.estado_override, true, 'el override sigue activo');

  } finally {
    // Limpiar en orden inverso de FK (cascadas de Supabase hacen el resto)
    if (prog)    await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    for (const u of [alumno, docente, docenteX]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (escuela) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});
