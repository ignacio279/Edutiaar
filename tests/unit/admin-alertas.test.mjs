// Unit — alertas del operador (Dashboard admin v3 / WP7): lógica pura de
// supabase/functions/admin-crm/alertas-logica.ts. Cada detector se prueba en
// su borde EXACTO con `now` fijo (nada de new Date() en la lógica).
// Umbrales: trial ≤7 días (alta si ≤3, incluido vencido) · inactivo ≥14 días
// (null = nunca → alerta) · costo > 2× mes anterior o > 50 USD absolutos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarAlertas,
  costosPorMes,
  claveMes,
  validarNota,
  validarContacto,
} from '../../supabase/functions/admin-crm/alertas-logica.ts';

// Jueves 6 de agosto de 2026, media mañana (hora local).
const NOW = new Date(2026, 7, 6, 10, 30);

const esc = (over = {}) => ({
  id: 'e1', nombre: 'Esc. Rural 12', estado: 'activo', trial_fin: null, ...over,
});

const base = (over = {}) => ({
  escuelas: [],
  ultimaSesionPorEscuela: {},
  costoMesPorEscuela: {},
  costoMesAnteriorPorEscuela: {},
  atendidas: [],
  ...over,
});

// Sesión reciente para que el detector de inactividad no meta ruido.
const sesionAyer = { e1: new Date(2026, 7, 5, 15, 0).toISOString() };

const soloTipo = (alertas, tipo) => alertas.filter((a) => a.tipo === tipo);

// ── trial_por_vencer ────────────────────────────────────────────────────────

test('trial: vence HOY → alta', () => {
  const r = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-06' })],
    ultimaSesionPorEscuela: sesionAyer,
  }), NOW);
  const t = soloTipo(r, 'trial_por_vencer');
  assert.equal(t.length, 1);
  assert.equal(t[0].prioridad, 'alta');
  assert.match(t[0].titulo, /HOY/);
});

test('trial: vence en 3 días → alta; en 4 → media', () => {
  for (const [fin, prioridad] of [['2026-08-09', 'alta'], ['2026-08-10', 'media']]) {
    const r = evaluarAlertas(base({
      escuelas: [esc({ estado: 'trial', trial_fin: fin })],
      ultimaSesionPorEscuela: sesionAyer,
    }), NOW);
    const t = soloTipo(r, 'trial_por_vencer');
    assert.equal(t.length, 1, `trial_fin=${fin} dispara`);
    assert.equal(t[0].prioridad, prioridad, `trial_fin=${fin} → ${prioridad}`);
  }
});

test('trial: en 7 días → media; en 8 días → NO dispara', () => {
  const en7 = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-13' })],
    ultimaSesionPorEscuela: sesionAyer,
  }), NOW);
  assert.equal(soloTipo(en7, 'trial_por_vencer').length, 1);
  assert.equal(soloTipo(en7, 'trial_por_vencer')[0].prioridad, 'media');

  const en8 = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-14' })],
    ultimaSesionPorEscuela: sesionAyer,
  }), NOW);
  assert.equal(soloTipo(en8, 'trial_por_vencer').length, 0);
});

test('trial: ya vencido → alta (el operador tiene que actuar igual)', () => {
  const r = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-01' })],
    ultimaSesionPorEscuela: sesionAyer,
  }), NOW);
  const t = soloTipo(r, 'trial_por_vencer');
  assert.equal(t.length, 1);
  assert.equal(t[0].prioridad, 'alta');
  assert.match(t[0].titulo, /venció hace 5 días/);
});

test('trial: colegio activo (no trial) o sin trial_fin → nunca dispara', () => {
  const r = evaluarAlertas(base({
    escuelas: [
      esc({ id: 'a', estado: 'activo', trial_fin: '2026-08-07' }),
      esc({ id: 'b', estado: 'trial', trial_fin: null }),
    ],
    ultimaSesionPorEscuela: { a: sesionAyer.e1, b: sesionAyer.e1 },
  }), NOW);
  assert.equal(soloTipo(r, 'trial_por_vencer').length, 0);
});

test('trial: clave determinística trial:<id>:<trial_fin>', () => {
  const r = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-09' })],
    ultimaSesionPorEscuela: sesionAyer,
  }), NOW);
  assert.equal(soloTipo(r, 'trial_por_vencer')[0].clave, 'trial:e1:2026-08-09');
});

test('trial: atendida no vuelve; extender el trial cambia la clave y vuelve a alertar', () => {
  const atendidas = ['trial:e1:2026-08-09'];
  // Misma fecha atendida → silencio.
  const antes = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-09' })],
    ultimaSesionPorEscuela: sesionAyer,
    atendidas,
  }), NOW);
  assert.equal(soloTipo(antes, 'trial_por_vencer').length, 0);
  // Le extendieron el trial 3 días → clave nueva → alerta de nuevo (correcto).
  const despues = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-12' })],
    ultimaSesionPorEscuela: sesionAyer,
    atendidas,
  }), NOW);
  const t = soloTipo(despues, 'trial_por_vencer');
  assert.equal(t.length, 1);
  assert.equal(t[0].clave, 'trial:e1:2026-08-12');
});

