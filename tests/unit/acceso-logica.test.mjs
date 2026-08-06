// Unit — lógica pura del enforcement de acceso (WP3, Dashboard admin v3).
// decidirAcceso es el contrato que la Fase final cablea en las 10 fns
// existentes vía verificarAcceso (_shared/acceso.ts): la matriz de acá ES la
// conducta de producción. Node strippa los tipos del .ts, sin build. npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES_DEFAULT,
  FUNCIONES_POR_FEATURE,
  claveTope,
  featureActiva,
  limitesEfectivos,
  decidirAcceso,
  fechaValida,
  validarFechasTrial,
  extenderTrialDesde,
  diasValidos,
  validarLimites,
  inicioMesUTC,
  hoyISO,
} from '../../supabase/functions/_shared/acceso-logica.ts';

// Flags default (espejo de features_default() en la migración 0018).
const FLAGS = { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: true }, terra: false };
const acceso = (estado, motivo = null, features = FLAGS) => ({ estado, motivo, features });

// ── decidirAcceso: estados ──────────────────────────────────────────────────

test('bloqueado → 403 con el motivo del acceso, genere o no', () => {
  for (const motivo of ['colegio_suspendido', 'cuenta_suspendida', 'sin_perfil', 'sin_escuela']) {
    for (const genera of [true, false]) {
      const v = decidirAcceso({ acceso: acceso('bloqueado', motivo), genera, feature: 'sol' });
      assert.deepEqual(v, { permitido: false, motivo, status: 403 }, `bloqueado/${motivo}/genera=${genera}`);
    }
  }
});

test('bloqueado sin motivo → fallback "bloqueado" (nunca motivo null con permitido false)', () => {
  const v = decidirAcceso({ acceso: acceso('bloqueado', null), genera: true });
  assert.deepEqual(v, { permitido: false, motivo: 'bloqueado', status: 403 });
});

test('solo_lectura + genera → trial_vencido 403 (corte suave)', () => {
  const v = decidirAcceso({ acceso: acceso('solo_lectura', 'trial_vencido'), genera: true, feature: 'sol' });
  assert.deepEqual(v, { permitido: false, motivo: 'trial_vencido', status: 403 });
});

test('solo_lectura sin genera → permitido (las lecturas pasan)', () => {
  const v = decidirAcceso({ acceso: acceso('solo_lectura', 'trial_vencido'), genera: false, feature: 'sol' });
  assert.deepEqual(v, { permitido: true, motivo: null, status: 200 });
});

test('solo_lectura sin genera pero feature apagada → feature_apagada (apagada es apagada)', () => {
  const flags = { ...FLAGS, sol: false };
  const v = decidirAcceso({ acceso: acceso('solo_lectura', 'trial_vencido', flags), genera: false, feature: 'sol' });
  assert.deepEqual(v, { permitido: false, motivo: 'feature_apagada', status: 403 });
});

test('activo sin feature ni topes → permitido', () => {
  const v = decidirAcceso({ acceso: acceso('activo'), genera: true });
  assert.deepEqual(v, { permitido: true, motivo: null, status: 200 });
});

// ── decidirAcceso: features ─────────────────────────────────────────────────

test('activo con sol apagado → feature_apagada 403', () => {
  const flags = { ...FLAGS, sol: false };
  const v = decidirAcceso({ acceso: acceso('activo', null, flags), genera: true, feature: 'sol' });
  assert.deepEqual(v, { permitido: false, motivo: 'feature_apagada', status: 403 });
});

test('luna.activa=false apaga TODAS las sub-features aunque el sub-flag diga true', () => {
  const flags = { ...FLAGS, luna: { activa: false, alertas: true, boletines: true, chat: true } };
  for (const feature of ['luna.alertas', 'luna.boletines', 'luna.chat']) {
    const v = decidirAcceso({ acceso: acceso('activo', null, flags), genera: true, feature });
    assert.equal(v.motivo, 'feature_apagada', feature);
    assert.equal(v.status, 403);
  }
});

test('luna.activa=true con un sub-flag apagado → solo esa sub-feature cae', () => {
  const flags = { ...FLAGS, luna: { activa: true, alertas: true, boletines: true, chat: false } };
  const chat = decidirAcceso({ acceso: acceso('activo', null, flags), genera: true, feature: 'luna.chat' });
  assert.deepEqual(chat, { permitido: false, motivo: 'feature_apagada', status: 403 });
  const boletin = decidirAcceso({ acceso: acceso('activo', null, flags), genera: true, feature: 'luna.boletines', usoMes: 0 });
  assert.equal(boletin.permitido, true);
});

test('featureActiva: sin feature → true; desconocida o flags rotos → false (fail-closed)', () => {
  assert.equal(featureActiva(FLAGS), true);
  assert.equal(featureActiva(FLAGS, undefined), true);
  assert.equal(featureActiva(FLAGS, 'marte'), false);
  assert.equal(featureActiva(FLAGS, 'luna.inventada'), false);
  assert.equal(featureActiva(null, 'sol'), false);
  assert.equal(featureActiva({}, 'luna.chat'), false);
  assert.equal(featureActiva(FLAGS, 'terra'), false); // terra:false en el default
});

