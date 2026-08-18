// Tests de integración de las métricas de valor (migración 0032): el trigger
// hito_registrar escribe el log a partir de las transiciones reales de
// alumno_nodo, hito_aprendizaje es server-only y luna_alerta está scopeada por
// docente y no deja mover primera_vez_at.
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db
// Idempotente: crea y borra sus propios datos efímeros (nombres marcados
// QA-VALOR y limpieza por id, nunca por nombre).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// materia semilla siempre presente en la DB de desarrollo (igual que override-docente.test.mjs)
const MATERIA = '22222222-2222-4222-8222-222222222222';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

async function nuevoUsuario(escuelaId, rol, docenteId = null) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: sr(), body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  const perfilData = { id, rol, nombre: `QA-VALOR ${rol}`, escuela_id: escuelaId };
  if (docenteId) perfilData.docente_id = docenteId;
  if (rol === 'alumno') perfilData.grado = 3;
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([perfilData]),
  });
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sr(), Prefer: 'return=representation' }, body: JSON.stringify(row),
  })).json())[0];

const getSR = async (path) => (await fetch(`${URL}/rest/v1/${path}`, { headers: sr() })).json();
const delSR = (path) => fetch(`${URL}/rest/v1/${path}`, { method: 'DELETE', headers: sr() });

// Mueve el estado de un alumno_nodo con service_role (simula lo que hace el
// cierre de práctica) y devuelve los hitos que quedaron registrados.
async function mover(alumnoId, nodoId, campos) {
  await fetch(`${URL}/rest/v1/alumno_nodo?on_conflict=alumno_id,nodo_id`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ alumno_id: alumnoId, nodo_id: nodoId, ...campos }]),
  });
  return getSR(`hito_aprendizaje?alumno_id=eq.${alumnoId}&order=created_at.asc`);
}

test('0032: el trigger registra dominado, trabado, destrabado y override desde alumno_nodo', { skip }, async () => {
  let escuela, prog, docente, alumno;
  try {
    escuela = await insSR('escuela', { nombre: `QA-VALOR escuela ${rnd()}` });
    docente = await nuevoUsuario(escuela.id, 'docente');
    alumno = await nuevoUsuario(escuela.id, 'alumno', docente.id);
    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'QA-VALOR hitos' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'QA-VALOR nodo', orden: 0 });

    // El backfill de 0032 pudo haber sembrado hitos de datos preexistentes;
    // este alumno es nuevo, así que arranca en cero.
    assert.equal((await getSR(`hito_aprendizaje?alumno_id=eq.${alumno.id}`)).length, 0, 'alumno nuevo sin hitos');

    // 1. no_empezado → en_construccion: NO es un hito (nada que contar).
    let hitos = await mover(alumno.id, nodo.id, { estado: 'en_construccion', puntaje: 20 });
    assert.equal(hitos.length, 0, 'entrar en construcción no es un hito');

    // 2. → a_reforzar: se traba.
    hitos = await mover(alumno.id, nodo.id, { estado: 'a_reforzar', puntaje: 15 });
    assert.deepEqual(hitos.map((h) => h.tipo), ['trabado']);
    assert.equal(hitos[0].escuela_id, escuela.id, 'escuela desnormalizada desde perfil');
    assert.equal(hitos[0].grado, 3, 'grado desnormalizado desde perfil');
    assert.equal(hitos[0].origen, 'vivo');

    // 3. a_reforzar → dominado: DOS hitos, destrabado y dominado. Es correcto:
    // salir del pozo y llegar a la cima son dos hechos distintos.
    hitos = await mover(alumno.id, nodo.id, { estado: 'dominado', puntaje: 80 });
    assert.deepEqual(hitos.map((h) => h.tipo), ['trabado', 'destrabado', 'dominado']);

    // 4. Un upsert que no cambia nada de lo que se mira NO agrega hitos
    // (el cierre de práctica pisa actualizado_at en cada sesión).
    hitos = await mover(alumno.id, nodo.id, { estado: 'dominado', puntaje: 92 });
    assert.equal(hitos.length, 3, 'sin transición, sin hito nuevo');

    // 5. La seño fija el estado a mano.
    hitos = await mover(alumno.id, nodo.id, { estado: 'dominado', puntaje: 92, estado_override: true });
    assert.deepEqual(hitos.map((h) => h.tipo), ['trabado', 'destrabado', 'dominado', 'override']);
  } finally {
    // Limpieza por id (nunca por nombre: el cascade se llevaría datos ajenos).
    if (prog?.id) await delSR(`programa?id=eq.${prog.id}`);
    for (const u of [alumno, docente]) {
      if (u?.id) {
        await delSR(`perfil?id=eq.${u.id}`);
        await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
      }
    }
    if (escuela?.id) await delSR(`escuela?id=eq.${escuela.id}`);
  }
});