// ── colegio_inactivo ────────────────────────────────────────────────────────

test('inactivo: 13 días NO dispara; 14 días dispara (media)', () => {
  const hace13 = { e1: new Date(2026, 6, 24, 12, 0).toISOString() }; // 24-jul → 13 días
  const hace14 = { e1: new Date(2026, 6, 23, 12, 0).toISOString() }; // 23-jul → 14 días
  const r13 = evaluarAlertas(base({ escuelas: [esc()], ultimaSesionPorEscuela: hace13 }), NOW);
  assert.equal(soloTipo(r13, 'colegio_inactivo').length, 0);
  const r14 = evaluarAlertas(base({ escuelas: [esc()], ultimaSesionPorEscuela: hace14 }), NOW);
  const t = soloTipo(r14, 'colegio_inactivo');
  assert.equal(t.length, 1);
  assert.equal(t[0].prioridad, 'media');
  assert.match(t[0].detalle, /14 días/);
});

test('inactivo: nunca practicó (última sesión null o ausente) → dispara', () => {
  for (const ultima of [{ e1: null }, {}]) {
    const r = evaluarAlertas(base({ escuelas: [esc()], ultimaSesionPorEscuela: ultima }), NOW);
    const t = soloTipo(r, 'colegio_inactivo');
    assert.equal(t.length, 1);
    assert.match(t[0].detalle, /todavía/);
  }
});

test('inactivo: suspendido/archivado no alertan (ya se actuó)', () => {
  const r = evaluarAlertas(base({
    escuelas: [esc({ id: 'a', estado: 'suspendido' }), esc({ id: 'b', estado: 'archivado' })],
  }), NOW);
  assert.equal(soloTipo(r, 'colegio_inactivo').length, 0);
});

test('inactivo: clave mensual inactivo:<id>:<yyyy-mm> — atendida calla este mes', () => {
  const input = base({ escuelas: [esc()], ultimaSesionPorEscuela: { e1: null } });
  const r = evaluarAlertas(input, NOW);
  assert.equal(soloTipo(r, 'colegio_inactivo')[0].clave, 'inactivo:e1:2026-08');
  // Atendida → no vuelve en agosto…
  const callada = evaluarAlertas({ ...input, atendidas: ['inactivo:e1:2026-08'] }, NOW);
  assert.equal(soloTipo(callada, 'colegio_inactivo').length, 0);
  // …pero en septiembre la clave es otra y vuelve (mensual: correcto).
  const sept = evaluarAlertas({ ...input, atendidas: ['inactivo:e1:2026-08'] }, new Date(2026, 8, 3));
  assert.equal(soloTipo(sept, 'colegio_inactivo')[0].clave, 'inactivo:e1:2026-09');
});

// ── costo_disparado ─────────────────────────────────────────────────────────

test('costo: 2× justo NO dispara; apenas por encima dispara (alta)', () => {
  const armar = (mes) => base({
    escuelas: [esc()],
    ultimaSesionPorEscuela: sesionAyer,
    costoMesPorEscuela: { e1: mes },
    costoMesAnteriorPorEscuela: { e1: 10 },
  });
  assert.equal(soloTipo(evaluarAlertas(armar(20), NOW), 'costo_disparado').length, 0, '2× exacto no dispara');
  assert.equal(soloTipo(evaluarAlertas(armar(19.99), NOW), 'costo_disparado').length, 0, 'por debajo no dispara');
  const t = soloTipo(evaluarAlertas(armar(20.01), NOW), 'costo_disparado');
  assert.equal(t.length, 1);
  assert.equal(t[0].prioridad, 'alta');
});

test('costo: mes anterior 0 → solo dispara el umbral absoluto (> 50 USD)', () => {
  const armar = (mes) => base({
    escuelas: [esc()],
    ultimaSesionPorEscuela: sesionAyer,
    costoMesPorEscuela: { e1: mes },
    costoMesAnteriorPorEscuela: { e1: 0 },
  });
  // Sin base de comparación, 10 USD (que sería "infinitas veces más") no alerta.
  assert.equal(soloTipo(evaluarAlertas(armar(10), NOW), 'costo_disparado').length, 0);
  assert.equal(soloTipo(evaluarAlertas(armar(50), NOW), 'costo_disparado').length, 0, '50 exacto no dispara');
  const t = soloTipo(evaluarAlertas(armar(50.01), NOW), 'costo_disparado');
  assert.equal(t.length, 1);
  assert.equal(t[0].prioridad, 'alta');
  assert.match(t[0].detalle, /umbral/);
});

