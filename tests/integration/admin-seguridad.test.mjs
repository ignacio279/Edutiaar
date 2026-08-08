// Tests de integración de WP9 — Seguridad (Dashboard admin v3): que la
// auditoría sea REALMENTE server-only, que las fns admin-* rechacen tokens que
// no son de admin, y que la gestión de admins exija nivel super.
// Idempotentes: crean y borran sus propios datos efímeros (cleanup en finally,
// siempre: auth users + filas). Necesitan envs (si faltan, se saltean):
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// OJO: los tests que pegan a una Edge Function la necesitan DEPLOYADA; si no lo
// está, el fetch da 404 y esperarStatus muestra el body para que se vea.
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const comoToken = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const callFn = (fn, accion, body, token) => fetch(`${URL}/functions/v1/${fn}`, {
  method: 'POST',
  headers: comoToken(token),
  body: JSON.stringify({ accion, ...body }),
});

// Assertea el status con el BODY en el mensaje: si la fn no está deployada el
// fetch da 404 y sin esto el fallo se ve como un "404 !== 403" mudo.
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

// Usuario efímero. rol 'admin' = auth user SIN fila en perfil (ADR-009: el
// admin de plataforma vive solo en plataforma_admin).
async function nuevoUsuario(escuelaId, rol) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  if (rol !== 'admin') {
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

// (1) La tabla `auditoria` es server-only: RLS activa y CERO policies, así que
// PostgREST no le devuelve una fila a NADIE con token de usuario.
test('auditoria: invisible por PostgREST con token de docente, visible con service_role', { skip }, async () => {
  let esc, doc, eventoId;
  try {
    esc = await insSR('escuela', { nombre: `EfimeraSeg-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');

    const evento = await insSR('auditoria', {
      actor_id: doc.id,
      actor_email: `espia-${rnd()}@efimeros.edutia.local`,
      nivel: 'super',
      accion: 'test_seguridad',
      entidad: 'perfil',
      entidad_id: doc.id,
      detalle: { secreto: 'no se ve desde el front' },
    });
    eventoId = evento.id;

    // Con el token de la docente: 0 filas (ni la suya propia, ni la de todos).
    const comoDocente = await fetch(`${URL}/rest/v1/auditoria?select=id`, { headers: comoToken(doc.access_token) });
    assert.equal(comoDocente.status, 200, 'PostgREST responde (RLS filtra, no rompe)');
    const filas = await comoDocente.json();
    assert.ok(Array.isArray(filas), `esperaba una lista, vino: ${JSON.stringify(filas).slice(0, 200)}`);
    assert.equal(filas.length, 0, 'la auditoría NO se lee con un token de usuario');

    // Filtrando por la fila que sabemos que existe: tampoco.
    const dirigido = await (await fetch(
      `${URL}/rest/v1/auditoria?select=id&id=eq.${eventoId}`,
      { headers: comoToken(doc.access_token) },
    )).json();
    assert.equal(dirigido.length, 0, 'ni pidiéndola por id');

    // Con service_role sí (es el único camino, además de la Edge Function).
    const comoSR = await (await fetch(
      `${URL}/rest/v1/auditoria?select=id,accion,actor_id&id=eq.${eventoId}`,
      { headers: sr() },
    )).json();
    assert.equal(comoSR.length, 1, 'service_role sí la lee');
    assert.equal(comoSR[0].accion, 'test_seguridad');
    assert.equal(comoSR[0].actor_id, doc.id);
  } finally {
    if (eventoId) await borrarSR('auditoria', `id=eq.${eventoId}`);
    if (doc) {
      await borrarSR('auditoria', `actor_id=eq.${doc.id}`);
      await borrarUser(doc.id);
    }
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

// (2) El guard de las fns admin-*: una docente logueada es un usuario válido
// para Supabase, pero no tiene fila en plataforma_admin → 403 no_admin.
test('admin-auditoria: un token de DOCENTE recibe 403 no_admin', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', { nombre: `EfimeraSeg-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(esc.id, 'docente');

    const r = await callFn('admin-auditoria', 'listar', {}, doc.access_token);
    await esperarStatus(r, 403, 'docente llamando admin-auditoria listar (¿está deployada?)');
    assert.deepEqual(await r.json(), { error: 'no_admin' });
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

// (3) La gestión de admins es solo del super: hasta LISTAR exige nivel super,
// así que un operativo real (fila activa en plataforma_admin) se come un 403.
test('admin-plataforma: un admin OPERATIVO recibe 403 requiere_super hasta para listar', { skip }, async () => {
  let admin;
  try {
    admin = await nuevoUsuario(null, 'admin');
    await insSR('plataforma_admin', { perfil_id: admin.id, nivel: 'operativo', nombre: 'Efimero operativo' });

    // Sanity: el token es de un admin de verdad (si no, el error sería no_admin).
    const rAud = await callFn('admin-auditoria', 'listar', { limite: 1 }, admin.access_token);
    await esperarStatus(rAud, 200, 'el operativo sí puede leer la auditoría');

    const r = await callFn('admin-plataforma', 'listar_admins', {}, admin.access_token);
    await esperarStatus(r, 403, 'operativo llamando listar_admins (¿está deployada admin-plataforma?)');
    assert.deepEqual(await r.json(), { error: 'requiere_super' });

    // Y tampoco puede mutar.
    const rx = await callFn('admin-plataforma', 'desactivar_admin', { perfil_id: admin.id }, admin.access_token);
    await esperarStatus(rx, 403, 'operativo desactivando a alguien');
    assert.deepEqual(await rx.json(), { error: 'requiere_super' });

    // Sigue activo: el 403 fue antes de tocar nada.
    const fila = await (await fetch(
      `${URL}/rest/v1/plataforma_admin?select=activo,nivel&perfil_id=eq.${admin.id}`,
      { headers: sr() },
    )).json();
    assert.equal(fila[0].activo, true);
    assert.equal(fila[0].nivel, 'operativo');
  } finally {
    if (admin) {
      await borrarSR('auditoria', `actor_id=eq.${admin.id}`);
      await borrarSR('plataforma_admin', `perfil_id=eq.${admin.id}`);
      await borrarUser(admin.id);
    }
  }
});

// (4) Contrato de escritura de la auditoría: el shape que insertan las fns
// (_shared/auditoria.ts) entra tal cual y se lee igual con service_role.
test('auditoria: un evento insertado con service_role se guarda y se relee completo', { skip }, async () => {
  let esc, eventoId;
  try {
    esc = await insSR('escuela', { nombre: `EfimeraAud-${rnd()}`, zona: 'test', estado: 'activo' });
    const actorId = crypto.randomUUID();
    const email = `admin-${rnd()}@efimeros.edutia.local`;

    const evento = await insSR('auditoria', {
      actor_id: actorId,
      actor_email: email,
      nivel: 'super',
      accion: 'ver_como',
      entidad: 'escuela',
      entidad_id: esc.id,
      detalle: { motivo: 'test de integración', anidado: { ok: true } },
    });
    eventoId = evento.id;
    assert.ok(eventoId, 'la inserción devolvió el id');
    assert.ok(evento.created_at, 'created_at se completa solo (default now())');

    const leido = (await (await fetch(
      `${URL}/rest/v1/auditoria?select=*&id=eq.${eventoId}`,
      { headers: sr() },
    )).json())[0];
    assert.equal(leido.actor_id, actorId);
    assert.equal(leido.actor_email, email);
    assert.equal(leido.nivel, 'super');
    assert.equal(leido.accion, 'ver_como');
    assert.equal(leido.entidad, 'escuela');
    assert.equal(leido.entidad_id, esc.id);
    assert.deepEqual(leido.detalle, { motivo: 'test de integración', anidado: { ok: true } });

    // El índice por entidad sirve para lo que lo usamos: buscar por entidad+id.
    const porEntidad = await (await fetch(
      `${URL}/rest/v1/auditoria?select=id&entidad=eq.escuela&entidad_id=eq.${esc.id}`,
      { headers: sr() },
    )).json();
    assert.equal(porEntidad.length, 1);
  } finally {
    if (eventoId) await borrarSR('auditoria', `id=eq.${eventoId}`);
    if (esc) {
      await borrarSR('auditoria', `entidad_id=eq.${esc.id}`);
      await borrarSR('escuela', `id=eq.${esc.id}`);
    }
  }
});
