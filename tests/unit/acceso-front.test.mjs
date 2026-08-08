// Tests del acceso visto desde el front docente (Dashboard admin v3, F3):
// gating de features en el menú/páginas y avisos de trial. Espejo de lectura
// de _shared/acceso-logica.ts — si divergen, la seño ve cosas que el server
// después le corta. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoAcceso, diasHasta, ERRS_ACCESO, featureActiva, puedeGenerar } from '../../web/lib/acceso.ts';
import { featureActiva as featureActivaServer } from '../../supabase/functions/_shared/acceso-logica.ts';

const FLAGS_COMPLETO = { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: true }, terra: false };
const FLAGS_BASICO = { sol: true, luna: { activa: false, alertas: false, boletines: false, chat: false }, terra: false };
const now = new Date('2026-08-06T12:00:00Z');

test('featureActiva del front y del server dicen SIEMPRE lo mismo', () => {
  const casos = [FLAGS_COMPLETO, FLAGS_BASICO,
    { sol: false, luna: { activa: true, alertas: true, boletines: false, chat: true }, terra: true },
    { sol: true, luna: { activa: true, alertas: false, boletines: true, chat: false }, terra: false },
    {}, null, undefined];
  const features = ['sol', 'luna', 'luna.alertas', 'luna.boletines', 'luna.chat', 'terra', 'inventada', undefined];
  for (const flags of casos) {
    for (const f of features) {
      assert.equal(
        featureActiva(flags, f), featureActivaServer(flags, f),
        `divergen para flags=${JSON.stringify(flags)} feature=${f}`,
      );
    }
  }
});

test('luna.activa apagada apaga todas las sub-features', () => {
  const mixto = { sol: true, luna: { activa: false, alertas: true, boletines: true, chat: true }, terra: false };
  assert.equal(featureActiva(mixto, 'luna'), false);
  assert.equal(featureActiva(mixto, 'luna.chat'), false, 'el sub-flag no puede prender con la maestra apagada');
  assert.equal(featureActiva(mixto, 'sol'), true, 'SOL no depende de LUNA');
});

test('un sub-flag apagado no afecta a los otros', () => {
  const sinChat = { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: false }, terra: false };
  assert.equal(featureActiva(sinChat, 'luna.chat'), false);
  assert.equal(featureActiva(sinChat, 'luna.boletines'), true);
  assert.equal(featureActiva(sinChat, 'luna'), true, 'la sección sigue existiendo');
});

test('puedeGenerar: solo con acceso activo (sin datos no traba la UI)', () => {
  assert.equal(puedeGenerar(null), true, 'todavía no sabemos → no trabamos');
  assert.equal(puedeGenerar({ estado: 'activo', motivo: null, trial_fin: null, features: FLAGS_COMPLETO }), true);
  assert.equal(puedeGenerar({ estado: 'solo_lectura', motivo: 'trial_vencido', trial_fin: '2026-08-01', features: FLAGS_COMPLETO }), false);
  assert.equal(puedeGenerar({ estado: 'bloqueado', motivo: 'colegio_suspendido', trial_fin: null, features: FLAGS_COMPLETO }), false);
});

test('diasHasta cuenta días enteros en UTC, con signo', () => {
  assert.equal(diasHasta('2026-08-06', now), 0, 'vence hoy');
  assert.equal(diasHasta('2026-08-07', now), 1);
  assert.equal(diasHasta('2026-08-13', now), 7);
  assert.equal(diasHasta('2026-08-01', now), -5, 'ya venció');
  assert.equal(diasHasta(null, now), null);
});

test('avisoAcceso: bloqueado y solo lectura mandan sobre el countdown', () => {
  const bloq = avisoAcceso({ estado: 'bloqueado', motivo: 'colegio_suspendido', trial_fin: '2026-08-09', features: FLAGS_COMPLETO }, now);
  assert.equal(bloq?.tipo, 'bloqueado');
  const solo = avisoAcceso({ estado: 'solo_lectura', motivo: 'trial_vencido', trial_fin: '2026-08-01', features: FLAGS_COMPLETO }, now);
  assert.equal(solo?.tipo, 'solo_lectura');
});

test('avisoAcceso: avisa en la ventana de 7 días y calla fuera de ella', () => {
  const activo = (trial_fin) => ({ estado: 'activo', motivo: null, trial_fin, features: FLAGS_COMPLETO });
  assert.equal(avisoAcceso(activo('2026-08-13'), now)?.tipo, 'por_vencer', 'faltan 7 días → avisa');
  assert.equal(avisoAcceso(activo('2026-08-14'), now), null, 'faltan 8 días → todavía no');
  assert.equal(avisoAcceso(activo(null), now), null, 'sin trial no hay aviso');
  assert.equal(avisoAcceso(null, now), null, 'sin datos no hay aviso');

  const hoy = avisoAcceso(activo('2026-08-06'), now);
  assert.equal(hoy?.tipo, 'por_vencer');
  assert.match(hoy.titulo, /hoy/i);
  const manana = avisoAcceso(activo('2026-08-07'), now);
  assert.match(manana.titulo, /1 día(?!s)/, 'singular en 1 día');
});

test('hay copy en español para cada código de corte del server', () => {
  for (const codigo of ['trial_vencido', 'colegio_suspendido', 'cuenta_suspendida', 'feature_apagada', 'tope_excedido']) {
    assert.ok(ERRS_ACCESO[codigo]?.length > 10, `falta copy para ${codigo}`);
  }
});
