// Tests de integración del alumno golondrina, Fase 1 (migración 0022, ADR-011):
// ciclo de vida de la matrícula (abrir/cerrar vía RPCs), unicidad de la activa,
// consistencia caché perfil == matrícula, corte de scoping al cerrar (es_mi_alumno),
// boletines viejos que quedan para la docente, baja ARCO terminal y perfil_guard.
// Necesitan envs (si faltan, se saltean):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Correr: npm run test:db

import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// materia semilla siempre presente en la DB de desarrollo
const MATERIA = '22222222-2222-4222-8222-222222222222';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });
const asUser = (tok) => ({ apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' });

async function nuevoUsuario(rol, perfilExtra = {}) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, ...perfilExtra }]),
  });
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];

// RPC como service_role devolviendo status+body: los raise exception de las
// RPCs llegan como 400 con el código en message (falta_consentimiento, etc.).
const rpcSR = async (fn, args) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sr(), body: JSON.stringify(args) });
  let body = null;
  try { body = await r.json(); } catch { /* void devuelve vacío */ }
  return { ok: r.ok, status: r.status, body };
};

const getSR = async (table, filtro, select = '*') =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}&select=${select}`, { headers: sr() })).json();
const countAs = async (tok, table, filtro) => {
  const rows = await (await fetch(`${URL}/rest/v1/${table}?${filtro}&select=id`, { headers: asUser(tok) })).json();
  return Array.isArray(rows) ? rows.length : 0;
};
const patchSR = async (table, filtro, body) => {
  const r = await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH', headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  let rows = null;
  try { rows = await r.json(); } catch { /* sin body */ }
  return { ok: r.ok, status: r.status, rows };
};
const patchAs = async (tok, table, filtro, body) => {
  const r = await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH', headers: { ...asUser(tok), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  let rows = null;
  try { rows = await r.json(); } catch { /* sin body */ }
  return { ok: r.ok, status: r.status, rows };
};

const abrir = (alumno, escuela, aula, docente, actor, consentimiento = null) =>
  rpcSR('matricula_abrir', {
    p_alumno: alumno, p_escuela: escuela, p_aula: aula, p_docente: docente,
    p_grado: 3, p_actor: actor, p_consentimiento: consentimiento,
  });
const cerrar = (matricula, motivo, actor) =>
  rpcSR('matricula_cerrar', { p_matricula: matricula, p_motivo: motivo, p_actor: actor });
const matriculaActiva = async (alumnoId) =>
  (await getSR('matricula', `alumno_id=eq.${alumnoId}&fecha_fin=is.null`))[0] ?? null;
const perfilDe = async (alumnoId) =>
  (await getSR('perfil', `id=eq.${alumnoId}`, 'estado,docente_id,aula_id,escuela_id,grado'))[0];

test('matrícula golondrina: ciclo de vida completo (abrir/cerrar, caché, scoping, baja terminal)', { skip }, async () => {
  let escuela, aula, prog, docente, alumno;
  try {
    escuela = await insSR('escuela', { nombre: 'Escuela Efimera Matricula Test' });
    aula = await insSR('aula', { escuela_id: escuela.id, nombre: '3° test', grado: 3, codigo: `MAT-${rnd().slice(0, 6).toUpperCase()}` });
    docente = await nuevoUsuario('docente', { escuela_id: escuela.id });
    // El alumno nace SIN vínculo (el flujo nuevo de crear_alumno): perfil pelado.
    alumno = await nuevoUsuario('alumno', {});

    // 1. Abrir la primera matrícula de la vida: sin consentimiento, legal.
    const a1 = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id);
    assert.ok(a1.ok, `abrir inicial falló: ${JSON.stringify(a1.body)}`);
    const m1 = await matriculaActiva(alumno.id);
    assert.ok(m1, 'quedó una matrícula activa');

    // 2. Consistencia: el caché de perfil ES la matrícula activa.
    let p = await perfilDe(alumno.id);
    assert.equal(p.estado, 'activo');
    assert.equal(p.docente_id, m1.docente_id);
    assert.equal(p.aula_id, m1.aula_id);
    assert.equal(p.escuela_id, m1.escuela_id);
    assert.equal(p.grado, m1.grado);

    // 3. Unicidad: una segunda activa la rechaza el índice parcial de la DB.
    const a2 = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id, crypto.randomUUID());
    assert.equal(a2.ok, false, 'segunda matrícula activa rechazada');
    assert.match(JSON.stringify(a2.body), /matricula_una_activa|duplicate/i);

    // 4. Con la matrícula activa, la docente VE el legajo vivo (es_mi_alumno
    //    lee el caché) y su propia matrícula; y el chico tiene credencial.
    prog = await insSR('programa', { materia_id: MATERIA, grado: 3, contenido: 'test matricula' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo Matricula', orden: 0 });
    const ses = await insSR('sesion', { alumno_id: alumno.id, nodo_id: nodo.id, aciertos: 1, total: 1, duracion_seg: 10 });
    assert.ok(ses?.id, 'sesión sembrada');
    await rpcSR('set_alumno_cred', { p_perfil: alumno.id, p_aula: aula.id, p_pin: '9999', p_email: `alu-${rnd().slice(0, 6)}@students.edutia.local`, p_password: rnd() });
    const boletin = await insSR('boletin', { alumno_id: alumno.id, docente_id: docente.id, periodo: '2026-07', contenido: { secciones: [] } });
    assert.equal(await countAs(docente.access_token, 'sesion', `alumno_id=eq.${alumno.id}`), 1, 'docente ve el legajo vivo');
    assert.equal(await countAs(docente.access_token, 'matricula', `alumno_id=eq.${alumno.id}`), 1, 'docente ve la matrícula');
    assert.equal(await countAs(alumno.access_token, 'matricula', `alumno_id=eq.${alumno.id}`), 1, 'el alumno ve la suya');
    assert.equal((await getSR('alumno_cred', `perfil_id=eq.${alumno.id}`)).length, 1, 'credencial creada');

    // 5. La matrícula NO se escribe directo (sin policies de escritura).
    const wDir = await patchAs(docente.access_token, 'matricula', `id=eq.${m1.id}`, { grado: 5 });
    assert.equal(Array.isArray(wDir.rows) ? wDir.rows.length : 0, 0, 'docente no escribe matricula directo');

    // 6. Cerrar por migración: caché nulled, en_transito, login revocado,
    //    la docente pierde legajo vivo Y matrícula... pero el boletín emitido
    //    queda (archivo institucional: policy docente_id = auth.uid()).
    const c1 = await cerrar(m1.id, 'migracion', docente.id);
    assert.ok(c1.ok, `cerrar falló: ${JSON.stringify(c1.body)}`);
    p = await perfilDe(alumno.id);
    assert.equal(p.estado, 'en_transito');
    assert.equal(p.docente_id, null);
    assert.equal(p.aula_id, null);
    assert.equal(p.escuela_id, null);
    assert.equal((await getSR('alumno_cred', `perfil_id=eq.${alumno.id}`)).length, 0, 'cierre revoca la credencial');
    assert.equal(await countAs(docente.access_token, 'sesion', `alumno_id=eq.${alumno.id}`), 0, 'el colegio pierde el legajo vivo');
    assert.equal(await countAs(docente.access_token, 'matricula', `alumno_id=eq.${alumno.id}`), 0, 'y también la matrícula histórica');
    assert.equal(await countAs(docente.access_token, 'boletin', `id=eq.${boletin.id}`), 1, 'el boletín emitido queda para la docente');
    // El legajo del chico NO se borró: viaja con él.
    assert.equal((await getSR('sesion', `alumno_id=eq.${alumno.id}`)).length, 1, 'el legajo sigue existiendo');

    // 7. Cerrar dos veces la misma: rechazado.
    const c2 = await cerrar(m1.id, 'migracion', docente.id);
    assert.equal(c2.ok, false);
    assert.match(JSON.stringify(c2.body), /matricula_inexistente_o_cerrada/);

    // 8. Reabrir SIN consentimiento: la regla dura de P2 vive en la DB.
    const a3 = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id);
    assert.equal(a3.ok, false);
    assert.match(JSON.stringify(a3.body), /falta_consentimiento/);

    // 9. Reabrir CON consentimiento (transferencia/reingreso): en_transito → activo
    //    y el caché se repuebla. (FK real del consentimiento llega en 0023.)
    const a4 = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id, crypto.randomUUID());
    assert.ok(a4.ok, `reapertura falló: ${JSON.stringify(a4.body)}`);
    p = await perfilDe(alumno.id);
    assert.equal(p.estado, 'activo');
    assert.equal(p.escuela_id, escuela.id, 'caché repoblado');
    assert.equal(await countAs(docente.access_token, 'sesion', `alumno_id=eq.${alumno.id}`), 1, 'el colegio nuevo ve la historia COMPLETA');

    // 10. Egreso → 'egresado'; motivo inválido → rechazado.
    const m2 = await matriculaActiva(alumno.id);
    const cBad = await cerrar(m2.id, 'borrado', docente.id);
    assert.equal(cBad.ok, false);
    await cerrar(m2.id, 'egreso', docente.id);
    assert.equal((await perfilDe(alumno.id)).estado, 'egresado');

    // 11. Baja ARCO: terminal. Reingreso del egresado → ok; cierre arco_baja →
    //     'baja'; y de ahí NO se vuelve (ni con consentimiento).
    const a5 = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id, crypto.randomUUID());
    assert.ok(a5.ok, 'egresado puede reingresar');
    const m3 = await matriculaActiva(alumno.id);
    await cerrar(m3.id, 'arco_baja', docente.id);
    assert.equal((await perfilDe(alumno.id)).estado, 'baja');
    const a6 = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id, crypto.randomUUID());
    assert.equal(a6.ok, false, 'baja es terminal');
    assert.match(JSON.stringify(a6.body), /alumno_dado_de_baja/);

    // 12. Todo el ciclo quedó auditado (abrir x3, cerrar x3 + transiciones).
    const aud = await getSR('auditoria', `entidad_id=eq.${alumno.id}&accion=eq.alumno_transicion`, 'id');
    assert.ok(aud.length >= 5, `transiciones auditadas (hay ${aud.length})`);
  } finally {
    for (const u of [alumno, docente]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (prog) await fetch(`${URL}/rest/v1/programa?id=eq.${prog.id}`, { method: 'DELETE', headers: sr() });
    if (aula) await fetch(`${URL}/rest/v1/aula?id=eq.${aula.id}`, { method: 'DELETE', headers: sr() });
    if (escuela) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});

test('perfil_guard: el vínculo y el estado NO se tocan por fuera de la matrícula', { skip }, async () => {
  let escuela, aula, docente, alumno;
  try {
    escuela = await insSR('escuela', { nombre: 'Escuela Efimera Guard Test' });
    aula = await insSR('aula', { escuela_id: escuela.id, nombre: '3° guard', grado: 3, codigo: `GRD-${rnd().slice(0, 6).toUpperCase()}` });
    docente = await nuevoUsuario('docente', { escuela_id: escuela.id });
    alumno = await nuevoUsuario('alumno', {});
    const a = await abrir(alumno.id, escuela.id, aula.id, docente.id, docente.id);
    assert.ok(a.ok, `abrir falló: ${JSON.stringify(a.body)}`);

    // Ni siquiera el service_role escribe el vínculo directo: el guard corre
    // ANTES que cualquier bypass de RLS (los triggers no se bypassean).
    for (const body of [{ grado: 7 }, { docente_id: null }, { escuela_id: null }, { estado: 'egresado' }]) {
      const r = await patchSR('perfil', `id=eq.${alumno.id}`, body);
      assert.equal(r.ok, false, `patch directo de ${Object.keys(body)[0]} rechazado`);
      assert.match(JSON.stringify(r.rows), /vinculo_protegido/);
    }

    // El alumno tampoco se auto-promueve por PostgREST (agujero de 0002, tapado).
    const self = await patchAs(alumno.access_token, 'perfil', `id=eq.${alumno.id}`, { estado: 'egresado' });
    const selfCambio = Array.isArray(self.rows) && self.rows.length > 0;
    assert.equal(self.ok && selfCambio, false, 'self-update del estado bloqueado');
    assert.equal((await perfilDe(alumno.id)).estado, 'activo', 'el estado no cambió');

    // Lo que NO es vínculo sigue libre (gestión diaria: nombre/avatar).
    const okPatch = await patchSR('perfil', `id=eq.${alumno.id}`, { nombre: 'Rebautizado' });
    assert.ok(okPatch.ok, 'nombre se edita normal');
    assert.equal(okPatch.rows?.[0]?.nombre, 'Rebautizado');
  } finally {
    for (const u of [alumno, docente]) {
      if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: sr() });
    }
    if (aula) await fetch(`${URL}/rest/v1/aula?id=eq.${aula.id}`, { method: 'DELETE', headers: sr() });
    if (escuela) await fetch(`${URL}/rest/v1/escuela?id=eq.${escuela.id}`, { method: 'DELETE', headers: sr() });
  }
});
