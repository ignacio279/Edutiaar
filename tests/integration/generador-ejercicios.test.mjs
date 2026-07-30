// Tests de integración del generador de ejercicios (pool inicial + reposición).
// Generan con Claude REAL (Sonnet; el mock fue retirado 2026-07-06) → gastan API y
// tardan minutos. Las CANTIDADES exactas no son garantía del código (Claude puede
// devolver de menos y parseEjercicios descarta inválidos): acá se asertan rangos y
// los contratos que el código SÍ garantiza. Idempotentes. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const ESCUELA = '11111111-1111-4111-8111-111111111111'; // escuela semilla (scripts/seed.mjs)
const TOPE_EJERCICIOS_DIA = 240; // tiene que matchear el de la Edge Function (Regla 4)
const POOL_INICIAL_NODO = 36; // lo PEDIDO por nodo (celdasIniciales: 12 celdas × 3) — Claude puede devolver menos
const LOTE_REPOSICION = 12; // lo PEDIDO por lote de reposición — ídem
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFnAuth = (name, body, token) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Assertea el status con el BODY en el mensaje de error: las funciones mapean
// cualquier error upstream de Claude (rate limit, tope de gasto) a un 400 con el
// motivo en el body — sin esto, el fallo se ve como un "400 !== 200" mudo.
async function esperarStatus(r, esperado, contexto) {
  if (r.status !== esperado) {
    assert.fail(`${contexto}: status ${r.status} (esperado ${esperado}) — body: ${(await r.text()).slice(0, 300)}`);
  }
}

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

