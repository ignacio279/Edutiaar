// EDUTIA — seed de demo del "alumno golondrina" (ADR-011, migraciones 0022-0027).
// Arma la foto que demuestra cada pieza de la fase:
//   · Institución "Fundación Semillas" con DOS colegios y un pool de licencias
//     (3 cupos, 1 asignado) + un admin de institución.
//   · Wanda: alumna con historial en los DOS colegios (matrícula cerrada por
//     migración en el primero, activa en el segundo con consentimiento) — el
//     colegio nuevo ve su recorrido COMPLETO.
//   · Simón: alumno en tránsito (matrícula cerrada, legajo esperando intacto,
//     login revocado) con una transferencia PENDIENTE hacia el colegio 2.
//   · Un caso ARCO de cancelación EJECUTADO (de un alumno que ya no existe:
//     solo queda el agregado anónimo — así se ve en /admin/arco).
// Idempotente: usa IDs fijos y verifica antes de crear. NO toca la data de
// scripts/seed.mjs (la escuela Cerro Azul sigue como está).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-golondrina.mjs

import { randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ID = {
  institucion: '77777777-7777-4777-8777-777777777701',
  esc1: '77777777-7777-4777-8777-777777777711', // Escuela 21 'El Chañar' (origen)
  esc2: '77777777-7777-4777-8777-777777777712', // Escuela 8 'Los Álamos' (destino)
  aula1: '77777777-7777-4777-8777-777777777721',
  aula2: '77777777-7777-4777-8777-777777777722',
  pool: '77777777-7777-4777-8777-777777777731',
  transferencia: '77777777-7777-4777-8777-777777777741',
  arcoCaso: '77777777-7777-4777-8777-777777777751',
  // alumno_id del caso ARCO ejecutado: NO existe (esa es la gracia — sin FK).
  arcoAlumno: '77777777-7777-4777-8777-777777777752',
};

const randPass = () => randomBytes(24).toString('hex');

async function upsert(table, rows) {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}

async function rpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return null; }
}

