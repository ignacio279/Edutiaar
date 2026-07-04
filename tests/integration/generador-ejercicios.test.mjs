// Tests de integración del generador de ejercicios (pool inicial + reposición).
// Corren en modo MOCK → NO necesitan ANTHROPIC_API_KEY. Idempotentes. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const ESCUELA = '11111111-1111-4111-8111-111111111111'; // escuela semilla (scripts/seed.mjs)
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFnAuth = (name, body, token) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Crea un docente efímero y devuelve { id, access_token }.
async function nuevoDocente() {
  const email = `doc-${rnd()}@docentes.edutia.local`;
  const password = rnd();
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: srHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const id = (await cr.json()).id;
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...srHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol: 'docente', nombre: 'Test Seño', escuela_id: ESCUELA }]),
  });
  const tok = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token: tok.access_token };
}

// Borra todo lo efímero: el programa cascadea ejercicio/nodo/sol_materia.
async function limpiar({ programaId, materiaId, docentes }) {
  if (programaId) await fetch(`${URL}/rest/v1/programa?id=eq.${programaId}`, { method: 'DELETE', headers: srHeaders() });
  if (materiaId) await fetch(`${URL}/rest/v1/materia?id=eq.${materiaId}`, { method: 'DELETE', headers: srHeaders() });
  for (const d of docentes) {
    if (d?.id) await fetch(`${URL}/auth/v1/admin/users/${d.id}`, { method: 'DELETE', headers: srHeaders() });
  }
}

test('pool inicial: 36 ejercicios estratificados por nodo, solo docente dueña', { skip }, async () => {
  let doc, intruso, programaId, materiaId;
  try {
    doc = await nuevoDocente();

    // 1. crear materia+programa+sol_materia+nodo vía dividir-nodos (mock) — reutiliza la function ya deployada
    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestGen ${rnd()}`, grado: 2, contenido: 'vocales', mock: true }, doc.access_token);
    assert.equal(div.status, 200);
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    // 2. pool inicial
    const r = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token);
    assert.equal(r.status, 200);
    const { generados } = await r.json();
    assert.equal(generados, nodos.length * 36);

    // 3. estratos: el nodo tiene 3 por celda (12 celdas)
    const ej = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=tipo,dificultad`, { headers: srHeaders() })).json();
    assert.equal(ej.length, 36);
    assert.equal(ej.filter((e) => e.tipo === 'producir' && e.dificultad === 3).length, 3);

    // 4. otro docente NO puede
    intruso = await nuevoDocente();
    const rx = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, intruso.access_token);
    assert.equal(rx.status, 403);

    // 5. idempotente: llamar de nuevo con la dueña no duplica (ya hay ejercicios en cada nodo)
    const r2 = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token);
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).generados, 0);
    const ejDespues = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=id`, { headers: srHeaders() })).json();
    assert.equal(ejDespues.length, 36);
  } finally {
    await limpiar({ programaId, materiaId, docentes: [doc, intruso] });
  }
});

test('reposición: agrega 12 sin repetir enunciados', { skip }, async () => {
  let doc, programaId, materiaId;
  try {
    doc = await nuevoDocente();
    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestRep ${rnd()}`, grado: 2, contenido: 'vocales', mock: true }, doc.access_token);
    assert.equal(div.status, 200);
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token); // pool inicial: 36
    const r1 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, doc.access_token);
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).generados, 12);
    const r2 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, doc.access_token);
    assert.equal((await r2.json()).generados, 12);
    const filas = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=enunciado`, { headers: srHeaders() })).json();
    assert.equal(filas.length, 36 + 12 + 12);
    assert.equal(new Set(filas.map((f) => f.enunciado)).size, filas.length); // DP5: ni un enunciado repetido
  } finally {
    await limpiar({ programaId, materiaId, docentes: [doc] });
  }
});