// Con Claude REAL la cantidad y la estratificación exactas NO son garantía: el código
// PIDE 36 por nodo (celdasIniciales) pero parseEjercicios descarta ítems inválidos, el
// tipo inválido cae a "reconocer" y el tope diario puede cortar el loop. Lo que SÍ
// garantiza el código: >0 en un pool fresco (0 válidos → 400 sin_ejercicios_validos),
// shape validado, solo la docente dueña, e idempotencia (nodo con pool no se re-siembra).
test('pool inicial: siembra >0 y ≤36 por nodo (shape validado), solo docente dueña, idempotente', { skip }, async () => {
  let doc, intruso, programaId, materiaId;
  try {
    doc = await nuevoUsuario('docente');

    // 1. crear materia+programa+sol_materia+nodo vía dividir-nodos — reutiliza la function ya deployada
    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestGen ${rnd()}`, grado: 2, contenido: 'vocales' }, doc.access_token);
    await esperarStatus(div, 200, 'dividir-nodos');
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    // 2. pool inicial: genera algo, y nunca más de lo pedido
    const r = await callFnAuth('generador-ejercicios', { programa_id }, doc.access_token);
    await esperarStatus(r, 200, 'pool inicial');
    const { generados } = await r.json();
    assert.ok(generados > 0, `pool fresco genera al menos 1 (generados=${generados}; si es 0 puede ser el tope diario ya consumido hoy)`);
    assert.ok(generados <= nodos.length * POOL_INICIAL_NODO, `no más de ${POOL_INICIAL_NODO} por nodo (generados=${generados}, nodos=${nodos.length})`);

    // 3. contrato de parseEjercicios sobre lo insertado (esto SÍ es garantía del código,
    // devuelva lo que devuelva Claude): enunciado no vacío, ≥2 opciones, la correcta
    // entre las opciones, dificultad 1..3, tipo del set válido.
    const TIPOS = ['reconocer', 'completar', 'ordenar', 'producir'];
    const ej = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=enunciado,opciones,correcta,tipo,dificultad`, { headers: srHeaders() })).json();
    assert.ok(ej.length > 0 && ej.length <= POOL_INICIAL_NODO, `el primer nodo tiene entre 1 y ${POOL_INICIAL_NODO} (tiene ${ej.length})`);
    for (const e of ej) {
      assert.ok(e.enunciado.trim().length > 0, 'enunciado no vacío');
      assert.ok(Array.isArray(e.opciones) && e.opciones.length >= 2, 'al menos 2 opciones');
      assert.ok(e.opciones.includes(e.correcta), `la correcta está entre las opciones ("${e.correcta}")`);
      assert.ok(e.dificultad >= 1 && e.dificultad <= 3, `dificultad 1..3 (${e.dificultad})`);
      assert.ok(TIPOS.includes(e.tipo), `tipo válido (${e.tipo})`);
    }

    // 4. otro docente NO puede
    intruso = await nuevoUsuario('docente');
    const rx = await callFnAuth('generador-ejercicios', { programa_id }, intruso.access_token);
    await esperarStatus(rx, 403, 'intruso');

    // 5. idempotente: llamar de nuevo con la dueña no duplica (ya hay ejercicios en cada nodo)
    const r2 = await callFnAuth('generador-ejercicios', { programa_id }, doc.access_token);
    await esperarStatus(r2, 200, 'pool inicial repetido');
    assert.equal((await r2.json()).generados, 0);
    const ejDespues = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=id`, { headers: srHeaders() })).json();
    assert.equal(ejDespues.length, ej.length);
  } finally {
    await limpiar({ programaId, materiaId, usuarios: [doc, intruso] });
  }
});

// La reposición PIDE un lote de 12 (celdasParaLote/LOTE_REPOSICION) pero con Claude
// real la cantidad exacta no es garantía (parseEjercicios descarta inválidos). Lo que
// SÍ garantiza el código: la dueña repone sin gate de necesidad, cada 200 insertó >0,
// nunca más de 12 por lote, y { generados } refleja exactamente lo que entró al pool.
// OJO: el código NO dedupea enunciados al generar (ni hay unique en DB) — DP5 "nunca
// repetir" se garantiza al SERVIR (filtrarNoVistos, web/lib/practica.ts), no acá.
test('reposición: la dueña agrega lotes de >0 y ≤12 que se acumulan en el pool', { skip }, async () => {
  let doc, programaId, materiaId;
  try {
    doc = await nuevoUsuario('docente');
    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestRep ${rnd()}`, grado: 2, contenido: 'vocales' }, doc.access_token);
    await esperarStatus(div, 200, 'dividir-nodos');
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    const contar = async () => (await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=id`, { headers: srHeaders() })).json()).length;

    const rPool = await callFnAuth('generador-ejercicios', { programa_id }, doc.access_token); // pool inicial (pide 36 por nodo)
    await esperarStatus(rPool, 200, 'pool inicial');
    const base = await contar();

    const r1 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, doc.access_token);
    await esperarStatus(r1, 200, 'primer lote');
    const g1 = (await r1.json()).generados;
    assert.ok(g1 > 0 && g1 <= LOTE_REPOSICION, `primer lote entre 1 y ${LOTE_REPOSICION} (generados=${g1})`);
    const r2 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, doc.access_token);
    await esperarStatus(r2, 200, 'segundo lote');
    const g2 = (await r2.json()).generados;
    assert.ok(g2 > 0 && g2 <= LOTE_REPOSICION, `segundo lote entre 1 y ${LOTE_REPOSICION} (generados=${g2})`);

    // { generados } refleja lo insertado: los lotes se ACUMULAN sobre el pool.
    assert.equal(await contar(), base + g1 + g2);
  } finally {
    await limpiar({ programaId, materiaId, usuarios: [doc] });
  }
});

test('reposición como alumno: publicada de su escuela sí; borrador u otra escuela, no', { skip }, async () => {
  let doc, alumno, alumnoOtra, programaId, materiaId, otraEscuelaId;
  try {
    doc = await nuevoUsuario('docente');
    alumno = await nuevoUsuario('alumno', 2); // misma escuela semilla que la seño

    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestAlu ${rnd()}`, grado: 2, contenido: 'vocales' }, doc.access_token);
    await esperarStatus(div, 200, 'dividir-nodos');
    const { programa_id, materia_id, nodos } = await div.json();
    programaId = programa_id;
    materiaId = materia_id;

    const rPool = await callFnAuth('generador-ejercicios', { programa_id }, doc.access_token); // pool inicial (pide 36 por nodo)
    await esperarStatus(rPool, 200, 'pool inicial');

    // (b) con la materia todavía en BORRADOR, el alumno NO puede reponer
    const rBorrador = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, alumno.access_token);
    await esperarStatus(rBorrador, 403, 'alumno con borrador');

    // La seño publica → ahora sí
    const pub = await publicarPrograma(programaId);
    assert.ok(pub.ok, 'publicó la sol_materia');

    // (a) alumno de la MISMA escuela con materia PUBLICADA → 200, pero el pool está
    // lleno (todo sin ver >= umbral de 16 del server): gate server-side, no genera.
    // Con Claude real el pool puede venir con menos de 36; el gate solo aplica si
    // quedó >= 16, así que lo asserteamos como precondición con mensaje claro.
    const poolIds = (await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=id`, { headers: srHeaders() })).json()).map((e) => e.id);
    assert.ok(poolIds.length >= 16, `precondición: el pool inicial dejó >=16 en el nodo (dejó ${poolIds.length}; Claude vino muy corto)`);
    const rOk = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, alumno.access_token);
    await esperarStatus(rOk, 200, 'alumno con pool lleno');
    assert.equal((await rOk.json()).generados, 0);

    // (a2) el gate se levanta cuando el sin-ver cae debajo del umbral: el alumno
    // "responde" todas menos 15 (service role, simulando sesión+respuesta reales) →
    // quedan 15 sin ver (< 16) → ahora sí repone un lote (pide 12, puede insertar menos).
    const responder = poolIds.length - 15;
    const sesRes = await fetch(`${URL}/rest/v1/sesion`, {
      method: 'POST', headers: { ...srHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify([{ alumno_id: alumno.id, nodo_id: nodos[0].id, aciertos: responder, total: responder }]),
    });
    const [sesionAlumno] = await sesRes.json();
    const respRes = await fetch(`${URL}/rest/v1/respuesta`, {
      method: 'POST', headers: { ...srHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(poolIds.slice(0, responder).map((id) => ({ sesion_id: sesionAlumno.id, ejercicio_id: id, dada: 'x', correcta: true, reintentos: 0 }))),
    });
    assert.ok(respRes.ok, `insert de respuestas ok (status ${respRes.status})`);
    const rOk2 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, alumno.access_token);
    await esperarStatus(rOk2, 200, 'alumno reposición');
    const gAlumno = (await rOk2.json()).generados;
    assert.ok(gAlumno > 0 && gAlumno <= LOTE_REPOSICION, `repone entre 1 y ${LOTE_REPOSICION} (generados=${gAlumno})`);

    // (c) alumno de OTRA escuela → 403 aunque esté publicada
    const esc = await (await fetch(`${URL}/rest/v1/escuela`, {
      method: 'POST', headers: { ...srHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify([{ nombre: `Escuela Test ${rnd()}` }]),
    })).json();
    otraEscuelaId = esc[0].id;
    alumnoOtra = await nuevoUsuario('alumno', 2, otraEscuelaId);
    const rOtra = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, alumnoOtra.access_token);
    await esperarStatus(rOtra, 403, 'alumno de otra escuela');
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
    const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestTope ${rnd()}`, grado: 2, contenido: 'vocales' }, doc.access_token);
    await esperarStatus(div, 200, 'dividir-nodos');
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

    const r = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id }, doc.access_token);
    await esperarStatus(r, 429, 'tope diario');
    assert.deepEqual(await r.json(), { error: 'tope_diario' });
  } finally {
    await limpiar({ programaId, materiaId, usuarios: [doc] });
  }
});
