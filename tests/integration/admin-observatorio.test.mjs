// Tests de integración de admin-observatorio (WP-A — fase "Observatorio y
// avisos"): guard no_admin con token de docente, resumen con k-anonimato
// verificado sobre datos efímeros y provincia inválida → 400. Idempotentes:
// crean y borran sus propios datos efímeros (cleanup en finally). Necesitan
// envs (si faltan, se saltean): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
// OJO: los tests que pegan a la Edge Function necesitan admin-observatorio
// DEPLOYADA (y la migración 0021 aplicada — escuela.provincia); si no, el
// fetch da 404/400 y esperarStatus muestra el body.
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// materia semilla siempre presente en la DB de desarrollo (igual que panel-rls).
const MATERIA = '22222222-2222-4222-8222-222222222222';
// Provincia poco probable en datos reales: el assert de muestraInsuficiente
// asume que no hay 5+ alumnos reales activos acá (los efímeros son 2).
const PROVINCIA = 'Tierra del Fuego';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFn = (accion, body, token) => fetch(`${URL}/functions/v1/admin-observatorio`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion, ...body }),
});

// Assertea el status con el BODY en el mensaje: si la fn no está deployada el
// fetch da 404 y sin esto el fallo se ve como un "404 !== 403" mudo (patrón de
// admin-colegios.test.mjs).
async function esperarStatus(r, esperado, contexto) {
  if (r.status !== esperado) {
    assert.fail(`${contexto}: status ${r.status} (esperado ${esperado}) — body: ${(await r.text()).slice(0, 300)}`);
  }
}

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];

const borrarUser = (id) =>
  fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: sr() });
const borrarSR = (table, filtro) =>
  fetch(`${URL}/rest/v1/${table}?${filtro}`, { method: 'DELETE', headers: sr() });

async function nuevoUsuario(escuelaId, rol) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  if (rol !== 'admin') {
    // El admin de plataforma NO tiene fila en perfil (ADR-009).
    const perfilData = { id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId };
    if (rol === 'alumno') perfilData.grado = 3;
    await fetch(`${URL}/rest/v1/perfil`, {
      method: 'POST',
      headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([perfilData]),
    });
  }
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

test('admin-observatorio: un token de DOCENTE recibe 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `Efimera-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');
    const r = await callFn('resumen', {}, doc.access_token);
    await esperarStatus(r, 403, 'docente llamando resumen');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

// El corazón del observatorio: agregado por provincia con k-anonimato. Se
// siembran 2 alumnos con sesiones (2 < K_ANONIMATO=5) → la fila de la
// provincia trae los conteos de volumen pero el desempeño anulado. De paso se
// verifica el anonimato estructural sobre la respuesta REAL de la fn.
test('resumen: la provincia sembrada aparece con colegios>=1 y muestraInsuficiente (2 < 5)', { skip }, async () => {
  let esc, prog, admin, a1, a2;
  try {
    esc = await insSR('escuela', {
      nombre: `EfimeraObs-${rnd()}`, zona: 'test', estado: 'activo', provincia: PROVINCIA,
    });
    assert.ok(esc?.id, `escuela efímera con provincia creada (¿está aplicada la 0021?) — ${JSON.stringify(esc)}`);

    a1 = await nuevoUsuario(esc.id, 'alumno');
    a2 = await nuevoUsuario(esc.id, 'alumno');

    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test observatorio' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo Observatorio', orden: 0 });

    for (const [alumno, aciertos] of [[a1, 4], [a2, 2]]) {
      const ses = await insSR('sesion', {
        alumno_id: alumno.id, nodo_id: nodo.id, aciertos, total: 5, duracion_seg: 60,
      });
      assert.ok(ses?.id, 'sesión sembrada');
    }

    admin = await nuevoUsuario(null, 'admin');
    await insSR('plataforma_admin', { perfil_id: admin.id, nivel: 'operativo', nombre: 'Efimero' });

    const r = await callFn('resumen', { rango_dias: 30 }, admin.access_token);
    await esperarStatus(r, 200, 'resumen vía fn (¿está deployada admin-observatorio?)');
    const data = await r.json();
    assert.equal(data.rango_dias, 30);
    assert.ok(data.generado_en, 'trae generado_en');
    assert.ok(Array.isArray(data.provincias), 'provincias es lista');

    const fila = data.provincias.find((f) => f.provincia === PROVINCIA);
    assert.ok(fila, `la fila de ${PROVINCIA} está`);
    assert.ok(fila.colegios >= 1, 'cuenta al colegio efímero');
    assert.ok(fila.alumnosActivos >= 2, 'los 2 alumnos con sesión cuentan');
    assert.equal(fila.muestraInsuficiente, true, '2 alumnos < k=5 → muestra insuficiente');
    assert.equal(fila.precision, null, 'k-anonimato: sin precisión con muestra chica');

    // Anonimato estructural sobre la respuesta real: ni nombres ni ids de alumnos.
    const texto = JSON.stringify(data);
    assert.ok(!texto.includes(a1.id) && !texto.includes(a2.id), 'ningún id de alumno viaja');
    assert.ok(!texto.includes('"nombre"') && !texto.includes('"alumno_id"'), 'sin claves individuales');
  } finally {
    if (prog) await borrarSR('programa', `id=eq.${prog.id}`); // cascadea nodo y sesiones
    for (const u of [a1, a2]) if (u?.id) await borrarUser(u.id);
    if (admin) {
      await borrarSR('plataforma_admin', `perfil_id=eq.${admin.id}`);
      await borrarUser(admin.id);
    }
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('materias con provincia inválida → 400 provincia_invalida', { skip }, async () => {
  let admin;
  try {
    admin = await nuevoUsuario(null, 'admin');
    await insSR('plataforma_admin', { perfil_id: admin.id, nivel: 'operativo', nombre: 'Efimero' });
    const r = await callFn('materias', { provincia: 'Marte' }, admin.access_token);
    await esperarStatus(r, 400, 'materias con provincia Marte');
    assert.deepEqual(await r.json(), { error: 'provincia_invalida' });
  } finally {
    if (admin) {
      await borrarSR('plataforma_admin', `perfil_id=eq.${admin.id}`);
      await borrarUser(admin.id);
    }
  }
});
