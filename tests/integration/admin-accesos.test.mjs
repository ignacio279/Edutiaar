// Tests de integración de admin-accesos (WP3, Dashboard admin v3): trial
// vencido → acceso_de = solo_lectura (corte suave de la 0018), guard no_admin
// con token docente, y el flujo completo de trial/topes con un admin efímero.
// Idempotentes: crean y borran sus propios datos (cleanup en finally, patrón
// luna-rls/admin-fundaciones). Si la fn no está deployada (404), esa parte se
// saltea con aviso — patrón esperarStatus de generador-ejercicios.test.mjs.
// Necesitan envs: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

async function nuevoUsuario(escuelaId, rol) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  if (rol) {
    await fetch(`${URL}/rest/v1/perfil`, {
      method: 'POST',
      headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, escuela_id: escuelaId }]),
    });
  }
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

const getSR = async (table, filtro) =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}`, { headers: sr() })).json();

const borrarUser = (id) =>
  fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: sr() });
const borrarSR = (table, filtro) =>
  fetch(`${URL}/rest/v1/${table}?${filtro}`, { method: 'DELETE', headers: sr() });

// acceso_de tiene EXECUTE solo para service_role: se llama con headers SR.
const accesoDe = async (perfilId) =>
  await (await fetch(`${URL}/rest/v1/rpc/acceso_de`, {
    method: 'POST', headers: sr(), body: JSON.stringify({ p_perfil: perfilId }),
  })).json();

const callFn = (body, token) => fetch(`${URL}/functions/v1/admin-accesos`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Patrón esperarStatus (generador-ejercicios.test.mjs): el body en el mensaje.
async function esperarStatus(r, esperado, contexto) {
  if (r.status !== esperado) {
    assert.fail(`${contexto}: status ${r.status} (esperado ${esperado}) — body: ${(await r.text()).slice(0, 300)}`);
  }
}

// La fn puede no estar deployada todavía (los WP se deployan en la Fase final).
const noDeployada = (r) => r.status === 404;

test('trial vencido del colegio → acceso_de = solo_lectura; la fn rechaza a una docente (no_admin)', { skip }, async () => {
  let esc, doc;
  try {
    esc = await insSR('escuela', {
      nombre: `EfimeraWP3-${rnd()}`, zona: 'test',
      estado: 'trial', trial_inicio: '2020-01-01', trial_fin: '2020-02-01',
    });
    doc = await nuevoUsuario(esc.id, 'docente');

    // El corte suave que admin-accesos administra: trial vencido = solo_lectura.
    const acc = await accesoDe(doc.id);
    assert.equal(acc.estado, 'solo_lectura');
    assert.equal(acc.motivo, 'trial_vencido');
    assert.equal(acc.trial_fin, '2020-02-01');

    // Una docente NO pasa el guard del panel admin.
    const r = await callFn({ accion: 'estado_uso', escuela_id: esc.id }, doc.access_token);
    if (noDeployada(r)) {
      console.warn('admin-accesos no deployada: salteo el chequeo 403 no_admin');
    } else {
      await esperarStatus(r, 403, 'docente contra admin-accesos');
      assert.equal((await r.json()).error, 'no_admin');
    }
  } finally {
    if (doc) await borrarUser(doc.id);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

test('flujo admin: set_trial / extender / finalizar / set_limites / estado_uso + auditoría', { skip }, async () => {
  let esc, admin;
  try {
    esc = await insSR('escuela', { nombre: `EfimeraWP3-${rnd()}`, zona: 'test', estado: 'activo' });
    admin = await nuevoUsuario(null, null); // auth user SIN perfil (ADR-009)
    await insSR('plataforma_admin', { perfil_id: admin.id, nivel: 'operativo', nombre: 'Efimero WP3' });

    let r = await callFn({ accion: 'estado_uso', escuela_id: esc.id }, admin.access_token);
    if (noDeployada(r)) {
      console.warn('admin-accesos no deployada: salteo el flujo completo');
      return;
    }
    await esperarStatus(r, 200, 'estado_uso inicial');
    let data = await r.json();
    assert.equal(data.colegio.id, esc.id);
    assert.deepEqual(Object.keys(data.limites).sort(), ['boletines_mes', 'chats_mes', 'sol_mes'], 'límites efectivos con defaults');
    assert.equal(data.limites_custom, null);
    assert.deepEqual(Object.keys(data.uso).sort(), ['luna.boletines', 'luna.chat', 'sol'], 'uso por feature (alertas sin tope no aparece)');

    // set_trial sobre colegio activo → pasa a 'trial' con las fechas dadas.
    r = await callFn({ accion: 'set_trial', escuela_id: esc.id, inicio: '2026-01-01', fin: '2026-01-31' }, admin.access_token);
    await esperarStatus(r, 200, 'set_trial');
    let [fila] = await getSR('escuela', `id=eq.${esc.id}&select=estado,trial_inicio,trial_fin`);
    assert.deepEqual(fila, { estado: 'trial', trial_inicio: '2026-01-01', trial_fin: '2026-01-31' });

    // Fechas al revés → 400 puro.
    r = await callFn({ accion: 'set_trial', escuela_id: esc.id, inicio: '2026-02-01', fin: '2026-01-01' }, admin.access_token);
    await esperarStatus(r, 400, 'set_trial fechas invertidas');
    assert.equal((await r.json()).error, 'fechas_invalidas');

    // Ambos objetivos a la vez → objetivo_invalido.
    r = await callFn({ accion: 'extender_trial', escuela_id: esc.id, perfil_id: admin.id }, admin.access_token);
    await esperarStatus(r, 400, 'extender con dos objetivos');
    assert.equal((await r.json()).error, 'objetivo_invalido');

    // extender_trial de un trial VENCIDO: corre desde hoy, no desde 2026-01-31.
    r = await callFn({ accion: 'extender_trial', escuela_id: esc.id, dias: 30 }, admin.access_token);
    await esperarStatus(r, 200, 'extender_trial');
    const { nuevo_fin } = await r.json();
    const hoy = new Date().toISOString().slice(0, 10);
    assert.ok(nuevo_fin > hoy, `nuevo_fin ${nuevo_fin} queda en el futuro`);

    // set_limites custom → estado_uso los refleja como efectivos.
    r = await callFn({ accion: 'set_limites', escuela_id: esc.id, limites: { sol_mes: 10, chats_mes: null } }, admin.access_token);
    await esperarStatus(r, 200, 'set_limites');
    r = await callFn({ accion: 'set_limites', escuela_id: esc.id, limites: { sol_mes: -5 } }, admin.access_token);
    await esperarStatus(r, 400, 'set_limites negativo');
    assert.equal((await r.json()).error, 'limites_invalidos');
    r = await callFn({ accion: 'estado_uso', escuela_id: esc.id }, admin.access_token);
    await esperarStatus(r, 200, 'estado_uso con custom');
    data = await r.json();
    assert.equal(data.limites.sol_mes, 10, 'el custom pisa el default');
    assert.equal(data.limites_custom.sol_mes, 10);

    // finalizar_trial → activo, trial_fin limpio.
    r = await callFn({ accion: 'finalizar_trial', escuela_id: esc.id }, admin.access_token);
    await esperarStatus(r, 200, 'finalizar_trial');
    [fila] = await getSR('escuela', `id=eq.${esc.id}&select=estado,trial_fin`);
    assert.deepEqual(fila, { estado: 'activo', trial_fin: null });

    // Toda mutación auditó (fire-and-forget: se le da un respiro).
    let eventos = [];
    for (let i = 0; i < 10 && eventos.length < 4; i++) {
      await new Promise((res) => setTimeout(res, 500));
      eventos = await getSR('auditoria', `entidad_id=eq.${esc.id}&select=accion,actor_id,detalle`);
    }
    const acciones = eventos.map((e) => e.accion).sort();
    assert.deepEqual(acciones, ['extender_trial', 'finalizar_trial', 'set_limites', 'set_trial'], 'una auditoría por mutación');
    for (const e of eventos) assert.equal(e.actor_id, admin.id);
    const ext = eventos.find((e) => e.accion === 'extender_trial');
    assert.equal(ext.detalle.dias, 30);
    assert.equal(ext.detalle.nuevo_fin, nuevo_fin);
  } finally {
    if (esc) await borrarSR('auditoria', `entidad_id=eq.${esc.id}`);
    if (admin) { await borrarSR('plataforma_admin', `perfil_id=eq.${admin.id}`); await borrarUser(admin.id); }
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});
