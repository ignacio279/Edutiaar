// Tests de WP9 — Seguridad (Dashboard admin v3): el armado PURO del snapshot
// de "ver como maestra" (admin-impersonar/snapshot.ts) y los validadores de la
// gestión de admins (admin-plataforma/validar.ts).
// D12: el snapshot es lo ÚNICO que ve el admin de una docente — no hay sesión
// ni token — así que su forma es contrato: la consume web/app/admin/ver-como.
// `now` va por parámetro para que los tests no dependan del reloj.
// Correr: npm test (o node --test tests/unit/admin-impersonar.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarSnapshot, ACTIVIDAD_MAX } from '../../supabase/functions/admin-impersonar/snapshot.ts';
import {
  NIVELES, PASSWORD_LARGO, emailValido, emailNormalizado, nombreValido, nivelValido,
  validarCrearAdmin, generarPasswordTemporal,
} from '../../supabase/functions/admin-plataforma/validar.ts';

// ── helpers ─────────────────────────────────────────────────────────────────

// `now` fijo en hora LOCAL: rangoHoyMs (snapshot.ts) corta el día en local, así
// que las fechas de las sesiones se construyen igual y el test no se rompe con
// el TZ de la máquina.
const NOW = new Date(2026, 7, 6, 15, 30); // jueves 6/8/2026, 15:30 local
const local = (y, m, d, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();

const HOY_9 = local(2026, 7, 6, 9, 0);
const HOY_14 = local(2026, 7, 6, 14, 0);
const AYER_20 = local(2026, 7, 5, 20, 0);
const HACE_10_DIAS = local(2026, 6, 27, 11, 0);

const PERFIL = { id: 'doc-1', nombre: 'Seño Marta' };
const base = (extra = {}) => ({
  perfil: PERFIL,
  escuela: null,
  aulas: [],
  alumnos: [],
  sesiones: [],
  materias: [],
  boletines: [],
  ...extra,
});

// ── armarSnapshot ───────────────────────────────────────────────────────────

test('armarSnapshot: precisión = aciertos/total de la ventana, redondeada', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 3, aula_id: 'au1' }],
    sesiones: [
      { alumno_id: 'a1', fecha: HOY_9, aciertos: 8, total: 10 },
      { alumno_id: 'a1', fecha: AYER_20, aciertos: 5, total: 10 },
    ],
  }), NOW);
  // 13/20 = 65%
  assert.equal(s.alumnos[0].precisionReciente, 65);

  // Redondeo: 2/3 = 66.66… → 67
  const t = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 3, aula_id: null }],
    sesiones: [{ alumno_id: 'a1', fecha: HOY_9, aciertos: 2, total: 3 }],
  }), NOW);
  assert.equal(t.alumnos[0].precisionReciente, 67);
});

test('armarSnapshot: total 0 → precisión null (no divide por cero ni miente 0%)', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 1, aula_id: null }],
    sesiones: [{ alumno_id: 'a1', fecha: HOY_9, aciertos: 0, total: 0 }],
  }), NOW);
  assert.equal(s.alumnos[0].precisionReciente, null);
  assert.equal(s.alumnos[0].sesionesHoy, 1); // la sesión existió igual
});

test('armarSnapshot: ultimaSesion es la más nueva, venga en el orden que venga', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 3, aula_id: null }],
    sesiones: [
      { alumno_id: 'a1', fecha: HACE_10_DIAS, aciertos: 1, total: 2 },
      { alumno_id: 'a1', fecha: HOY_14, aciertos: 1, total: 2 },
      { alumno_id: 'a1', fecha: AYER_20, aciertos: 1, total: 2 },
    ],
  }), NOW);
  assert.equal(s.alumnos[0].ultimaSesion, HOY_14);
});

