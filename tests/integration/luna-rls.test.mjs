// Tests de integración LUNA: scoping por docente de boletin y luna_mensaje
// (migración 0016), ciclo de estados del boletín (borrador → aprobado →
// corregir → re-aprobar) y limpieza del chat. luna_uso no tiene policies:
// nadie authenticated la toca.
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

// PATCH/DELETE/SELECT devolviendo filas (PostgREST responde 2xx aunque la RLS
// filtre todo, así que SIEMPRE se cuenta).
const selectAs = async (tok, table, filtro) =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}`, { headers: asUser(tok) })).json();
const patchAs = async (tok, table, filtro, body) =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH',
    headers: { ...asUser(tok), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })).json();
const deleteAs = async (tok, table, filtro) =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'DELETE',
    headers: { ...asUser(tok), Prefer: 'return=representation' },
  })).json();
const countSR = async (table, filtro, col = 'docente_id') => {
  const rows = await (await fetch(`${URL}/rest/v1/${table}?${filtro}&select=${col}`, { headers: sr() })).json();
  return Array.isArray(rows) ? rows.length : 0;
};

test('LUNA: boletin y luna_mensaje respetan el scoping por docente (RLS 0016)', { skip }, async () => {
  let escuela, docA, docB, alumno, boletin;
  try {
    // Seed efímero: docente A dueña, docente B ajena, alumno de A, boletín
    // borrador de A (insertado con service_role: así lo hace luna-boletin) y
    // dos mensajes de chat de A.
    escuela = await insSR('escuela', { nombre: 'Escuela Efimera Luna Test' });
    docA = await nuevoUsuario(escuela.id, 'docente');
    docB = await nuevoUsuario(escuela.id, 'docente');
    alumno = await nuevoUsuario(escuela.id, 'alumno', docA.id);

    boletin = await insSR('boletin', {
      alumno_id: alumno.id, docente_id: docA.id, periodo: '2026-07',
      contenido: { secciones: [{ titulo: 'Lengua', texto: 'borrador inicial' }], actitud: 'x', sugerencia_proximo_periodo: 'y' },
    });
    assert.ok(boletin?.id, 'seed boletin');
    assert.equal(boletin.estado, 'borrador');
    await insSR('luna_mensaje', { docente_id: docA.id, role: 'user', content: 'hola LUNA' });
    await insSR('luna_mensaje', { docente_id: docA.id, role: 'luna', content: 'hola seño' });

    // --- Scoping de lectura ---
    assert.equal((await selectAs(docA.access_token, 'boletin', `id=eq.${boletin.id}`)).length, 1, 'A lee su boletín');
    assert.equal((await selectAs(docB.access_token, 'boletin', `id=eq.${boletin.id}`)).length, 0, 'B NO lee el boletín de A');
    assert.equal((await selectAs(alumno.access_token, 'boletin', `alumno_id=eq.${alumno.id}`)).length, 0, 'el alumno NO lee boletines');
    assert.equal((await selectAs(docA.access_token, 'luna_mensaje', `docente_id=eq.${docA.id}`)).length, 2, 'A lee su hilo');
    assert.equal((await selectAs(docB.access_token, 'luna_mensaje', `docente_id=eq.${docA.id}`)).length, 0, 'B NO lee el hilo de A');

    // --- luna_uso: sin policies → invisible para authenticated ---
    await fetch(`${URL}/rest/v1/luna_uso`, {
      method: 'POST', headers: { ...sr(), Prefer: 'return=minimal' },
      body: JSON.stringify({ docente_id: docA.id, dia: '2026-07-28', chats: 1 }),
    });
    const usoVisto = await selectAs(docA.access_token, 'luna_uso', `docente_id=eq.${docA.id}`);
    assert.equal(Array.isArray(usoVisto) ? usoVisto.length : 0, 0, 'ni la dueña ve luna_uso (solo service_role)');

    // --- Ciclo del boletín ---
    const edit = await patchAs(docA.access_token, 'boletin', `id=eq.${boletin.id}`, {
      contenido: { secciones: [{ titulo: 'Lengua', texto: 'editado por la seño' }], actitud: 'x', sugerencia_proximo_periodo: 'y' },
    });
    assert.equal(edit.length, 1, 'A edita su borrador');

    const editB = await patchAs(docB.access_token, 'boletin', `id=eq.${boletin.id}`, { contenido: { secciones: [], actitud: 'hack', sugerencia_proximo_periodo: '' } });
    assert.equal(editB.length, 0, 'B NO edita el boletín de A');

    const aprob = await patchAs(docA.access_token, 'boletin', `id=eq.${boletin.id}`, {
      estado: 'aprobado', aprobado_por: docA.id, aprobado_at: new Date().toISOString(),
    });
    assert.equal(aprob.length, 1, 'A aprueba');
    assert.equal(aprob[0].estado, 'aprobado');

    // Corregir: vuelve a borrador subiendo versión (decisión validada: el
    // aprobado es corregible por su dueña).
    const corr = await patchAs(docA.access_token, 'boletin', `id=eq.${boletin.id}`, {
      estado: 'borrador', aprobado_por: null, aprobado_at: null, version: aprob[0].version + 1,
    });
    assert.equal(corr.length, 1, 'A corrige (aprobado → borrador)');
    assert.equal(corr[0].version, boletin.version + 1, 'la versión sube al corregir');

    const reaprob = await patchAs(docA.access_token, 'boletin', `id=eq.${boletin.id}`, {
      estado: 'aprobado', aprobado_por: docA.id, aprobado_at: new Date().toISOString(),
    });
    assert.equal(reaprob.length, 1, 'A re-aprueba');

    // --- Limpieza del chat ---
    const delB = await deleteAs(docB.access_token, 'luna_mensaje', `docente_id=eq.${docA.id}`);
    assert.equal(delB.length, 0, 'B NO borra el hilo de A');
    const delA = await deleteAs(docA.access_token, 'luna_mensaje', `docente_id=eq.${docA.id}`);
    assert.equal(delA.length, 2, 'A limpia su conversación');
    assert.equal(await countSR('luna_mensaje', `docente_id=eq.${docA.id}`), 0, 'el hilo quedó vacío');
  } finally {
    // Limpieza efímera: borrar usuarios arrastra perfil → cascade a boletin,
    // luna_mensaje y luna_uso; después cae la escuela.
    for (const u of [alumno, docA, docB]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (escuela?.id) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});

// --- 0017: luna_alerta_atendida — el "Listo ✓" es de cada docente ---

test('LUNA: luna_alerta_atendida respeta a la dueña (RLS 0017)', { skip }, async () => {
  let escuela, docA, docB;
  try {
    escuela = await insSR('escuela', { nombre: `Esc Test ${rnd()}` });
    docA = await nuevoUsuario(escuela.id, 'docente');
    docB = await nuevoUsuario(escuela.id, 'docente');

    // A inserta SU clave como usuaria (insert directo vía RLS, sin service_role).
    const insA = await fetch(`${URL}/rest/v1/luna_alerta_atendida`, {
      method: 'POST',
      headers: { ...asUser(docA.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ docente_id: docA.id, clave: 'inactividad:x1' }),
    });
    assert.equal(insA.status, 201, 'la docente inserta su propia atendida');

    // B no la ve; A sí.
    assert.equal((await selectAs(docB.access_token, 'luna_alerta_atendida', 'select=clave')).length, 0, 'B no ve atendidas de A');
    assert.equal((await selectAs(docA.access_token, 'luna_alerta_atendida', 'select=clave')).length, 1, 'A ve la suya');

    // B NO puede insertar una atendida a nombre de A (with check).
    const insB = await fetch(`${URL}/rest/v1/luna_alerta_atendida`, {
      method: 'POST',
      headers: { ...asUser(docB.access_token), Prefer: 'return=representation' },
      body: JSON.stringify({ docente_id: docA.id, clave: 'evita_tipo:x2' }),
    });
    assert.ok(insB.status >= 400, `insert ajeno rechazado (status ${insB.status})`);

    // A borra la suya (reactivación futura); queda limpio.
    const del = await deleteAs(docA.access_token, 'luna_alerta_atendida', `clave=eq.inactividad:x1`);
    assert.equal(del.length, 1, 'A borra su atendida');
  } finally {
    for (const u of [docA, docB]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (escuela?.id) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});
