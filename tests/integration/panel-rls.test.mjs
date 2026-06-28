// Tests de integración Etapa 4: RLS de `sesion` para el panel docente.
// La lista "Mis alumnos" y el detalle leen `sesion` para mostrar actividad. Verifica
// que la docente dueña ve las sesiones de SU alumno y una docente ajena no (RLS,
// policy sesion_select con es_mi_alumno).
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

test('Etapa 4: la docente dueña lee las sesiones de su alumno; una docente ajena no (RLS)', { skip }, async () => {
  let escuela, prog, docente, alumno, docenteX;
  try {
    // 1. Sembrar con service role
    escuela = await insSR('escuela', { nombre: 'Escuela Efimera Panel Test' });
    assert.ok(escuela?.id, 'escuela efímera creada');

    docente = await nuevoUsuario(escuela.id, 'docente');
    alumno = await nuevoUsuario(escuela.id, 'alumno', docente.id);   // docente_id → es_mi_alumno verdadero

    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test panel docente' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo Panel', orden: 0 });

    const ses = await insSR('sesion', {
      alumno_id: alumno.id,
      nodo_id: nodo.id,
      aciertos: 5,
      total: 8,
      duracion_seg: 120,
    });
    assert.ok(ses?.id, 'sesion sembrada para el alumno');

    // 2. Como docente D (dueña de A): debe ver la sesión de su alumno
    const verDocente = await (await fetch(
      `${URL}/rest/v1/sesion?alumno_id=eq.${alumno.id}&select=id,aciertos,total`,
      { headers: asUser(docente.access_token) },
    )).json();
    assert.ok(Array.isArray(verDocente) && verDocente.length === 1, 'la docente dueña ve 1 sesión de su alumno');
    assert.equal(verDocente[0].aciertos, 5, 'lee los datos de la sesión');

    // 3. Como docente X (no dueña de A): RLS la deja sin ver nada
    docenteX = await nuevoUsuario(escuela.id, 'docente');   // sin docente_id para A → es_mi_alumno falso
    const verX = await (await fetch(
      `${URL}/rest/v1/sesion?alumno_id=eq.${alumno.id}&select=id`,
      { headers: asUser(docenteX.access_token) },
    )).json();
    const cuantas = Array.isArray(verX) ? verX.length : 0;
    assert.equal(cuantas, 0, 'la docente ajena no ve sesiones de un alumno que no es suyo');

  } finally {
    // Limpiar en orden inverso de FK (cascadas de Supabase hacen el resto)
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    for (const u of [alumno, docente, docenteX]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (escuela) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});