test('costo: clave mensual costo:<id>:<yyyy-mm> y atendida no vuelve', () => {
  const input = base({
    escuelas: [esc()],
    ultimaSesionPorEscuela: sesionAyer,
    costoMesPorEscuela: { e1: 80 },
    costoMesAnteriorPorEscuela: { e1: 5 },
  });
  const r = evaluarAlertas(input, NOW);
  assert.equal(soloTipo(r, 'costo_disparado')[0].clave, 'costo:e1:2026-08');
  const callada = evaluarAlertas({ ...input, atendidas: ['costo:e1:2026-08'] }, NOW);
  assert.equal(soloTipo(callada, 'costo_disparado').length, 0);
});

// ── orden y vacíos ──────────────────────────────────────────────────────────

test('orden: alta primero, media después (estable dentro de cada prioridad)', () => {
  const r = evaluarAlertas(base({
    escuelas: [
      esc({ id: 'a', nombre: 'A', estado: 'trial', trial_fin: '2026-08-13' }), // media
      esc({ id: 'b', nombre: 'B', estado: 'trial', trial_fin: '2026-08-06' }), // alta
      esc({ id: 'c', nombre: 'C', estado: 'activo' }), // inactivo (media, sin sesiones)
    ],
    ultimaSesionPorEscuela: { a: sesionAyer.e1, b: sesionAyer.e1, c: null },
  }), NOW);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((a) => a.prioridad), ['alta', 'media', 'media']);
  assert.equal(r[0].escuelaId, 'b');
  assert.deepEqual(r.slice(1).map((a) => a.escuelaId), ['a', 'c'], 'orden de entrada entre medias');
});

test('vacíos: sin escuelas → []', () => {
  assert.deepEqual(evaluarAlertas(base(), NOW), []);
});

test('un colegio puede acumular varias alertas a la vez', () => {
  const r = evaluarAlertas(base({
    escuelas: [esc({ estado: 'trial', trial_fin: '2026-08-07' })],
    ultimaSesionPorEscuela: { e1: null },
    costoMesPorEscuela: { e1: 60 },
    costoMesAnteriorPorEscuela: { e1: 0 },
  }), NOW);
  assert.deepEqual(r.map((a) => a.tipo).sort(), ['colegio_inactivo', 'costo_disparado', 'trial_por_vencer']);
});

// ── costosPorMes (agregado puro que alimenta al detector) ───────────────────

test('costosPorMes: separa mes actual y anterior por escuela; ignora sin escuela', () => {
  const filas = [
    { escuela_id: 'e1', costo_usd: 1.5, created_at: new Date(2026, 7, 2).toISOString() },
    { escuela_id: 'e1', costo_usd: '2.25', created_at: new Date(2026, 7, 5).toISOString() },
    { escuela_id: 'e1', costo_usd: 4, created_at: new Date(2026, 6, 20).toISOString() },
    { escuela_id: 'e2', costo_usd: 9, created_at: new Date(2026, 6, 1).toISOString() },
    { escuela_id: null, costo_usd: 99, created_at: new Date(2026, 7, 3).toISOString() },
    { escuela_id: 'e1', costo_usd: 7, created_at: new Date(2026, 5, 30).toISOString() }, // junio: fuera
  ];
  const { mesActual, mesAnterior } = costosPorMes(filas, NOW);
  assert.equal(mesActual.e1, 3.75);
  assert.equal(mesAnterior.e1, 4);
  assert.equal(mesAnterior.e2, 9);
  assert.equal(mesActual.e2, undefined);
});

test('claveMes: YYYY-MM con cero a la izquierda', () => {
  assert.equal(claveMes(new Date(2026, 7, 6)), '2026-08');
  assert.equal(claveMes(new Date(2026, 11, 31)), '2026-12');
  assert.equal(claveMes(new Date(2027, 0, 1)), '2027-01');
});

// ── validadores de las acciones CRM ─────────────────────────────────────────

test('validarNota: cuerpo vacío o tipo inválido rechazan; default tipo=nota', () => {
  assert.equal(validarNota({ cuerpo: '' }).ok, false);
  assert.equal(validarNota({ cuerpo: '   ' }).ok, false);
  assert.equal(validarNota({ tipo: 'chisme', cuerpo: 'hola' }).ok, false);
  const ok = validarNota({ cuerpo: '  Llamé al director.  ' });
  assert.deepEqual(ok, { ok: true, tipo: 'nota', cuerpo: 'Llamé al director.' });
  assert.equal(validarNota({ tipo: 'acuerdo', cuerpo: 'x' }).tipo, 'acuerdo');
});

test('validarContacto: shape simple, claves desconocidas o no-string rechazan', () => {
  assert.equal(validarContacto(null).ok, false);
  assert.equal(validarContacto([]).ok, false);
  assert.equal(validarContacto({ hack: 'x' }).ok, false);
  assert.equal(validarContacto({ telefono: 123 }).ok, false);
  const ok = validarContacto({ director: ' Ana ', telefono: '381-555', email: 'a@b.c', notas: '' });
  assert.deepEqual(ok, { ok: true, contacto: { director: 'Ana', telefono: '381-555', email: 'a@b.c', notas: '' } });
  assert.deepEqual(validarContacto({}), { ok: true, contacto: {} });
});