// ── decidirAcceso: topes mensuales ──────────────────────────────────────────

test('justo EN el tope → tope_excedido 429 (>= es excedido)', () => {
  const v = decidirAcceso({
    acceso: acceso('activo'), genera: true, feature: 'sol',
    usoMes: LIMITES_DEFAULT.sol_mes, limites: null,
  });
  assert.deepEqual(v, { permitido: false, motivo: 'tope_excedido', status: 429 });
});

test('uno abajo del tope → permitido', () => {
  const v = decidirAcceso({
    acceso: acceso('activo'), genera: true, feature: 'sol',
    usoMes: LIMITES_DEFAULT.sol_mes - 1, limites: null,
  });
  assert.equal(v.permitido, true);
});

test('tope custom del colegio pisa el default (más chico y más grande)', () => {
  // Custom más chico que el default: corta antes.
  let v = decidirAcceso({ acceso: acceso('activo'), genera: true, feature: 'sol', usoMes: 10, limites: { sol_mes: 10 } });
  assert.deepEqual(v, { permitido: false, motivo: 'tope_excedido', status: 429 });
  // Custom más grande: lo que el default cortaría, pasa.
  v = decidirAcceso({
    acceso: acceso('activo'), genera: true, feature: 'luna.boletines',
    usoMes: LIMITES_DEFAULT.boletines_mes, limites: { boletines_mes: 500 },
  });
  assert.equal(v.permitido, true);
});

test('clave custom en null → vuelve al default (null NO es "sin tope")', () => {
  const v = decidirAcceso({
    acceso: acceso('activo'), genera: true, feature: 'sol',
    usoMes: LIMITES_DEFAULT.sol_mes, limites: { sol_mes: null },
  });
  assert.deepEqual(v, { permitido: false, motivo: 'tope_excedido', status: 429 });
});

test('luna.alertas no tiene tope: pasa con cualquier uso', () => {
  const v = decidirAcceso({ acceso: acceso('activo'), genera: true, feature: 'luna.alertas', usoMes: 999999, limites: null });
  assert.deepEqual(v, { permitido: true, motivo: null, status: 200 });
});

test('sin genera no se aplica tope aunque el uso lo pase', () => {
  const v = decidirAcceso({ acceso: acceso('activo'), genera: false, feature: 'luna.chat', usoMes: 999999, limites: null });
  assert.equal(v.permitido, true);
});

test('usoMes ausente → no se gatea por tope (el I/O siempre lo trae cuando corresponde)', () => {
  const v = decidirAcceso({ acceso: acceso('activo'), genera: true, feature: 'sol' });
  assert.equal(v.permitido, true);
});

test('el chequeo de feature va antes que el de tope', () => {
  const flags = { ...FLAGS, luna: { activa: true, alertas: true, boletines: true, chat: false } };
  const v = decidirAcceso({
    acceso: acceso('activo', null, flags), genera: true, feature: 'luna.chat',
    usoMes: 999999, limites: null,
  });
  assert.equal(v.motivo, 'feature_apagada');
});

// ── claveTope y FUNCIONES_POR_FEATURE ───────────────────────────────────────

test('claveTope mapea feature → clave de limites; alertas y desconocidas → null', () => {
  assert.equal(claveTope('sol'), 'sol_mes');
  assert.equal(claveTope('luna.boletines'), 'boletines_mes');
  assert.equal(claveTope('luna.chat'), 'chats_mes');
  assert.equal(claveTope('luna.alertas'), null);
  assert.equal(claveTope(undefined), null);
  assert.equal(claveTope('marte'), null);
});

test('FUNCIONES_POR_FEATURE: mapeo exacto de uso_api.funcion, sin solapamientos', () => {
  assert.deepEqual([...FUNCIONES_POR_FEATURE.sol], ['sol', 'sol-chat', 'generador-ejercicios', 'dividir-nodos', 'evaluar-sesion']);
  assert.deepEqual([...FUNCIONES_POR_FEATURE['luna.boletines']], ['luna-boletin']);
  assert.deepEqual([...FUNCIONES_POR_FEATURE['luna.chat']], ['luna-chat']);
  assert.deepEqual([...FUNCIONES_POR_FEATURE['luna.alertas']], [], 'alertas no gasta IA');
  const todas = Object.values(FUNCIONES_POR_FEATURE).flat();
  assert.equal(new Set(todas).size, todas.length, 'ninguna funcion cuenta para dos features');
});

test('cada feature con tope tiene funciones que contar, y viceversa', () => {
  for (const [feature, funciones] of Object.entries(FUNCIONES_POR_FEATURE)) {
    const clave = claveTope(feature);
    assert.equal(clave !== null, funciones.length > 0, `${feature}: tope y funciones van juntos`);
    if (clave) assert.ok(LIMITES_DEFAULT[clave] > 0, `${clave} tiene default positivo`);
  }
});

