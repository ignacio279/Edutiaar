// Tests de integración SP-3: RLS de sol_materia para el alumno. El alumno ve las
// PUBLICADAS de su escuela, NO las borrador. Modo mock (sin ANTHROPIC_API_KEY).
// Idempotente: crea docente/alumno/materia/programa efímeros y los borra. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const ESCUELA = '11111111-1111-4111-8111-111111111111'; // escuela semilla
const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const srHeaders = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const callFnAuth = (name, body, token) => fetch(`${URL}/functions/v1/${name}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function nuevoUsuario(rol, grado) {
  const email = `${rol}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const cr = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: srHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const id = (await cr.json()).id;
  await fetch(`${URL}/rest/v1/perfil`, {
    method: 'POST', headers: { ...srHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, rol, nombre: `Test ${rol}`, escuela_id: ESCUELA, grado: grado ?? null }]),
  });
  const tok = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token: tok.access_token };
}

test('SP-3 RLS: el alumno ve la sol_materia publicada de su escuela, no la borrador', { skip }, async () => {
  const matPub = `TEST-pub-${rnd()}`;
  const matBor = `TEST-bor-${rnd()}`;
  let docente, alumno, pubProg, borProg, pubMat, borMat;
  try {
    docente = await nuevoUsuario('docente');
    alumno = await nuevoUsuario('alumno', 3);

    // Publicada (grado 3)
    const rPub = await (await callFnAuth('dividir-nodos', { materia_nombre: matPub, grado: 3, contenido: 'A, B, C', mock: true }, docente.access_token)).json();
    pubProg = rPub.programa_id; pubMat = rPub.materia_id;
    await fetch(`${URL}/rest/v1/sol_materia?id=eq.${rPub.sol_materia_id}`, {
      method: 'PATCH', headers: { ...srHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ estado: 'publicado' }),
    });

    // Borrador (queda sin publicar)
    const rBor = await (await callFnAuth('dividir-nodos', { materia_nombre: matBor, grado: 3, contenido: 'X, Y', mock: true }, docente.access_token)).json();
    borProg = rBor.programa_id; borMat = rBor.materia_id;

    // El alumno consulta sol_materia (RLS aplica con su token)
    const vistas = await (await fetch(`${URL}/rest/v1/sol_materia?select=id,estado,programa_id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${alumno.access_token}` },
    })).json();
    const ids = new Set(vistas.map((v) => v.id));
    assert.ok(ids.has(rPub.sol_materia_id), 'el alumno ve la publicada de su escuela');
    assert.ok(!ids.has(rBor.sol_materia_id), 'el alumno NO ve la borrador');
    assert.ok(vistas.every((v) => v.estado === 'publicado'), 'solo publicadas');
  } finally {
    for (const p of [pubProg, borProg]) if (p) await fetch(`${URL}/rest/v1/programa?id=eq.${p}`, { method: 'DELETE', headers: srHeaders() });
    for (const m of [pubMat, borMat]) if (m) await fetch(`${URL}/rest/v1/materia?id=eq.${m}`, { method: 'DELETE', headers: srHeaders() });
    for (const u of [docente, alumno]) if (u?.id) await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: srHeaders() });
  }
});