test('armarSnapshot: sesionesHoy usa el día local de `now`, no las últimas 24 h', () => {
  const s = armarSnapshot(base({
    alumnos: [
      { id: 'a1', nombre: 'Ana', grado: 3, aula_id: null },
      { id: 'a2', nombre: 'Beto', grado: 5, aula_id: null },
    ],
    sesiones: [
      { alumno_id: 'a1', fecha: HOY_9, aciertos: 3, total: 4 },
      { alumno_id: 'a1', fecha: HOY_14, aciertos: 4, total: 4 },
      { alumno_id: 'a1', fecha: AYER_20, aciertos: 1, total: 4 }, // < 24 h pero es de ayer
      { alumno_id: 'a2', fecha: AYER_20, aciertos: 2, total: 4 },
    ],
  }), NOW);
  const ana = s.alumnos.find((a) => a.id === 'a1');
  const beto = s.alumnos.find((a) => a.id === 'a2');
  assert.equal(ana.sesionesHoy, 2);
  assert.equal(beto.sesionesHoy, 0);
  assert.equal(beto.ultimaSesion, AYER_20); // sin práctica hoy, pero con historia
});

test('armarSnapshot: las sesiones de OTRO alumno no contaminan la fila', () => {
  const s = armarSnapshot(base({
    alumnos: [
      { id: 'a1', nombre: 'Ana', grado: 3, aula_id: null },
      { id: 'a2', nombre: 'Beto', grado: 5, aula_id: null },
    ],
    sesiones: [
      { alumno_id: 'a1', fecha: HOY_9, aciertos: 10, total: 10 },
      { alumno_id: 'a2', fecha: HOY_9, aciertos: 0, total: 10 },
    ],
  }), NOW);
  assert.equal(s.alumnos.find((a) => a.id === 'a1').precisionReciente, 100);
  assert.equal(s.alumnos.find((a) => a.id === 'a2').precisionReciente, 0);
});

test('armarSnapshot: alumno sin sesiones → nulls prolijos, nunca NaN ni undefined', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a9', nombre: 'Nico', grado: null, aula_id: null }],
    sesiones: [],
  }), NOW);
  assert.deepEqual(s.alumnos[0], {
    id: 'a9',
    nombre: 'Nico',
    grado: null,
    aula_id: null,
    ultimaSesion: null,
    sesionesHoy: 0,
    precisionReciente: null,
  });
});

test('armarSnapshot: grado/aula_id ausentes se normalizan a null', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana' }],
  }), NOW);
  assert.equal(s.alumnos[0].grado, null);
  assert.equal(s.alumnos[0].aula_id, null);
});

test('armarSnapshot: aciertos/total nulos cuentan como 0 (sesión abandonada)', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 2, aula_id: null }],
    sesiones: [
      { alumno_id: 'a1', fecha: HOY_9, aciertos: null, total: null },
      { alumno_id: 'a1', fecha: HOY_14, aciertos: 5, total: 10 },
    ],
  }), NOW);
  assert.equal(s.alumnos[0].precisionReciente, 50);
  assert.equal(s.alumnos[0].sesionesHoy, 2);
  assert.equal(s.actividadReciente[1].aciertos, 0);
  assert.equal(s.actividadReciente[1].total, 0);
});

test('armarSnapshot: actividadReciente va de lo más nuevo a lo más viejo y topea en ACTIVIDAD_MAX', () => {
  const alumnos = [{ id: 'a1', nombre: 'Ana', grado: 3, aula_id: null }];
  // 15 sesiones, cargadas del día 1 al 15 (la más nueva última en el array).
  const sesiones = Array.from({ length: 15 }, (_, i) => ({
    alumno_id: 'a1', fecha: local(2026, 6, i + 1, 10, 0), aciertos: i, total: 10,
  }));
  const s = armarSnapshot(base({ alumnos, sesiones }), NOW);
  assert.equal(ACTIVIDAD_MAX, 10);
  assert.equal(s.actividadReciente.length, ACTIVIDAD_MAX);
  assert.equal(s.actividadReciente[0].fecha, local(2026, 6, 15, 10, 0)); // la más nueva primero
  assert.equal(s.actividadReciente[9].fecha, local(2026, 6, 6, 10, 0));
  const ms = s.actividadReciente.map((a) => new Date(a.fecha).getTime());
  assert.deepEqual(ms, [...ms].sort((x, y) => y - x), 'orden descendente');
});

