// Tests de integración de nodo_nap_guard (migración 0031, Task 10 de la
// revisión final de marco-nap-observatorio — hallazgos 4 y 5):
//   (4) una docente NO puede escribir las columnas nap_* de sus propios nodos
//       (nodo_update_autor es agnóstica de columnas; el guard cierra esa
//       puerta) — service_role sigue pudiendo.
//   (5) editar nombre/descripcion de un nodo invalida su clasificación
//       (nap_revisado → false, nap_intentos → 0, nap_confianza → null,
//       nap_tema_id se conserva); editar otra columna no la toca.
// Necesita las migraciones 0022–0031 aplicadas. Sin envs se saltea.
// Idempotente: crea y borra sus propios datos efímeros (marcados QA-),
// limpieza por id, nunca por nombre.
// Correr: npm run test:db -- --test-name-pattern="nap-guard"
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// materia semilla siempre presente en la DB de desarrollo (usada en el resto de tests/integration)
const MATERIA = '22222222-2222-4222-8222-222222222222';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];

const getSR = async (table, filtro, select = '*') =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}&select=${select}`, { headers: sr() })).json();

// PATCH que devuelve status + body (nunca .ok solo — el guard responde 400,
// no un 200 con 0 filas, así que hay que leer status y mensaje).
const patchRaw = async (headers, table, filtro, body) => {
  const r = await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch { /* sin body */ }
  return { status: r.status, ok: r.ok, json };
};

async function nuevaDocente(escuelaId) {
  const email = `qa-nap-guard-docente-${rnd()}@efimeros.edutia.local`;
  const password = `Pw-${rnd()}`;
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol: 'docente', nombre: 'QA Docente nap-guard', escuela_id: escuelaId }]),
  });
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

test('nodo_nap_guard: la docente no escribe el mapeo, el servidor sí, y editar texto invalida', { skip }, async () => {
  let escuela, docente, prog, nodo, eje, tema;
  try {
    // Seed: escuela + docente dueña + programa/nodo suyo (vía sol_materia) +
    // un nap_tema real para intentar setear nap_tema_id.
    escuela = await insSR('escuela', { nombre: `QA-nap-guard-${rnd()}` });
    docente = await nuevaDocente(escuela.id);
    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'QA nap-guard' });
    nodo = await insSR('nodo', { programa_id: prog.id, nombre: `QA nodo nap-guard ${rnd()}`, orden: 0 });
    await insSR('sol_materia', {
      programa_id: prog.id, docente_id: docente.id, escuela_id: escuela.id, estado: 'borrador',
    });
    eje = await insSR('nap_eje', { materia: 'Matemática', nombre: `QA-eje-nap-guard-${rnd()}`, orden: 999 });
    tema = await insSR('nap_tema', { eje_id: eje.id, nombre: `QA-tema-nap-guard-${rnd()}`, grado: 3, orden: 999 });
    assert.ok(nodo?.id && tema?.id, 'seed completo');

    // (1) La docente NO puede marcar su propio nodo como revisado.
    const r1 = await patchRaw(asUser(docente.access_token), 'nodo', `id=eq.${nodo.id}`, { nap_revisado: true });
    assert.ok(r1.status >= 400, `esperaba error, vino ${r1.status}`);
    assert.match(r1.json?.message ?? '', /mapeo_protegido/, 'el mensaje identifica el guard');
    let fila = (await getSR('nodo', `id=eq.${nodo.id}`))[0];
    assert.equal(fila.nap_revisado, false, 'nap_revisado no se movió');

    // (2) La docente NO puede cambiar el tema propuesto.
    const r2 = await patchRaw(asUser(docente.access_token), 'nodo', `id=eq.${nodo.id}`, { nap_tema_id: tema.id });
    assert.ok(r2.status >= 400, `esperaba error, vino ${r2.status}`);
    fila = (await getSR('nodo', `id=eq.${nodo.id}`))[0];
    assert.equal(fila.nap_tema_id, null, 'nap_tema_id sigue null');

    // (3) service_role SÍ puede escribir el mapeo (el camino real de
    // dividir-nodos / admin-jobs / admin-colegios).
    const r3 = await patchRaw(sr(), 'nodo', `id=eq.${nodo.id}`,
      { nap_tema_id: tema.id, nap_confianza: 0.9, nap_revisado: true, nap_intentos: 2 });
    assert.equal(r3.status, 200, `service_role debería poder escribir el mapeo: ${JSON.stringify(r3.json)}`);
    fila = (await getSR('nodo', `id=eq.${nodo.id}`))[0];
    assert.equal(fila.nap_revisado, true);
    assert.equal(fila.nap_tema_id, tema.id);
    assert.equal(fila.nap_intentos, 2);
    assert.equal(fila.nap_confianza, 0.9);

    // (4) Editar el texto del nodo invalida la clasificación. El tema
    // propuesto se conserva (punto de partida para quien revise).
    const r4 = await patchRaw(asUser(docente.access_token), 'nodo', `id=eq.${nodo.id}`,
      { nombre: `QA nodo nap-guard editado ${rnd()}` });
    assert.equal(r4.status, 200, `la docente sí puede editar el texto: ${JSON.stringify(r4.json)}`);
    fila = (await getSR('nodo', `id=eq.${nodo.id}`))[0];
    assert.equal(fila.nap_revisado, false, 'la invalidación limpió nap_revisado');
    assert.equal(fila.nap_intentos, 0, 'la invalidación reinició nap_intentos');
    assert.equal(fila.nap_confianza, null, 'la invalidación borró nap_confianza');
    assert.equal(fila.nap_tema_id, tema.id, 'nap_tema_id se conserva como punto de partida');

    // (5) Editar otra columna (orden) no toca el mapeo.
    const r5 = await patchRaw(asUser(docente.access_token), 'nodo', `id=eq.${nodo.id}`, { orden: 7 });
    assert.equal(r5.status, 200, `la docente puede reordenar su nodo: ${JSON.stringify(r5.json)}`);
    fila = (await getSR('nodo', `id=eq.${nodo.id}`))[0];
    assert.equal(fila.orden, 7);
    assert.equal(fila.nap_revisado, false, 'orden no reactiva la clasificación');
    assert.equal(fila.nap_intentos, 0, 'orden no toca nap_intentos');
    assert.equal(fila.nap_confianza, null, 'orden no toca nap_confianza');
    assert.equal(fila.nap_tema_id, tema.id, 'orden no toca nap_tema_id');
  } finally {
    if (tema) await fetch(`${URL}/rest/v1/nap_tema?id=eq.${tema.id}`, { method: 'DELETE', headers: sr() });
    if (eje) await fetch(`${URL}/rest/v1/nap_eje?id=eq.${eje.id}`, { method: 'DELETE', headers: sr() });
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() }); // cascade: sol_materia + nodo
    if (docente?.id) await fetch(`${URL}/auth/v1/admin/users/${docente.id}`, { method: 'DELETE', headers: sr() });
    if (escuela) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});
