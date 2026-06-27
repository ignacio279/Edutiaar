// EDUTIA — datos semilla (Etapa 1 + login endurecido).
// Crea: contenido, docente, aula + secreto, y alumnos con credenciales OPACAS
// (email aleatorio-estable + password Auth random) + pin_hash (vía RPC).
// Idempotente. El service_role NUNCA va al front ni a git.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs

import { randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ID = {
  escuela: '11111111-1111-4111-8111-111111111111',
  materia: '22222222-2222-4222-8222-222222222222',
  programa: '33333333-3333-4333-8333-333333333333',
  aula: '44444444-4444-4444-8444-444444444444',
};

const AULA_CODIGO = 'CERRO-3A';
const AULA_SECRETO = 'aula2026';

// email opaco ESTABLE por alumno (no `nombre@edutia.local`)
const ALUMNOS = [
  { key: 'mateo', name: 'Mateo', animal: 'fox', pin: '1111', email: 'alu-7f3a9c@students.edutia.local' },
  { key: 'lucia', name: 'Lucía', animal: 'owl', pin: '2222', email: 'alu-2b8e51@students.edutia.local' },
  { key: 'benja', name: 'Benja', animal: 'turtle', pin: '3333', email: 'alu-c4d017@students.edutia.local' },
  { key: 'sofia', name: 'Sofía', animal: 'cat', pin: '4444', email: 'alu-9a6f23@students.edutia.local' },
  { key: 'tomas', name: 'Tomás', animal: 'sheep', pin: '5555', email: 'alu-13e7bd@students.edutia.local' },
];

const randPass = () => randomBytes(24).toString('hex'); // 48 chars

async function upsert(table, rows) {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}

async function rpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${await r.text()}`);
}

async function listUsers() {
  const map = {};
  for (let page = 1; ; page++) {
    const r = await fetch(`${URL}/auth/v1/admin/users?per_page=200&page=${page}`, { headers: H });
    if (!r.ok) throw new Error(`list users: ${r.status} ${await r.text()}`);
    const j = await r.json();
    const users = j.users || j;
    users.forEach((u) => { map[u.email] = u.id; });
    if (!users.length || users.length < 200) break;
  }
  return map;
}

// crea (o, si existe, actualiza password) → asegura que el user tenga `password`
async function ensureUser(email, password, meta) {
  const c = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  if (c.ok) return (await c.json()).id;
  const t = await c.text();
  if (c.status === 422 || /already|registered|exists/i.test(t)) {
    const id = (await listUsers())[email];
    if (id) {
      const u = await fetch(`${URL}/auth/v1/admin/users/${id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ password, email_confirm: true, user_metadata: meta }),
      });
      if (!u.ok) throw new Error(`update ${email}: ${u.status} ${await u.text()}`);
      return id;
    }
  }
  throw new Error(`create ${email}: ${c.status} ${t}`);
}

async function deleteUser(id) {
  await fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: H });
}

async function main() {
  // 1) contenido
  await upsert('escuela', [{ id: ID.escuela, nombre: "Escuela Rural N° 12 'Cerro Azul'", zona: 'Neuquén, Patagonia' }]);
  await upsert('materia', [{ id: ID.materia, nombre: 'Lengua' }]);
  await upsert('programa', [{ id: ID.programa, materia_id: ID.materia, grado: 3, contenido: 'Vocales, sílabas, palabras, oraciones, lectura, cuento.' }]);
  console.log('✓ contenido');

  // 2) aula + secreto
  await upsert('aula', [{ id: ID.aula, escuela_id: ID.escuela, nombre: '3° grado', grado: 3, codigo: AULA_CODIGO }]);
  await rpc('set_aula_secreto', { p_aula: ID.aula, p_secreto: AULA_SECRETO });
  console.log(`✓ aula ${AULA_CODIGO} (secreto: ${AULA_SECRETO})`);

  // 3) docente
  const anaId = await ensureUser('ana@edutia.ar', 'edutia123', { nombre: 'Ana', rol: 'docente' });
  await upsert('perfil', [{ id: anaId, rol: 'docente', nombre: 'Ana', escuela_id: ID.escuela }]);
  console.log('✓ docente seño Ana');

  // 4) borrar alumnos viejos con email adivinable (*@edutia.local)
  const all = await listUsers();
  for (const [email, id] of Object.entries(all)) {
    if (email.endsWith('@edutia.local')) { await deleteUser(id); console.log(`  · borrado viejo ${email}`); }
  }

  // 5) alumnos con creds opacas
  for (const a of ALUMNOS) {
    const pass = randPass();
    const id = await ensureUser(a.email, pass, { nombre: a.name, rol: 'alumno' });
    await upsert('perfil', [{ id, rol: 'alumno', nombre: a.name, avatar: a.animal, grado: 3, escuela_id: ID.escuela, docente_id: anaId, aula_id: ID.aula }]);
    await rpc('set_alumno_cred', { p_perfil: id, p_aula: ID.aula, p_pin: a.pin, p_email: a.email, p_password: pass });
    console.log(`✓ alumno ${a.name} (PIN ${a.pin})`);
  }

  console.log('\nSeed OK.');
}

main().catch((e) => { console.error('SEED ERROR:', e.message); process.exit(1); });