test('armarSnapshot: actividadReciente trae el NOMBRE del alumno (nunca su id)', () => {
  const s = armarSnapshot(base({
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 3, aula_id: null }],
    sesiones: [
      { alumno_id: 'a1', fecha: HOY_9, aciertos: 3, total: 5 },
      { alumno_id: 'fantasma', fecha: HOY_14, aciertos: 1, total: 5 }, // alumno borrado
    ],
  }), NOW);
  assert.equal(s.actividadReciente[0].alumnoNombre, 'Alumno'); // fallback, no el uuid
  assert.equal(s.actividadReciente[1].alumnoNombre, 'Ana');
  assert.ok(!JSON.stringify(s.actividadReciente).includes('fantasma'), 'no filtra ids de alumnos');
});

test('armarSnapshot: boletines cuenta aprobados y borradores, ignorando otros estados', () => {
  const s = armarSnapshot(base({
    boletines: [
      { estado: 'aprobado' }, { estado: 'aprobado' }, { estado: 'borrador' }, { estado: 'entregado' },
    ],
  }), NOW);
  assert.deepEqual(s.boletines, { aprobados: 2, borradores: 1 });
});

test('armarSnapshot: docente, escuela, aulas y materias pasan tal cual (grado ausente → null)', () => {
  const s = armarSnapshot(base({
    escuela: { id: 'esc-1', nombre: 'Escuela 12' },
    aulas: [
      { id: 'au1', nombre: 'Aula única', grado: 3, codigo: 'ABC123' },
      { id: 'au2', nombre: 'Aula tarde', codigo: 'XYZ999' },
    ],
    materias: [
      { id: 'm1', nombre: 'Lengua', estado: 'publicado', nodos: 7 },
      { id: 'm2', nombre: 'Matemática', estado: 'borrador', nodos: 0 },
    ],
  }), NOW);
  assert.deepEqual(s.docente, { id: 'doc-1', nombre: 'Seño Marta' });
  assert.deepEqual(s.escuela, { id: 'esc-1', nombre: 'Escuela 12' });
  assert.equal(s.aulas.length, 2);
  assert.equal(s.aulas[0].codigo, 'ABC123');
  assert.equal(s.aulas[1].grado, null);
  assert.deepEqual(s.materias.map((m) => [m.nombre, m.estado, m.nodos]), [
    ['Lengua', 'publicado', 7], ['Matemática', 'borrador', 0],
  ]);
});

test('armarSnapshot: docente sin colegio → escuela null (no undefined)', () => {
  const s = armarSnapshot(base({ escuela: null }), NOW);
  assert.equal(s.escuela, null);
  assert.ok('escuela' in s);
});

test('armarSnapshot: todo vacío → shape COMPLETO con ceros y listas vacías', () => {
  const s = armarSnapshot(base(), NOW);
  assert.deepEqual(s, {
    docente: { id: 'doc-1', nombre: 'Seño Marta' },
    escuela: null,
    aulas: [],
    alumnos: [],
    materias: [],
    boletines: { aprobados: 0, borradores: 0 },
    actividadReciente: [],
  });
  assert.deepEqual(Object.keys(s).sort(), [
    'actividadReciente', 'alumnos', 'aulas', 'boletines', 'docente', 'escuela', 'materias',
  ]);
});

test('armarSnapshot: listas undefined (query sin data) no rompen nada', () => {
  const s = armarSnapshot({
    perfil: PERFIL, escuela: null,
    aulas: undefined, alumnos: undefined, sesiones: undefined, materias: undefined, boletines: undefined,
  }, NOW);
  assert.deepEqual(s.aulas, []);
  assert.deepEqual(s.alumnos, []);
  assert.deepEqual(s.materias, []);
  assert.deepEqual(s.actividadReciente, []);
  assert.deepEqual(s.boletines, { aprobados: 0, borradores: 0 });
});

test('armarSnapshot: no hay ni una clave sensible en el resultado (Regla 5 / D12)', () => {
  const s = armarSnapshot(base({
    escuela: { id: 'esc-1', nombre: 'Escuela 12' },
    alumnos: [{ id: 'a1', nombre: 'Ana', grado: 3, aula_id: 'au1' }],
    sesiones: [{ alumno_id: 'a1', fecha: HOY_9, aciertos: 3, total: 5 }],
  }), NOW);
  const texto = JSON.stringify(s);
  for (const prohibido of ['email', 'pin', 'password', 'token', 'access_token']) {
    assert.ok(!texto.toLowerCase().includes(prohibido), `el snapshot no debe traer "${prohibido}"`);
  }
});

