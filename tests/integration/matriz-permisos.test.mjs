// Matriz de permisos (alumno golondrina, ADR-011): cada ROL contra cada
// ENDPOINT nuevo, en una sola tabla legible. Es el test que contesta de un
// vistazo "¿quién puede hacer qué?" — la matriz de la spec, ejecutable.
//
// Roles: super / operativo (plataforma_admin) · institucion (institucion_admin)
// · docente (perfil) · alumno (perfil) · anon (sin sesión).
// Necesita las fns deployadas y las migraciones 0022–0027. Sin envs se saltea.
// Correr: npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

const rnd = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sr = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' });

const insSR = async (table, row) =>
  (await (await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...sr(), Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })).json())[0];
const borrarUser = (id) => fetch(`${URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: sr() });
const borrarSR = (table, filtro) => fetch(`${URL}/rest/v1/${table}?${filtro}`, { method: 'DELETE', headers: sr() });

const callFn = (fn, accion, body, token) => fetch(`${URL}/functions/v1/${fn}`, {
  method: 'POST',
  headers: {
    apikey: ANON,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ accion, ...body }),
});

async function nuevoUsuario(clase, extra = {}) {
  const email = `${clase}-${rnd()}@efimeros.edutia.local`;
  const password = rnd();
  const { id } = await (await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: sr(), body: JSON.stringify({ email, password, email_confirm: true }),
  })).json();
  if (clase === 'super' || clase === 'operativo') {
    await insSR('plataforma_admin', { perfil_id: id, nivel: clase, nombre: `Test ${clase}`, activo: true });
  } else if (clase === 'institucion') {
    await insSR('institucion_admin', { perfil_id: id, institucion_id: extra.institucion_id, nombre: 'Test coord', activo: true });
  } else {
    await fetch(`${URL}/rest/v1/perfil`, {
      method: 'POST', headers: { ...sr(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ id, rol: clase, nombre: `Test ${clase}`, ...(extra.perfil ?? {}) }]),
    });
  }
  const { access_token } = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  return { id, access_token };
}

// LA MATRIZ. `true` = tiene que poder (2xx); `false` = tiene que rebotar (4xx).
// Cada fila es un endpoint; cada columna, un rol. Lo que se lee acá es
// exactamente lo que promete la spec.
const MATRIZ = [
  // [fn, accion, payloadFactory, { super, operativo, institucion, docente, alumno, anon }]
  ['admin-instituciones', 'listar', () => ({}),
    { super: true, operativo: true, institucion: false, docente: false, alumno: false, anon: false }],
  ['admin-instituciones', 'crear', () => ({ nombre: `Mx-${rnd()}`, tipo: 'red' }),
    { super: true, operativo: true, institucion: false, docente: false, alumno: false, anon: false }],
  ['institucion-panel', 'resumen', () => ({}),
    { super: false, operativo: false, institucion: true, docente: false, alumno: false, anon: false }],
  ['admin-arco', 'casos_listar', () => ({}),
    { super: true, operativo: true, institucion: false, docente: false, alumno: false, anon: false }],
  ['gestion-transferencias', 'listar', () => ({}),
    // 'listar' es SOLO admin: la docente tiene 'propias'.
    { super: true, operativo: true, institucion: false, docente: false, alumno: false, anon: false }],
  ['gestion-transferencias', 'propias', () => ({}),
    // Espejo del anterior: la vista de la docente NO es para los admin.
    { super: false, operativo: false, institucion: false, docente: true, alumno: false, anon: false }],
  ['gestion-consentimientos', 'deuda', () => ({}),
    { super: false, operativo: false, institucion: false, docente: true, alumno: false, anon: false }],
];

test('matriz de permisos: cada rol contra cada endpoint del feature', { skip }, async () => {
  const usuarios = {};
  let inst, esc;
  try {
    inst = await insSR('institucion', { nombre: `Mtz-${rnd()}`, tipo: 'fundacion', estado: 'activa' });
    esc = await insSR('escuela', { nombre: `Mtz-${rnd()}`, zona: 'test', estado: 'activo', institucion_id: inst.id });

    usuarios.super = await nuevoUsuario('super');
    usuarios.operativo = await nuevoUsuario('operativo');
    usuarios.institucion = await nuevoUsuario('institucion', { institucion_id: inst.id });
    usuarios.docente = await nuevoUsuario('docente', { perfil: { escuela_id: esc.id } });
    usuarios.alumno = await nuevoUsuario('alumno', { perfil: { escuela_id: esc.id } });
    usuarios.anon = { access_token: null };

    const fallos = [];
    for (const [fn, accion, payload, esperado] of MATRIZ) {
      for (const [rol, permitido] of Object.entries(esperado)) {
        const r = await callFn(fn, accion, payload(), usuarios[rol].access_token);
        const paso = r.status >= 200 && r.status < 300;
        if (paso !== permitido) {
          const body = (await r.text()).slice(0, 160);
          fallos.push(`${fn}/${accion} · ${rol}: ${paso ? 'PUDO' : 'no pudo'} (esperado ${permitido ? 'poder' : 'no poder'}) — ${r.status} ${body}`);
        }
      }
    }
    assert.deepEqual(fallos, [], `la matriz de permisos no se cumple:\n${fallos.join('\n')}`);
  } finally {
    for (const u of Object.values(usuarios)) if (u?.id) await borrarUser(u.id);
    // El 'crear' de la matriz deja instituciones efímeras: se limpian por prefijo.
    await borrarSR('institucion', 'nombre=like.Mx-*');
    if (esc) await borrarSR('escuela', `id=eq.${esc.id}`);
    if (inst) await borrarSR('institucion', `id=eq.${inst.id}`);
  }
});
