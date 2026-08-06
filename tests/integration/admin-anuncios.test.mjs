// Tests de integración de anuncios (migración 0020, WP8 del dashboard admin):
// la policy anuncio_select_docente resuelve rol (solo docentes), alcance
// (global o mi escuela) y vigencia (activo + ventana desde/hasta); nadie
// authenticated escribe (solo la Edge Function admin-anuncios, service_role).
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asAnon = () => ({ apikey: ANON, 'Content-Type': 'application/json' });
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

// PostgREST responde 2xx aunque la RLS filtre todo → SIEMPRE se cuenta.
const selectAs = async (headers, filtro) =>
  await (await fetch(`${URL}/rest/v1/anuncio?${filtro}`, { headers })).json();
const countSR = async (filtro) => {
  const rows = await (await fetch(`${URL}/rest/v1/anuncio?${filtro}&select=id`, { headers: sr() })).json();
  return Array.isArray(rows) ? rows.length : 0;
};

test('0020: anuncio — solo docentes, en alcance y vigencia; nadie escribe por PostgREST', { skip }, async () => {
  let escA, escB, doc, alu;
  const anuncios = [];
  const creadoPor = crypto.randomUUID(); // sin FK: cualquier uuid sirve
  try {
    // ── Seed efímero ──
    escA = await insSR('escuela', { nombre: `EfimeraA-${rnd()}`, zona: 'test', estado: 'activo' });
    escB = await insSR('escuela', { nombre: `EfimeraB-${rnd()}`, zona: 'test', estado: 'activo' });
    doc = await nuevoUsuario(escA.id, 'docente');
    alu = await nuevoUsuario(escA.id, 'alumno', doc.id);

    const crearSR = async (extra) => {
      const a = await insSR('anuncio', {
        titulo: `Anuncio efimero ${rnd()}`, cuerpo: 'cuerpo de prueba', creado_por: creadoPor, ...extra,
      });
      assert.ok(a?.id, 'seed anuncio');
      anuncios.push(a);
      return a;
    };
    const global = await crearSR({ escuela_id: null });
    const deA = await crearSR({ escuela_id: escA.id });
    const deB = await crearSR({ escuela_id: escB.id });
    const inactivo = await crearSR({ escuela_id: null, activo: false });
    const vencido = await crearSR({ escuela_id: null, hasta: '2020-01-01T00:00:00Z' });

    const ids = anuncios.map((a) => a.id).join(',');
    const filtro = `id=in.(${ids})&select=id,titulo,cuerpo`;

    // ── Lectura: la docente de A ve global + el de A, nada más ──
    const vistos = await selectAs(asUser(doc.access_token), filtro);
    assert.equal(vistos.length, 2, `la docente ve exactamente 2 (vio ${vistos.length})`);
    const idsVistos = vistos.map((a) => a.id).sort();
    assert.deepEqual(idsVistos, [global.id, deA.id].sort(), 've el global y el de su colegio');
    assert.ok(!idsVistos.includes(deB.id), 'NO ve el de otro colegio');
    assert.ok(!idsVistos.includes(inactivo.id), 'NO ve el inactivo');
    assert.ok(!idsVistos.includes(vencido.id), 'NO ve el vencido');

    // ── El alumno no ve anuncios (la policy exige rol docente) ──
    const vistosAlu = await selectAs(asUser(alu.access_token), filtro);
    assert.equal(Array.isArray(vistosAlu) ? vistosAlu.length : 0, 0, 'el alumno ve 0');

    // ── anon tampoco ──
    const vistosAnon = await selectAs(asAnon(), filtro);
    assert.equal(Array.isArray(vistosAnon) ? vistosAnon.length : 0, 0, 'anon ve 0');

    // ── Escritura: la docente NO puede insertar (sin policy de INSERT) ──
    const tituloHack = `Hack efimero ${rnd()}`;
    const rIns = await fetch(`${URL}/rest/v1/anuncio`, {
      method: 'POST',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ titulo: tituloHack, cuerpo: 'no deberia entrar', creado_por: doc.id }),
    });
    assert.ok(rIns.status >= 400, `insert de docente rechazado (status ${rIns.status})`);
    assert.equal(await countSR(`titulo=eq.${encodeURIComponent(tituloHack)}`), 0, 'sin fila creada (verificado con service_role)');

    // ── Ni actualizar/borrar lo que ve (sin policy de UPDATE/DELETE) ──
    const rUpd = await (await fetch(`${URL}/rest/v1/anuncio?id=eq.${global.id}`, {
      method: 'PATCH',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ titulo: 'pisado' }),
    })).json();
    assert.equal(Array.isArray(rUpd) ? rUpd.length : 0, 0, 'la docente no actualiza anuncios');
    const rDel = await (await fetch(`${URL}/rest/v1/anuncio?id=eq.${global.id}`, {
      method: 'DELETE',
      headers: { ...asUser(doc.access_token), Prefer: 'return=representation' },
    })).json();
    assert.equal(Array.isArray(rDel) ? rDel.length : 0, 0, 'la docente no borra anuncios');
    assert.equal(await countSR(`id=eq.${global.id}`), 1, 'el global sigue intacto');
  } finally {
    // Limpieza efímera: anuncios explícitos (los globales no cascadan con nada),
    // después usuarios y escuelas (el de B caería solo por cascade, pero mejor
    // explícito e idempotente).
    for (const a of anuncios) {
      if (a?.id) await fetch(`${URL}/rest/v1/anuncio?id=eq.${a.id}`, { method: 'DELETE', headers: sr() });
    }
    for (const u of [alu, doc]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    for (const e of [escA, escB]) {
      if (e?.id) await fetch(`${URL}/rest/v1/escuela?id=eq.${e.id}`, { method: 'DELETE', headers: sr() });
    }
  }
});