test('LIMITES_DEFAULT: solo las tres claves, enteros positivos', () => {
  assert.deepEqual(Object.keys(LIMITES_DEFAULT).sort(), ['boletines_mes', 'chats_mes', 'sol_mes']);
  for (const v of Object.values(LIMITES_DEFAULT)) assert.ok(Number.isInteger(v) && v > 0);
});

test('limitesEfectivos: null → defaults; parcial mergea; null/invalidos → default', () => {
  assert.deepEqual(limitesEfectivos(null), { ...LIMITES_DEFAULT });
  assert.deepEqual(limitesEfectivos({ sol_mes: 50 }), { ...LIMITES_DEFAULT, sol_mes: 50 });
  assert.deepEqual(limitesEfectivos({ sol_mes: null, chats_mes: 5 }), { ...LIMITES_DEFAULT, chats_mes: 5 });
});

// ── Fechas puras ────────────────────────────────────────────────────────────

test('fechaValida: YYYY-MM-DD reales', () => {
  assert.equal(fechaValida('2026-08-06'), true);
  assert.equal(fechaValida('2026-8-6'), false);
  assert.equal(fechaValida('06/08/2026'), false);
  assert.equal(fechaValida(''), false);
  assert.equal(fechaValida(null), false);
  assert.equal(fechaValida(20260806), false);
});

test('validarFechasTrial: fin estrictamente posterior al inicio', () => {
  assert.equal(validarFechasTrial('2026-08-01', '2026-08-31').ok, true);
  assert.equal(validarFechasTrial('2026-08-31', '2026-08-01').ok, false, 'fin antes del inicio');
  assert.equal(validarFechasTrial('2026-08-01', '2026-08-01').ok, false, 'mismo día no es trial');
  assert.equal(validarFechasTrial('mañana', '2026-08-31').ok, false);
  assert.equal(validarFechasTrial('2026-08-01', undefined).ok, false);
});

test('extenderTrialDesde: vigente suma desde el fin; vencido o sin trial, desde hoy', () => {
  const hoy = '2026-08-06';
  assert.equal(extenderTrialDesde('2026-08-20', 30, hoy), '2026-09-19', 'vigente: fin + 30');
  assert.equal(extenderTrialDesde('2026-07-01', 30, hoy), '2026-09-05', 'vencido: hoy + 30');
  assert.equal(extenderTrialDesde(null, 30, hoy), '2026-09-05', 'sin trial: hoy + 30');
  assert.equal(extenderTrialDesde(hoy, 30, hoy), '2026-09-05', 'vence hoy: hoy + 30');
  assert.equal(extenderTrialDesde('2026-12-30', 5, hoy), '2027-01-04', 'cruza el año');
});

test('diasValidos: enteros positivos acotados', () => {
  assert.equal(diasValidos(30), true);
  assert.equal(diasValidos(1), true);
  assert.equal(diasValidos(0), false);
  assert.equal(diasValidos(-5), false);
  assert.equal(diasValidos(2.5), false);
  assert.equal(diasValidos('30'), false);
  assert.equal(diasValidos(99999), false);
});

test('hoyISO e inicioMesUTC con fecha inyectada', () => {
  const d = new Date('2026-08-06T15:30:00Z');
  assert.equal(hoyISO(d), '2026-08-06');
  assert.equal(inicioMesUTC(d), '2026-08-01T00:00:00.000Z');
  // Borde: primer instante del mes en UTC aunque localmente sea "el mes pasado".
  assert.equal(inicioMesUTC(new Date('2026-08-01T00:00:00Z')), '2026-08-01T00:00:00.000Z');
});

// ── validarLimites ──────────────────────────────────────────────────────────

test('validarLimites: acepta enteros positivos, null por clave y null entero', () => {
  let v = validarLimites({ sol_mes: 100, boletines_mes: null, chats_mes: 20 });
  assert.equal(v.ok, true);
  assert.deepEqual(v.limites, { sol_mes: 100, boletines_mes: null, chats_mes: 20 });
  v = validarLimites(null);
  assert.equal(v.ok, true);
  assert.equal(v.limites, null, 'null entero = borrar el custom');
  v = validarLimites({});
  assert.equal(v.ok, true, 'objeto vacío es válido (todo default)');
});

test('validarLimites: rechaza claves desconocidas y valores inválidos', () => {
  assert.equal(validarLimites({ marte_mes: 10 }).ok, false);
  assert.equal(validarLimites({ sol_mes: 0 }).ok, false, 'cero no es positivo');
  assert.equal(validarLimites({ sol_mes: -10 }).ok, false);
  assert.equal(validarLimites({ sol_mes: 2.5 }).ok, false);
  assert.equal(validarLimites({ sol_mes: '100' }).ok, false);
  assert.equal(validarLimites([100]).ok, false);
  assert.equal(validarLimites('todo').ok, false);
});
