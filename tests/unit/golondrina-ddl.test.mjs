// Unit — Fase 2 del alumno golondrina (migraciones 0023–0026): congela las
// reglas ESTRUCTURALES de los DDL contra su texto (patrón del test de paridad
// de matricula-logica) y prueba el detector de licencias por vencer que
// reemplaza al de trials (misma semántica 7/3 días, clave nueva).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluarAlertas } from '../../supabase/functions/_shared/alertas-logica.ts';
import { ERRS_MATRICULA } from '../../supabase/functions/_shared/matricula-logica.ts';

const sql = (n) => readFileSync(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8');

// ── Reglas duras congeladas en el texto de las migraciones ──────────────────

test('0023: sin consentimiento registrado NO existe transferencia (CHECK en DB)', () => {
  const s = sql('0023_consentimiento_transferencia.sql');
  assert.ok(s.includes(`check (estado <> 'confirmada' or consentimiento_id is not null)`),
    'el CHECK que hace imposible confirmar sin consentimiento, ni por SQL directo');
  assert.ok(s.includes('transferencia_una_pendiente'), 'a lo sumo una pendiente por alumno');
  assert.ok(s.includes(`alcance = 'transferencia'`) && s.includes(`estado = 'vigente'`),
    'matricula_abrir v2 valida contenido: alcance + vigencia');
  assert.ok(s.includes('escuela_id = p_escuela'), 'el consentimiento es HACIA la escuela que abre');
  assert.ok(s.includes('pendiente_regularizar'), 'backfill de deuda visible');
  // Prohibición de DNI: ningún identificador estatal como COLUMNA del esquema
  // (los comentarios pueden nombrar la prohibición; una columna tipada no).
  assert.ok(!/\b(dni|documento)\w*\s+(text|int|bigint|varchar|numeric)/i.test(s),
    'sin columna DNI/documento en consentimiento/transferencia');
});

test('0024: ARCO — el caso sobrevive a la cancelación y la oposición queda protegida', () => {
  const s = sql('0024_arco.sql');
  assert.ok(s.includes('alumno_id     uuid not null,'), 'alumno_id SIN FK: el caso legal sobrevive al borrado');
  assert.ok(!s.includes('alumno_id     uuid not null references'), 'confirmación: sin references');
  assert.ok(s.includes('excluido_procesamiento'), 'columna de oposición');
  assert.ok(s.includes('new.excluido_procesamiento is distinct from old.excluido_procesamiento'),
    'perfil_guard v2 protege también la oposición');
  assert.ok(s.includes('arco_set_exclusion'), 'única puerta de escritura de la oposición');
  for (const t of ['acceso', 'rectificacion', 'cancelacion', 'oposicion']) {
    assert.ok(s.includes(`'${t}'`), `tipo ARCO ${t}`);
  }
});

test('0025: institucion_admin es tabla propia (fail-closed), no un nivel de plataforma_admin', () => {
  const s = sql('0025_instituciones.sql');
  assert.ok(s.includes('create table institucion_admin'), 'tabla propia');
  assert.ok(!s.includes('alter table plataforma_admin'), 'plataforma_admin NO se toca');
  assert.ok(s.includes('institucion_id uuid references institucion(id)'), 'escuela cuelga de institución');
});

test('0026: licencia XOR (colegio o institución), cupos solo pools, corte suave', () => {
  const s = sql('0026_licencias.sql');
  assert.ok(s.includes('num_nonnulls(escuela_id, institucion_id) = 1'), 'XOR en DB');
  assert.ok(s.includes('check (institucion_id is not null or cupos is null)'), 'cupos solo en pools');
  assert.ok(s.includes('licencia_cupos_guard'), 'respaldo del cupo a nivel DB');
  assert.ok(s.includes(`'solo_lectura'`) && s.includes('licencia_vencida'),
    'vencida = solo lectura (corte suave), jamás borrar');
  assert.ok(s.includes('acceso_calcular(p_perfil uuid)'), 'misma firma que 0018');
});

test('copy en español para consentimiento_invalido (matricula_abrir v2)', () => {
  assert.ok(ERRS_MATRICULA.consentimiento_invalido?.length > 10);
});

// ── detectarLicencia (reemplaza detectarTrial; fallback legacy intacto) ─────

// Jueves 6 de agosto de 2026, media mañana (misma base que admin-alertas).
const NOW = new Date(2026, 7, 6, 10, 30);

const esc = (over = {}) => ({
  id: 'e1', nombre: 'Esc. Rural 12', estado: 'activo', trial_fin: null, ...over,
});
const base = (escuelas) => ({
  escuelas,
  ultimaSesionPorEscuela: { e1: new Date(2026, 7, 5, 15, 0).toISOString() },
  costoMesPorEscuela: {},
  costoMesAnteriorPorEscuela: {},
  atendidas: [],
});
const deVencer = (alertas) => alertas.filter((a) => a.tipo === 'trial_por_vencer');

test('licencia en prueba que vence en 2 días → alta, clave licencia:<id>:<fin>', () => {
  const r = deVencer(evaluarAlertas(base([esc({
    licencia: { id: 'lic1', estado: 'prueba', fecha_fin: '2026-08-08' },
  })]), NOW));
  assert.equal(r.length, 1);
  assert.equal(r[0].clave, 'licencia:lic1:2026-08-08');
  assert.equal(r[0].prioridad, 'alta');
  assert.match(r[0].titulo, /prueba/);
});

test('licencia ACTIVA (paga) que vence en 6 días → media, dice "licencia"', () => {
  const r = deVencer(evaluarAlertas(base([esc({
    licencia: { id: 'lic2', estado: 'activa', fecha_fin: '2026-08-12' },
  })]), NOW));
  assert.equal(r.length, 1);
  assert.equal(r[0].prioridad, 'media');
  assert.match(r[0].titulo, /licencia/);
});

test('licencia ya vencida → alerta alta (el operador tiene que actuar igual)', () => {
  const r = deVencer(evaluarAlertas(base([esc({
    licencia: { id: 'lic3', estado: 'vencida', fecha_fin: '2026-08-01' },
  })]), NOW));
  assert.equal(r.length, 1);
  assert.equal(r[0].prioridad, 'alta');
});

test('licencia suspendida o sin fecha_fin → NO alerta (ya se actuó / no vence)', () => {
  const r = evaluarAlertas(base([
    esc({ id: 'e1', licencia: { id: 'l1', estado: 'suspendida', fecha_fin: '2026-08-07' } }),
    esc({ id: 'e2', nombre: 'Esc. 2', licencia: { id: 'l2', estado: 'activa', fecha_fin: null } }),
  ]), NOW);
  assert.equal(deVencer(r).length, 0);
});

test('lejos del vencimiento (>7 días) → NO alerta', () => {
  const r = deVencer(evaluarAlertas(base([esc({
    licencia: { id: 'lic4', estado: 'prueba', fecha_fin: '2026-08-20' },
  })]), NOW));
  assert.equal(r.length, 0);
});

test('colegio SIN licencia → fallback al trial legacy con la clave vieja', () => {
  const r = deVencer(evaluarAlertas(base([esc({
    estado: 'trial', trial_fin: '2026-08-08', licencia: null,
  })]), NOW));
  assert.equal(r.length, 1);
  assert.equal(r[0].clave, 'trial:e1:2026-08-08');
});

test('atendida por clave: la alerta de licencia también se silencia para siempre', () => {
  const input = base([esc({ licencia: { id: 'lic1', estado: 'prueba', fecha_fin: '2026-08-08' } })]);
  input.atendidas = ['licencia:lic1:2026-08-08'];
  assert.equal(deVencer(evaluarAlertas(input, NOW)).length, 0);
});
