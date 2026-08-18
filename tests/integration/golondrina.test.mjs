// Tests de integración del alumno golondrina (Fase 3): transferencias con su
// endpoint público, derechos ARCO y el scoping de dos niveles de las
// instituciones. Complementan tests/integration/matricula.test.mjs (que cubre
// el ciclo de vida de la matrícula y perfil_guard).
//
// Necesitan las fns DEPLOYADAS (gestion-transferencias, transferencia-confirmar,
// admin-arco, admin-instituciones, institucion-panel, admin-jobs) y las
// migraciones 0022–0027 aplicadas. Sin envs se saltean.
// Idempotentes: cada test crea y borra sus propios datos efímeros.
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFn = (fn, accion, body, token) => fetch(`${URL}/functions/v1/${fn}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ accion, ...body }),
});

async function esperarStatus(r, esperado, contexto) {
  if (r.status !== esperado) {
    assert.fail(`${contexto}: status ${r.status} (esperado ${esperado}) — body: ${(await r.text()).slice(0, 300)}`);
  }
}

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];

const getSR = async (table, filtro, select = '*') =>
  await (await fetch(`${URL}/rest/v1/${table}?${filtro}&select=${select}`, { headers: sr() })).json();

const patchSR = async (table, filtro, body) => {
  const r = await fetch(`${URL}/rest/v1/${table}?${filtro}`, {
    method: 'PATCH', headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  let rows = null;
  try { rows = await r.json(); } catch { /* sin body */ }
  return { ok: r.ok, status: r.status, rows };
};

const rpcSR = async (fn, args) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sr(), body: JSON.stringify(args) });
  let body = null;
  try { body = await r.json(); } catch { /* void */ }
  return { ok: r.ok, status: r.status, body };
};

const borrarUser = (id) => fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: sr() });
const borrarSR = (table, filtro) => fetch(`${URL}/rest/v1/${table}?${filtro}`, { method: 'DELETE', headers: sr() });

// rol: 'docente' | 'alumno' | 'admin' (plataforma, sin perfil) |
//      'admin_institucion' (tabla propia, sin perfil).
async function nuevoUsuario(rol, extra = {}) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: sr(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  if (rol === 'admin') {
    await insSR('plataforma_admin', {
      perfil_id: id, nivel: extra.nivel ?? 'super', nombre: 'Test admin', activo: true,
    });
  } else if (rol === 'admin_institucion') {
    await insSR('institucion_admin', {
      perfil_id: id, institucion_id: extra.institucion_id, nombre: 'Test coord', activo: true,
    });
  } else {
    await fetch(`${URL}/rest/v1/perfil`, {
      method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, ...(extra.perfil ?? {}) }]),
    });
  }
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, email, access_token };
}

const sha256Hex = async (texto) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))),
).map((b) => b.toString(16).padStart(2, '0')).join('');

// ── Transferencias ──────────────────────────────────────────────────────────

test('transferencia por link: un solo uso, lockout y consentimiento obligatorio', { skip }, async () => {
  let escA, escB, aula, docente, alumno, admin;
  try {
    escA = await insSR('escuela', { nombre: `Origen-${rnd()}`, zona: 'test', estado: 'activo' });
    escB = await insSR('escuela', { nombre: `Destino-${rnd()}`, zona: 'test', estado: 'activo' });
    aula = await insSR('aula', { escuela_id: escA.id, nombre: '3°', grado: 3, codigo: `TRF-${rnd().slice(0, 6).toUpperCase()}` });
    docente = await nuevoUsuario('docente', { perfil: { escuela_id: escA.id } });
    await patchSR('aula', `id=eq.${aula.id}`, { docente_id: docente.id });
    alumno = await nuevoUsuario('alumno', {});
    admin = await nuevoUsuario('admin', { nivel: 'super' });

    const abrir = await rpcSR('matricula_abrir', {
      p_alumno: alumno.id, p_escuela: escA.id, p_aula: aula.id, p_docente: docente.id,
      p_grado: 3, p_actor: docente.id, p_consentimiento: null,
    });
    assert.ok(abrir.ok, `matricula_abrir: ${JSON.stringify(abrir.body)}`);
    // Rastro de aprendizaje que TIENE que sobrevivir al pase.
    const prog = await insSR('programa', { materia_id: '22222222-2222-4222-8222-222222222222', grado: 3, contenido: 'test golondrina' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo golondrina', orden: 0 });
    await insSR('sesion', { alumno_id: alumno.id, nodo_id: nodo.id, aciertos: 2, total: 3, duracion_seg: 30 });

    // (1) La docente de origen genera el pase.
    const rSol = await callFn('gestion-transferencias', 'solicitar',
      { alumno_id: alumno.id, escuela_destino_id: escB.id }, docente.access_token);
    await esperarStatus(rSol, 200, 'solicitar (¿está deployada gestion-transferencias?)');
    const { transferencia, link } = await rSol.json();
    assert.ok(link && link.includes('#'), 'devuelve el link con el token en el fragment');
    const token = link.split('#')[1];
    const fila = (await getSR('transferencia', `id=eq.${transferencia.id}`))[0];
    assert.equal(fila.token_hash, await sha256Hex(token), 'en la DB vive el hash, no el token');
    assert.ok(fila.expira_at, 'tiene vencimiento');

    // (2) Una segunda pendiente del mismo alumno se rechaza.
    const rDup = await callFn('gestion-transferencias', 'solicitar',
      { alumno_id: alumno.id, escuela_destino_id: escB.id }, docente.access_token);
    assert.ok(rDup.status >= 400, 'segunda pendiente rechazada');

    // (3) Token malo e id inexistente responden EXACTAMENTE lo mismo.
    const rMal = await callFn('transferencia-confirmar', 'ver', { transferencia_id: transferencia.id, token: 'nope' });
    const rFantasma = await callFn('transferencia-confirmar', 'ver', { transferencia_id: crypto.randomUUID(), token: 'nope' });
    assert.equal(rMal.status, 403);
    assert.equal(rFantasma.status, 403);
    assert.deepEqual(await rMal.json(), await rFantasma.json(), 'sin enumeración de transferencias');

    // (4) `ver` con token bueno: SOLO nombre de pila y escuelas.
    const rVer = await callFn('transferencia-confirmar', 'ver', { transferencia_id: transferencia.id, token });
    await esperarStatus(rVer, 200, 'ver con token válido');
    const vista = await rVer.json();
    assert.equal(vista.escuela_destino, escB.nombre);
    assert.ok(!JSON.stringify(vista).includes(alumno.id), 'no filtra el id del alumno');
    assert.ok(!('alumno_id' in vista) && !('legajo' in vista), 'no filtra legajo ni ids');

    // (5) Confirmar: consentimiento + cierre + apertura en destino.
    const rConf = await callFn('transferencia-confirmar', 'confirmar', {
      transferencia_id: transferencia.id, token, adulto_nombre: 'Griselda', adulto_vinculo: 'madre',
    });
    await esperarStatus(rConf, 200, 'confirmar');
    const cons = await getSR('consentimiento', `alumno_id=eq.${alumno.id}&alcance=eq.transferencia`);
    assert.equal(cons.length, 1, 'quedó el consentimiento de la transferencia');
    assert.equal(cons[0].via, 'link');
    assert.equal(cons[0].estado, 'vigente');
    const activas = await getSR('matricula', `alumno_id=eq.${alumno.id}&fecha_fin=is.null`);
    assert.equal(activas.length, 1, 'una sola matrícula activa');
    assert.equal(activas[0].escuela_id, escB.id, 'ahora en el colegio destino');
    assert.equal(activas[0].docente_id, null, 'llega "para activar", sin docente');
    assert.equal(activas[0].consentimiento_id, cons[0].id, 'la matrícula apunta al consentimiento');
    const sesiones = await getSR('sesion', `alumno_id=eq.${alumno.id}`);
    assert.equal(sesiones.length, 1, 'el legajo viajó con el chico');
    assert.equal((await getSR('alumno_cred', `perfil_id=eq.${alumno.id}`)).length, 0, 'el cierre revocó el login');

    // (6) Reuso del mismo link: ya no sirve.
    const rReuso = await callFn('transferencia-confirmar', 'confirmar', {
      transferencia_id: transferencia.id, token, adulto_nombre: 'Griselda', adulto_vinculo: 'madre',
    });
    assert.equal(rReuso.status, 409, 'un solo uso');

    // (7) El CHECK de la DB: no se puede confirmar sin consentimiento ni por SQL.
    const trucha = await insSR('transferencia', {
      alumno_id: alumno.id, escuela_origen: escA.id, escuela_destino: escB.id,
      estado: 'pendiente', expira_at: new Date(Date.now() + 86400000).toISOString(),
    });
    const rCheck = await patchSR('transferencia', `id=eq.${trucha.id}`, {
      estado: 'confirmada', confirmada_via: 'link', resuelta_at: new Date().toISOString(),
    });
    assert.equal(rCheck.ok, false, 'sin consentimiento_id la DB rechaza confirmar');

    // (8) Vencida + expirar_transferencias del cron.
    await patchSR('transferencia', `id=eq.${trucha.id}`, { expira_at: new Date(Date.now() - 86400000).toISOString() });
    const rExp = await callFn('admin-jobs', 'expirar_transferencias', {}, admin.access_token);
    await esperarStatus(rExp, 200, 'expirar_transferencias');
    assert.equal((await getSR('transferencia', `id=eq.${trucha.id}`))[0].estado, 'expirada');
  } finally {
    for (const u of [alumno, docente, admin]) if (u?.id) await borrarUser(u.id);
    if (escA) { await borrarSR('transferencia', `escuela_origen=eq.${escA.id}`); await borrarSR('aula', `escuela_id=eq.${escA.id}`); }
    if (escA) await borrarSR('escuela', `id=eq.${escA.id}`);
    if (escB) await borrarSR('escuela', `id=eq.${escB.id}`);
  }
});

test('lockout del link público: cinco tokens malos y queda bloqueado', { skip }, async () => {
  let esc, escB, aula, docente, alumno;
  try {
    esc = await insSR('escuela', { nombre: `Lock-${rnd()}`, zona: 'test', estado: 'activo' });
    escB = await insSR('escuela', { nombre: `LockB-${rnd()}`, zona: 'test', estado: 'activo' });
    aula = await insSR('aula', { escuela_id: esc.id, nombre: '3°', grado: 3, codigo: `LCK-${rnd().slice(0, 6).toUpperCase()}` });
    docente = await nuevoUsuario('docente', { perfil: { escuela_id: esc.id } });
    await patchSR('aula', `id=eq.${aula.id}`, { docente_id: docente.id });
    alumno = await nuevoUsuario('alumno', {});
    await rpcSR('matricula_abrir', {
      p_alumno: alumno.id, p_escuela: esc.id, p_aula: aula.id, p_docente: docente.id,
      p_grado: 3, p_actor: docente.id, p_consentimiento: null,
    });
    const rSol = await callFn('gestion-transferencias', 'solicitar',
      { alumno_id: alumno.id, escuela_destino_id: escB.id }, docente.access_token);
    await esperarStatus(rSol, 200, 'solicitar');
    const { transferencia, link } = await rSol.json();
    const token = link.split('#')[1];

    for (let i = 0; i < 5; i++) {
      const r = await callFn('transferencia-confirmar', 'ver', { transferencia_id: transferencia.id, token: `malo-${i}` });
      assert.equal(r.status, 403, `intento ${i + 1} rechazado`);
    }
    // Al 5° fallo quedó bloqueada: ni el token BUENO entra.
    const rBloq = await callFn('transferencia-confirmar', 'ver', { transferencia_id: transferencia.id, token });
    assert.equal(rBloq.status, 429, 'bloqueada tras 5 fallos');
    const fila = (await getSR('transferencia', `id=eq.${transferencia.id}`))[0];
    assert.ok(fila.bloqueada_hasta, 'la DB guarda hasta cuándo');
    assert.equal(fila.intentos_fallidos, 0, 'el contador se resetea al bloquear');
  } finally {
    for (const u of [alumno, docente]) if (u?.id) await borrarUser(u.id);
    if (esc) { await borrarSR('transferencia', `escuela_origen=eq.${esc.id}`); await borrarSR('aula', `escuela_id=eq.${esc.id}`); await borrarSR('escuela', `id=eq.${esc.id}`); }
    if (escB) await borrarSR('escuela', `id=eq.${escB.id}`);
  }
});

// ── ARCO ────────────────────────────────────────────────────────────────────

test('ARCO: cancelación en dos pasos, solo super, y solo queda el agregado anónimo', { skip }, async () => {
  let esc, aula, docente, alumno, superA, operativo, prog;
  try {
    esc = await insSR('escuela', { nombre: `Arco-${rnd()}`, zona: 'test', provincia: 'Chaco', estado: 'activo' });
    aula = await insSR('aula', { escuela_id: esc.id, nombre: '5°', grado: 5, codigo: `ARC-${rnd().slice(0, 6).toUpperCase()}` });
    docente = await nuevoUsuario('docente', { perfil: { escuela_id: esc.id } });
    await patchSR('aula', `id=eq.${aula.id}`, { docente_id: docente.id });
    alumno = await nuevoUsuario('alumno', {});
    superA = await nuevoUsuario('admin', { nivel: 'super' });
    operativo = await nuevoUsuario('admin', { nivel: 'operativo' });

    await rpcSR('matricula_abrir', {
      p_alumno: alumno.id, p_escuela: esc.id, p_aula: aula.id, p_docente: docente.id,
      p_grado: 5, p_actor: docente.id, p_consentimiento: null,
    });
    prog = await insSR('programa', { materia_id: '22222222-2222-4222-8222-222222222222', grado: 5, contenido: 'test arco' });
    const nodo = await insSR('nodo', { programa_id: prog.id, nombre: 'Nodo arco', orden: 0 });
    await insSR('sesion', { alumno_id: alumno.id, nodo_id: nodo.id, aciertos: 3, total: 4, duracion_seg: 40 });
    await insSR('boletin', { alumno_id: alumno.id, docente_id: docente.id, periodo: '2026-07', contenido: { secciones: [] } });

    // (1) Export del legajo: completo y sin ids de terceros.
    const rExp = await callFn('admin-arco', 'exportar_legajo', { alumno_id: alumno.id }, superA.access_token);
    await esperarStatus(rExp, 200, 'exportar_legajo (¿está deployada admin-arco?)');
    const { legajo } = await rExp.json();
    assert.ok(legajo.sesiones.length >= 1, 'el legajo trae las sesiones');
    assert.ok(!JSON.stringify(legajo).includes(docente.id), 'no filtra el id de la docente');

    // (2) Oposición: la escribe la RPC, no un PATCH suelto.
    const rOp = await callFn('admin-arco', 'oponer', { alumno_id: alumno.id, excluido: true }, superA.access_token);
    await esperarStatus(rOp, 200, 'oponer');
    assert.equal((await getSR('perfil', `id=eq.${alumno.id}`, 'excluido_procesamiento'))[0].excluido_procesamiento, true);
    const rGuard = await patchSR('perfil', `id=eq.${alumno.id}`, { excluido_procesamiento: false });
    assert.equal(rGuard.ok, false, 'perfil_guard rechaza el PATCH directo');
    assert.match(JSON.stringify(rGuard.rows), /vinculo_protegido/);

    // (3) Cancelación paso 1: dry-run con conteos reales, sin borrar nada.
    const rSol = await callFn('admin-arco', 'cancelacion_solicitar',
      { alumno_id: alumno.id, detalle_texto: 'La familia lo pidió por teléfono' }, superA.access_token);
    await esperarStatus(rSol, 200, 'cancelacion_solicitar');
    const { caso, dry_run } = await rSol.json();
    const item = (clave) => dry_run.find((i) => i.clave === clave)?.cantidad ?? 0;
    assert.equal(item('sesiones'), 1, 'el dry-run cuenta la sesión');
    assert.equal(item('boletines'), 1, 'y el boletín');
    assert.equal((await getSR('sesion', `alumno_id=eq.${alumno.id}`)).length, 1, 'todavía NO borró nada');

    // (4) Paso 2 con admin OPERATIVO: rechazado.
    const rNoSuper = await callFn('admin-arco', 'cancelacion_confirmar', { caso_id: caso.id }, operativo.access_token);
    await esperarStatus(rNoSuper, 403, 'operativo confirmando cancelación');

    // (5) Paso 2 con SUPER: el único borrado real del sistema.
    const rConf = await callFn('admin-arco', 'cancelacion_confirmar', { caso_id: caso.id }, superA.access_token);
    await esperarStatus(rConf, 200, 'cancelacion_confirmar con super');
    assert.equal((await getSR('perfil', `id=eq.${alumno.id}`)).length, 0, 'el perfil ya no existe');
    assert.equal((await getSR('sesion', `alumno_id=eq.${alumno.id}`)).length, 0, 'legajo borrado');
    assert.equal((await getSR('boletin', `alumno_id=eq.${alumno.id}`)).length, 0, 'boletines borrados');
    assert.equal((await getSR('matricula', `alumno_id=eq.${alumno.id}`)).length, 0, 'matrículas borradas');

    // (6) Lo que SOBREVIVE: el caso con su agregado anónimo y la auditoría.
    const casoFinal = (await getSR('arco_caso', `id=eq.${caso.id}`))[0];
    assert.equal(casoFinal.estado, 'ejecutado');
    assert.ok(casoFinal.agregado, 'quedó el agregado');
    assert.equal(casoFinal.agregado.sesiones, 1);
    assert.equal(casoFinal.agregado.provincia, 'Chaco');
    const serial = JSON.stringify(casoFinal.agregado);
    assert.ok(!serial.includes(alumno.id), 'el agregado no lleva el id del chico');
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serial), 'ningún uuid en el agregado');
    const aud = await getSR('auditoria', `entidad_id=eq.${caso.id}`, 'id');
    assert.ok(aud.length >= 1, 'la auditoría sobrevive');
  } finally {
    for (const u of [alumno, docente, superA, operativo]) if (u?.id) await borrarUser(u.id);
    if (prog) await borrarSR('programa', `id=eq.${prog.id}`);
    if (aula) await borrarSR('aula', `id=eq.${aula.id}`);
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
  }
});

// ── Instituciones: el límite que NO se puede cruzar ─────────────────────────

test('institucion-panel: fail-closed, sin cruce entre instituciones y sin datos de chicos', { skip }, async () => {
  let instA, instB, escA, escB, aula, docente, alumno, coordA;
  try {
    instA = await insSR('institucion', { nombre: `InstA-${rnd()}`, tipo: 'fundacion', estado: 'activa' });
    instB = await insSR('institucion', { nombre: `InstB-${rnd()}`, tipo: 'red', estado: 'activa' });
    escA = await insSR('escuela', { nombre: `ColA-${rnd()}`, zona: 'test', estado: 'activo', institucion_id: instA.id });
    escB = await insSR('escuela', { nombre: `ColB-${rnd()}`, zona: 'test', estado: 'activo', institucion_id: instB.id });
    aula = await insSR('aula', { escuela_id: escA.id, nombre: '3°', grado: 3, codigo: `INS-${rnd().slice(0, 6).toUpperCase()}` });
    docente = await nuevoUsuario('docente', { perfil: { escuela_id: escA.id } });
    await patchSR('aula', `id=eq.${aula.id}`, { docente_id: docente.id });
    alumno = await nuevoUsuario('alumno', { perfil: { nombre: 'Zulema Testigo' } });
    await rpcSR('matricula_abrir', {
      p_alumno: alumno.id, p_escuela: escA.id, p_aula: aula.id, p_docente: docente.id,
      p_grado: 3, p_actor: docente.id, p_consentimiento: null,
    });
    coordA = await nuevoUsuario('admin_institucion', { institucion_id: instA.id });

    // (1) Resumen: solo SUS colegios, y sin un solo dato de chico.
    const rRes = await callFn('institucion-panel', 'resumen', {}, coordA.access_token);
    await esperarStatus(rRes, 200, 'resumen (¿está deployada institucion-panel?)');
    const resumen = await rRes.json();
    const ids = resumen.colegios.map((c) => c.id);
    assert.deepEqual(ids, [escA.id], 've solo el colegio de SU institución');
    const serial = JSON.stringify(resumen);
    assert.ok(!serial.includes(alumno.id), 'ningún id de alumno');
    assert.ok(!serial.includes('Zulema'), 'ningún nombre de alumno');
    assert.equal(resumen.colegios[0].matriculas_activas, 1, 'pero sí el conteo');

    // (2) Cruce: pedir métricas de un colegio de OTRA institución → 403.
    const rCruce = await callFn('institucion-panel', 'metricas', { escuela_id: escB.id }, coordA.access_token);
    await esperarStatus(rCruce, 403, 'cruce entre instituciones');
    assert.equal((await rCruce.json()).error, 'fuera_de_tu_institucion');

    const rCruce2 = await callFn('institucion-panel', 'deuda_consentimientos', { escuela_id: escB.id }, coordA.access_token);
    await esperarStatus(rCruce2, 403, 'cruce en deuda_consentimientos');

    // (3) Fail-closed: contra una fn de plataforma no es admin de nada.
    const rPlataforma = await callFn('admin-colegios', 'listar', {}, coordA.access_token);
    await esperarStatus(rPlataforma, 403, 'admin de institución contra admin-colegios');
    assert.equal((await rPlataforma.json()).error, 'no_admin');

    // (4) Métricas propias: volumen y costo, y NUNCA precisión por colegio
    //     (2026-08-18: se retiró; no es comparable entre colegios y acá la
    //     miraba quien tiene poder de ranking sobre esas escuelas — el
    //     aprendizaje se mira en la acción `desempeno`, contra los NAP).
    const rMet = await callFn('institucion-panel', 'metricas', {}, coordA.access_token);
    await esperarStatus(rMet, 200, 'metricas propias');
    const fila = (await rMet.json()).filas.find((f) => f.escuela_id === escA.id);
    assert.ok(Number.isFinite(fila.sesiones), 'la fila trae volumen');
    assert.ok(Number.isFinite(fila.costo_mes_usd), 'la fila trae costo');
    for (const k of Object.keys(fila)) {
      assert.ok(!/precision|precisi\u00f3n/i.test(k), `la fila NO trae precisión (vino "${k}")`);
    }

    // (5) Institución suspendida: sus admins quedan afuera enteros.
    await patchSR('institucion', `id=eq.${instA.id}`, { estado: 'suspendida' });
    const rSusp = await callFn('institucion-panel', 'resumen', {}, coordA.access_token);
    await esperarStatus(rSusp, 403, 'institución suspendida');
    assert.equal((await rSusp.json()).error, 'institucion_suspendida');
  } finally {
    for (const u of [alumno, docente, coordA]) if (u?.id) await borrarUser(u.id);
    if (aula) await borrarSR('aula', `id=eq.${aula.id}`);
    if (escA) await borrarSR('escuela', `id=eq.${escA.id}`);
    if (escB) await borrarSR('escuela', `id=eq.${escB.id}`);
    if (instA) await borrarSR('institucion', `id=eq.${instA.id}`);
    if (instB) await borrarSR('institucion', `id=eq.${instB.id}`);
  }
});

test('licencias: cupos del pool y corte suave por vencimiento', { skip }, async () => {
  let inst, esc1, esc2, docente, lic;
  try {
    inst = await insSR('institucion', { nombre: `Pool-${rnd()}`, tipo: 'fundacion', estado: 'activa' });
    esc1 = await insSR('escuela', { nombre: `P1-${rnd()}`, zona: 'test', estado: 'activo', institucion_id: inst.id });
    esc2 = await insSR('escuela', { nombre: `P2-${rnd()}`, zona: 'test', estado: 'activo', institucion_id: inst.id });
    docente = await nuevoUsuario('docente', { perfil: { escuela_id: esc1.id } });

    // (1) Pool de UN cupo: la segunda asignación la frena el trigger.
    lic = await insSR('licencia', {
      institucion_id: inst.id, plan: 'docente', cupos: 1, estado: 'activa',
      fecha_fin: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    });
    const a1 = await fetch(`${URL}/rest/v1/licencia_asignacion`, {
      method: 'POST', headers: sr(), body: JSON.stringify({ escuela_id: esc1.id, licencia_id: lic.id }),
    });
    assert.ok(a1.ok, 'primera asignación entra');
    const a2 = await fetch(`${URL}/rest/v1/licencia_asignacion`, {
      method: 'POST', headers: sr(), body: JSON.stringify({ escuela_id: esc2.id, licencia_id: lic.id }),
    });
    assert.equal(a2.ok, false, 'la segunda no: sin cupos');
    assert.match(await a2.text(), /sin_cupos/);

    // (2) Con el pool activo, la docente del colegio asignado opera normal.
    const activo = await rpcSR('acceso_de', { p_perfil: docente.id });
    assert.equal(activo.body.estado, 'activo', `acceso con licencia activa: ${JSON.stringify(activo.body)}`);

    // (3) Vencida → SOLO LECTURA (corte suave: ve todo, no genera).
    await patchSR('licencia', `id=eq.${lic.id}`, {
      fecha_fin: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    });
    const vencida = await rpcSR('acceso_de', { p_perfil: docente.id });
    assert.equal(vencida.body.estado, 'solo_lectura', 'vencida = solo lectura, nunca borrar');
    assert.equal(vencida.body.motivo, 'licencia_vencida');

    // (4) Suspendida → bloqueado.
    await patchSR('licencia', `id=eq.${lic.id}`, { estado: 'suspendida' });
    const susp = await rpcSR('acceso_de', { p_perfil: docente.id });
    assert.equal(susp.body.estado, 'bloqueado');
    assert.equal(susp.body.motivo, 'licencia_suspendida');
  } finally {
    if (docente?.id) await borrarUser(docente.id);
    if (lic) await borrarSR('licencia_asignacion', `licencia_id=eq.${lic.id}`);
    if (lic) await borrarSR('licencia', `id=eq.${lic.id}`);
    for (const e of [esc1, esc2]) if (e) await borrarSR('escuela', `id=eq.${e.id}`);
    if (inst) await borrarSR('institucion', `id=eq.${inst.id}`);
  }
});