test('0032: hito_aprendizaje es server-only — el cliente no lee ni escribe', { skip }, async () => {
  let escuela, docente;
  try {
    escuela = await insSR('escuela', { nombre: `QA-VALOR rls ${rnd()}` });
    docente = await nuevoUsuario(escuela.id, 'docente');

    const lee = await fetch(`${URL}/rest/v1/hito_aprendizaje?select=id&limit=1`, { headers: asUser(docente.access_token) });
    const filas = await lee.json();
    // RLS sin policies devuelve 200 con [] (no un 403): se afirma el VACÍO.
    assert.ok(!Array.isArray(filas) || filas.length === 0, 'una docente autenticada no ve ningún hito');

    const escribe = await fetch(`${URL}/rest/v1/hito_aprendizaje`, {
      method: 'POST', headers: asUser(docente.access_token),
      body: JSON.stringify([{ alumno_id: docente.id, nodo_id: docente.id, tipo: 'dominado' }]),
    });
    assert.ok(!escribe.ok, `el insert del cliente debe fallar, dio ${escribe.status}`);
  } finally {
    if (docente?.id) {
      await delSR(`perfil?id=eq.${docente.id}`);
      await fetch(`${URL}/auth/v1/admin/users/${docente.id}`, { method: 'DELETE', headers: sr() });
    }
    if (escuela?.id) await delSR(`escuela?id=eq.${escuela.id}`);
  }
});

test('0032: luna_alerta es de cada docente y primera_vez_at no se puede mover', { skip }, async () => {
  let escuela, docente, otra;
  try {
    escuela = await insSR('escuela', { nombre: `QA-VALOR alertas ${rnd()}` });
    docente = await nuevoUsuario(escuela.id, 'docente');
    otra = await nuevoUsuario(escuela.id, 'docente');
    const clave = `inactividad:${rnd()}`;

    const ins = await fetch(`${URL}/rest/v1/luna_alerta`, {
      method: 'POST', headers: { ...asUser(docente.access_token), Prefer: 'return=representation' },
      body: JSON.stringify([{ docente_id: docente.id, clave, tipo: 'inactividad', prioridad: 'alta' }]),
    });
    assert.ok(ins.ok, 'la docente registra la alerta que LUNA le mostró');
    const primera = (await ins.json())[0].primera_vez_at;

    // El upsert idempotente del dashboard NO debe empujar primera_vez_at.
    await fetch(`${URL}/rest/v1/luna_alerta?on_conflict=docente_id,clave`, {
      method: 'POST',
      headers: { ...asUser(docente.access_token), Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify([{ docente_id: docente.id, clave, tipo: 'inactividad', prioridad: 'alta' }]),
    });
    const [fila] = await getSR(`luna_alerta?docente_id=eq.${docente.id}&clave=eq.${encodeURIComponent(clave)}`);
    assert.equal(fila.primera_vez_at, primera, 'la primera emisión queda congelada');

    // Sin policy de UPDATE: ni siquiera la dueña puede correr la fecha.
    const up = await fetch(`${URL}/rest/v1/luna_alerta?docente_id=eq.${docente.id}&clave=eq.${encodeURIComponent(clave)}`, {
      method: 'PATCH', headers: asUser(docente.access_token),
      body: JSON.stringify({ primera_vez_at: new Date().toISOString() }),
    });
    const tras = await getSR(`luna_alerta?docente_id=eq.${docente.id}&clave=eq.${encodeURIComponent(clave)}`);
    assert.equal(tras[0].primera_vez_at, primera, `el UPDATE no debe prosperar (status ${up.status})`);

    // Otra docente no ve nada de la primera.
    const ajenas = await (await fetch(
      `${URL}/rest/v1/luna_alerta?docente_id=eq.${docente.id}`, { headers: asUser(otra.access_token) },
    )).json();
    assert.equal(Array.isArray(ajenas) ? ajenas.length : 0, 0, 'una docente ajena no ve las alertas de otra');
  } finally {
    for (const u of [docente, otra]) {
      if (u?.id) {
        await delSR(`luna_alerta?docente_id=eq.${u.id}`);
        await delSR(`perfil?id=eq.${u.id}`);
        await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
      }
    }
    if (escuela?.id) await delSR(`escuela?id=eq.${escuela.id}`);
  }
});