// ── validar.ts (gestión de admins) ──────────────────────────────────────────

test('emailValido: acepta lo razonable, rechaza lo roto', () => {
  assert.ok(emailValido('jorge@edutia.ar'));
  assert.ok(emailValido('  jorge.perez@escuela.edu.ar  ')); // trimea antes de testear
  assert.ok(!emailValido('jorge@edutia'));
  assert.ok(!emailValido('jorge edutia.ar'));
  assert.ok(!emailValido('@edutia.ar'));
  assert.ok(!emailValido(''));
  assert.ok(!emailValido(null));
  assert.ok(!emailValido(undefined));
  assert.ok(!emailValido(42));
});

test('emailNormalizado: trim + minúsculas, basura → string vacío', () => {
  assert.equal(emailNormalizado('  Jorge@Edutia.AR '), 'jorge@edutia.ar');
  assert.equal(emailNormalizado(null), '');
  assert.equal(emailNormalizado(undefined), '');
});

test('nombreValido: exige algo más que espacios', () => {
  assert.ok(nombreValido('Jorge'));
  assert.ok(!nombreValido('   '));
  assert.ok(!nombreValido(''));
  assert.ok(!nombreValido(null));
  assert.ok(!nombreValido(7));
});

test('nivelValido: solo super y operativo', () => {
  assert.deepEqual([...NIVELES], ['super', 'operativo']);
  assert.ok(nivelValido('super'));
  assert.ok(nivelValido('operativo'));
  assert.ok(!nivelValido('Super')); // sin tolerancia de mayúsculas: va al check de la DB
  assert.ok(!nivelValido('docente'));
  assert.ok(!nivelValido(''));
  assert.ok(!nivelValido(null));
});

test('validarCrearAdmin: ok con los tres campos', () => {
  assert.deepEqual(
    validarCrearAdmin({ email: 'jorge@edutia.ar', nombre: 'Jorge', nivel: 'operativo' }),
    { ok: true },
  );
});

test('validarCrearAdmin: errores por campo, email primero', () => {
  assert.deepEqual(
    validarCrearAdmin({ email: 'nope', nombre: 'Jorge', nivel: 'super' }),
    { ok: false, error: 'email_invalido' },
  );
  assert.deepEqual(
    validarCrearAdmin({ email: 'jorge@edutia.ar', nombre: '   ', nivel: 'super' }),
    { ok: false, error: 'nombre_vacio' },
  );
  assert.deepEqual(
    validarCrearAdmin({ email: 'jorge@edutia.ar', nombre: 'Jorge', nivel: 'jefazo' }),
    { ok: false, error: 'nivel_invalido' },
  );
  assert.deepEqual(
    validarCrearAdmin({ email: 'jorge@edutia.ar', nombre: 'Jorge' }),
    { ok: false, error: 'nivel_invalido' },
  );
  // Todo mal → gana el email (el primero que se chequea).
  assert.deepEqual(validarCrearAdmin({}), { ok: false, error: 'email_invalido' });
});

test('generarPasswordTemporal: largo fijo y alfabeto sin caracteres ambiguos', () => {
  const p = generarPasswordTemporal();
  assert.equal(p.length, PASSWORD_LARGO);
  assert.equal(PASSWORD_LARGO, 20);
  assert.match(p, /^[a-zA-Z2-9]+$/);
  for (const feo of ['0', 'O', '1', 'l', 'I']) {
    assert.ok(!p.includes(feo), `la password no debería traer "${feo}" (se dicta por teléfono)`);
  }
});

test('generarPasswordTemporal: con azar inyectado es determinística', () => {
  assert.equal(generarPasswordTemporal(() => 0), 'a'.repeat(20));
  let i = 0;
  assert.equal(generarPasswordTemporal(() => i++ % 3), 'abcabcabcabcabcabcab');
});

test('generarPasswordTemporal: dos llamadas reales no dan lo mismo', () => {
  assert.notEqual(generarPasswordTemporal(), generarPasswordTemporal());
});
