// EDUTIA — seed del super-admin de plataforma (Dashboard admin v3, Fase 0).
// Crea el auth user y su fila en plataforma_admin (nivel 'super').
// OJO: el admin NO tiene fila en perfil (ADR-009) — no es docente ni alumno.
// Idempotente: si el email ya existe, solo asegura la fila de plataforma_admin.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   ADMIN_EMAIL=jorge@edutia.ar ADMIN_PASSWORD=... [ADMIN_NOMBRE=Jorge] \
//   node scripts/seed-admin.mjs

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const NOMBRE = process.env.ADMIN_NOMBRE || 'Admin';

if (!URL || !KEY || !EMAIL || !PASSWORD) {
  console.error('Faltan envs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function buscarUserPorEmail(email) {
  // La Admin API no filtra por email exacto en todas las versiones; pedimos y filtramos.
  const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, { headers: H });
  const data = await r.json();
  const users = data?.users ?? data ?? [];
  return users.find?.((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function main() {
  let user = await buscarUserPorEmail(EMAIL);
  if (!user) {
    const r = await fetch(`${URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
    });
    user = await r.json();
    if (!r.ok || !user?.id) {
      console.error('No se pudo crear el auth user:', user);
      process.exit(1);
    }
    console.log(`Auth user creado: ${EMAIL}`);
  } else {
    console.log(`Auth user ya existía: ${EMAIL}`);
  }

  const r = await fetch(`${URL}/rest/v1/plataforma_admin`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ perfil_id: user.id, nivel: 'super', nombre: NOMBRE, activo: true }]),
  });
  if (!r.ok) {
    console.error('No se pudo upsertear plataforma_admin:', await r.text());
    process.exit(1);
  }
  console.log(`Super-admin listo: ${NOMBRE} <${EMAIL}> (${user.id})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
