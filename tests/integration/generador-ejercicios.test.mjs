// Tests de integración del generador de ejercicios (pool inicial + reposición).
// Corren en modo MOCK → NO necesitan ANTHROPIC_API_KEY. Idempotentes. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const ESCUELA = '11111111-1111-4111-8111-111111111111'; // escuela semilla (scripts/seed.mjs)
const TOPE_EJERCICIOS_DIA = 240; // tiene que matchear el de la Edge Function (Regla 4)
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFnAuth = (name, body, token) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Crea un usuario efímero (docente o alumno) y devuelve { id, access_token }.
async function nuevoUsuario(rol, grado, escuelaId = ESCUELA) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: srHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const id = (await cr.json()).id;
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...srHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId, grado: grado ?? null }]),
  });
  const tok = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token: tok.access_token };
}

// Publica la sol_materia de un programa (service role, como haría la seño desde la UI).
const publicarPrograma = (programaId) => fetch(`${URL}/rest/v1/sol_materia?programa_id=eq.${programaId}`, {
  method: 'PATCH', headers: { ...srHeaders(), Prefer: 'return=minimal' },
  body: JSON.stringify({ estado: 'publicado' }),
});

// Borra todo lo efímero: el programa cascadea ejercicio/nodo/sol_materia.
async function limpiar({ programaId, materiaId, usuarios = [], escuelaId }) {
  if (programaId) await fetch(`${URL}/rest/v1/programa?id=eq.${programaId}`, { method: 'DELETE', headers: srHeaders() });
  if (materiaId) await fetch(`${URL}/rest/v1/materia?id=eq.${materiaId}`, { method: 'DELETE', headers: srHeaders() });
  for (const u of usuarios) {
    if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: srHeaders() });
  }
  if (escuelaId) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuelaId}`, { method: 'DELETE', headers: srHeaders() });
}

test('pool inicial: 36 ejercicios estratificados por nodo, solo docente dueña', { skip }, async () => {
  let doc, intruso, programaId, materiaId;
  try {
    doc = await nuevoUsuario('docente');

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
    intruso = await nuevoUsuario('docente');
    const rx = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, intruso.access_token);
    assert.equal(rx.status, 403);

    // 5. idempotente: llamar de nuevo con la dueña no duplica (ya hay ejercicios en cada nodo)
    const r2 = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token);
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).generados, 0);
    const ejDespues = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=id`, { headers: srHeaders() })).json();
    assert.equal(ejDespues.length, 36);
  } finally {
    await limpiar({ programaId, materiaId, usuarios: [doc, intruso] });
  }
});

test('reposición: agrega 12 sin repetir enunciados', { skip }, async () => {
  let doc, programaId, materiaId;
  try {
    doc = await nuevoUsuario('docente');
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
    await limpiar({ programaId, materiaId, usuarios: [doc] });
  }
});

test('reposición como alumno: publicada de su escuela sí; borrador u otra escuela, no', { skip }, async () => {
  let doc, alumno, alumnoOtra, programaId, materiaId, otraEscuelaId;
  try {
    doc = await nuevoUsuario('docente');
    alumno = await nuevoUsuario('alumno', 2); // misma escuela semilla que la seño

    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestAlu ${rnd()}`, grado: 2, contenido: 'vocales', mock: true }, doc.access_token);
    assert.equal(div.status, 200);
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token); // pool inicial: 36

    // (b) con la materia todavía en BORRADOR, el alumno NO puede reponer
    const rBorrador = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, alumno.access_token);
    assert.equal(rBorrador.status, 403);

    // La seño publica → ahora sí
    const pub = await publicarPrograma(programaId);
    assert.ok(pub.ok, 'publicó la sol_materia');

    // (a) alumno de la MISMA escuela con materia PUBLICADA → 200, lote de 12
    const rOk = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, alumno.access_token);
    assert.equal(rOk.status, 200);
    assert.equal((await rOk.json()).generados, 12);

    // (c) alumno de OTRA escuela → 403 aunque esté publicada
    const esc = await (await fetch(`${URL}/rest/v1/escuela`, {
      method: 'POST', headers: { ...srHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify([{ nombre: `Escuela Test ${rnd()}` }]),
    })).json();
    otraEscuelaId = esc[0].id;
    alumnoOtra = await nuevoUsuario('alumno', 2, otraEscuelaId);
    const rOtra = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, alumnoOtra.access_token);
    assert.equal(rOtra.status, 403);
  } finally {
    await limpiar({ programaId, materiaId, usuarios: [doc, alumno, alumnoOtra], escuelaId: otraEscuelaId });
  }
});

// OJO: el tope diario cuenta ejercicios de HOY globalmente (toda la tabla, Regla 4).
// Este test llena el cupo del día, así que va ÚLTIMO en el archivo para no dejar sin
// cupo a los tests de arriba, y borra TODO lo suyo en el finally (el DELETE del
// programa cascadea los 240 de relleno, liberando el cupo).
test('tope diario: con el cupo del día lleno, la reposición responde 429 tope_diario', { skip }, async () => {
  let doc, programaId, materiaId;
  try {
    doc = await nuevoUsuario('docente');
    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestTope ${rnd()}`, grado: 2, contenido: 'vocales', mock: true }, doc.access_token);
    assert.equal(div.status, 200);
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    // Llenar el cupo de hoy: TOPE filas efímeras en un solo INSERT (service role).
    const relleno = Array.from({ length: TOPE_EJERCICIOS_DIA }, (_, i) => ({
      nodo_id: nodos[0].id,
      enunciado: `(tope ${i}) relleno efímero ${rnd()}`,
      opciones: ['a', 'b', 'c', 'd'],
      correcta: 'a',
      dificultad: 1,
      tipo: 'reconocer',
    }));
    const ins = await fetch(`${URL}/rest/v1/ejercicio`, {
      method: 'POST', headers: { ...srHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(relleno),
    });
    assert.ok(ins.ok, `insert del relleno ok (status ${ins.status})`);

    const r = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, doc.access_token);
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { error: 'tope_diario' });
  } finally {
    await limpiar({ programaId, materiaId, usuarios: [doc] });
  }
});