async function get(table, filtro, select = '*') {
  const r = await fetch(`${URL}/rest/v1/${table}?${filtro}&select=${select}`, { headers: H });
  if (!r.ok) throw new Error(`get ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function ensureUser(email, password, meta) {
  const c = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  if (c.ok) return (await c.json()).id;
  const t = await c.text();
  if (c.status === 422 || /already|registered|exists/i.test(t)) {
    const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, { headers: H });
    const data = await r.json();
    const users = data?.users ?? data ?? [];
    const u = users.find?.((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
  }
  throw new Error(`create ${email}: ${c.status} ${t}`);
}

// Matrícula idempotente: abre solo si el alumno no tiene una activa en esa escuela.
async function asegurarMatricula(alumnoId, escuelaId, aulaId, docenteId, grado, actorId, consentimientoId = null) {
  const activas = await get('matricula', `alumno_id=eq.${alumnoId}&fecha_fin=is.null`, 'id,escuela_id');
  if (activas.some((m) => m.escuela_id === escuelaId)) return activas[0].id;
  if (activas.length > 0) throw new Error(`matrícula activa en otra escuela para ${alumnoId} — seed inconsistente`);
  return rpc('matricula_abrir', {
    p_alumno: alumnoId, p_escuela: escuelaId, p_aula: aulaId, p_docente: docenteId,
    p_grado: grado, p_actor: actorId, p_consentimiento: consentimientoId,
  });
}

async function main() {
  // ── 1) Institución con dos colegios ───────────────────────────────────────
  await upsert('institucion', [{
    id: ID.institucion, nombre: 'Fundación Semillas', tipo: 'fundacion',
    contacto: { email: 'hola@semillas.org.ar' }, estado: 'activa',
  }]);
  await upsert('escuela', [
    { id: ID.esc1, nombre: "Escuela 21 'El Chañar'", zona: 'Sáenz Peña, Chaco', provincia: 'Chaco', estado: 'activo', institucion_id: ID.institucion },
    { id: ID.esc2, nombre: "Escuela 8 'Los Álamos'", zona: 'Tinogasta, Catamarca', provincia: 'Catamarca', estado: 'activo', institucion_id: ID.institucion },
  ]);
  await upsert('aula', [
    { id: ID.aula1, escuela_id: ID.esc1, nombre: '4° grado', grado: 4, codigo: 'CHANAR-4' },
    { id: ID.aula2, escuela_id: ID.esc2, nombre: '4° grado', grado: 4, codigo: 'ALAMOS-4' },
  ]);
  console.log('✓ institución Fundación Semillas + 2 colegios');

  // ── 2) Docentes (una por colegio) + admin de institución ─────────────────
  const doc1 = await ensureUser('irma@edutia.ar', 'edutia123', { nombre: 'Irma', rol: 'docente' });
  await upsert('perfil', [{ id: doc1, rol: 'docente', nombre: 'Irma', escuela_id: ID.esc1 }]);
  const doc2 = await ensureUser('nora@edutia.ar', 'edutia123', { nombre: 'Nora', rol: 'docente' });
  await upsert('perfil', [{ id: doc2, rol: 'docente', nombre: 'Nora', escuela_id: ID.esc2 }]);
  await upsert('aula', [
    { id: ID.aula1, escuela_id: ID.esc1, docente_id: doc1, nombre: '4° grado', grado: 4, codigo: 'CHANAR-4' },
    { id: ID.aula2, escuela_id: ID.esc2, docente_id: doc2, nombre: '4° grado', grado: 4, codigo: 'ALAMOS-4' },
  ]);
  const instAdmin = await ensureUser('coordinacion@semillas.org.ar', 'semillas123', { nombre: 'Coordinación Semillas' });
  await upsert('institucion_admin', [{
    perfil_id: instAdmin, institucion_id: ID.institucion, nombre: 'Coordinación Semillas', activo: true,
  }]);
  console.log('✓ docentes Irma (Chañar) y Nora (Álamos) + admin de institución (coordinacion@semillas.org.ar / semillas123)');

  // ── 3) Pool de licencias: 3 cupos, 1 asignado al Chañar ──────────────────
  await upsert('licencia', [{
    id: ID.pool, institucion_id: ID.institucion, plan: 'docente', cupos: 3,
    fecha_inicio: '2026-08-01', fecha_fin: '2027-07-31', estado: 'activa',
    condiciones: 'Pool demo de la fundación',
  }]);
  const asignado = await get('licencia_asignacion', `escuela_id=eq.${ID.esc1}`, 'escuela_id');
  if (asignado.length === 0) {
    await upsert('licencia_asignacion', [{ escuela_id: ID.esc1, licencia_id: ID.pool }]);
  }
  console.log('✓ pool de 3 cupos (1 asignado)');

  // ── 4) Wanda: historial en DOS colegios ──────────────────────────────────
  const wandaEmail = 'alu-golondrina-w1@students.edutia.local';
  const wanda = await ensureUser(wandaEmail, randPass(), { nombre: 'Wanda', rol: 'alumno' });
  await upsert('perfil', [{ id: wanda, rol: 'alumno', nombre: 'Wanda', avatar: 'owl' }]);

  const matriculasW = await get('matricula', `alumno_id=eq.${wanda}`, 'id,escuela_id,fecha_fin');
  if (matriculasW.length === 0) {
    // Capítulo 1: El Chañar. Abre, practica (queda rastro), cierra por migración.
    const m1 = await asegurarMatricula(wanda, ID.esc1, ID.aula1, doc1, 3, doc1);
    await rpc('matricula_cerrar', { p_matricula: m1, p_motivo: 'migracion', p_actor: doc1 });
    // Capítulo 2: Los Álamos, con consentimiento de transferencia (regla P2).
    const cons = await fetch(`${URL}/rest/v1/consentimiento`, {
      method: 'POST', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify([{
        alumno_id: wanda, escuela_id: ID.esc2, adulto_nombre: 'Griselda',
        adulto_vinculo: 'madre', alcance: 'transferencia', via: 'asistida',
        estado: 'vigente', otorgado_at: new Date().toISOString(), registrado_por: doc2,
      }]),
    });
    const consId = (await cons.json())[0].id;
    await asegurarMatricula(wanda, ID.esc2, ID.aula2, doc2, 4, doc2, consId);
    await rpc('set_alumno_cred', { p_perfil: wanda, p_aula: ID.aula2, p_pin: '7777', p_email: wandaEmail, p_password: randPass() });
  }
  console.log('✓ Wanda: matrícula cerrada en El Chañar + activa en Los Álamos (PIN 7777)');

  // ── 5) Simón: en tránsito con transferencia pendiente ────────────────────
  const simonEmail = 'alu-golondrina-s1@students.edutia.local';
  const simon = await ensureUser(simonEmail, randPass(), { nombre: 'Simón', rol: 'alumno' });
  await upsert('perfil', [{ id: simon, rol: 'alumno', nombre: 'Simón', avatar: 'turtle' }]);
  const matriculasS = await get('matricula', `alumno_id=eq.${simon}`, 'id,fecha_fin');
  if (matriculasS.length === 0) {
    const m = await asegurarMatricula(simon, ID.esc1, ID.aula1, doc1, 4, doc1);
    await rpc('matricula_cerrar', { p_matricula: m, p_motivo: 'migracion', p_actor: doc1 });
  }
  // Transferencia pendiente hacia Los Álamos (token de demo, hasheado igual
  // que en la fn: sha256 hex — el token en claro solo se imprime acá).
  const yaTransfer = await get('transferencia', `id=eq.${ID.transferencia}`, 'id');
  if (yaTransfer.length === 0) {
    const token = randomBytes(16).toString('hex');
    const hash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ).toString('hex');
    const expira = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await upsert('transferencia', [{
      id: ID.transferencia, alumno_id: simon, escuela_origen: ID.esc1,
      escuela_destino: ID.esc2, solicitada_por: doc1, estado: 'pendiente',
      token_hash: hash, expira_at: expira,
    }]);
    console.log(`✓ Simón: en tránsito, transferencia pendiente — link de demo: /transferir/${ID.transferencia}#${token}`);
  } else {
    console.log('✓ Simón: en tránsito, transferencia pendiente (ya existía)');
  }

  // ── 6) Caso ARCO ejecutado: solo queda el agregado anónimo ───────────────
  await upsert('arco_caso', [{
    id: ID.arcoCaso, alumno_id: ID.arcoAlumno, tipo: 'cancelacion', estado: 'ejecutado',
    detalle: { nota: 'Caso demo: la familia pidió la baja definitiva.' },
    agregado: {
      sesiones: 41, respuestas: 512, nodos_dominados: 3, grado: 5,
      provincia: 'Chaco', rango_fechas: { desde: '2026-03-02', hasta: '2026-07-18' },
    },
    ejecutado_at: new Date().toISOString(),
  }]);
  console.log('✓ caso ARCO de cancelación ejecutado (solo agregado anónimo)');

  console.log('\nSeed golondrina OK.');
  console.log('Para verla: Irma ve los boletines que emitió pero NO el legajo vivo de Wanda;');
  console.log('Nora ve el recorrido COMPLETO de Wanda; Simón espera activación en Los Álamos.');
}

main().catch((e) => { console.error('SEED ERROR:', e.message); process.exit(1); });
