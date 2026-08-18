// Unit — bandas de confianza del mapeo NAP (feature "auto-triage por banda").
// Tres bandas sobre la clasificación de SOL: confiable (cuenta sin revisión),
// a revisar (cola del admin) y descartado (fuera del marco efectivo, visible
// bajo el toggle). La decisión humana (nap_revisado) siempre manda.
// Correr: npm test (o node --test tests/unit/nap-bandas.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandaNap, mapeoCuenta, UMBRAL_CONFIABLE, UMBRAL_DESCARTE,
} from '../../supabase/functions/_shared/nap-bandas.ts';
import * as front from '../../web/lib/admin/nap-bandas.ts';

// ── bandaNap ─────────────────────────────────────────────────────────────

test('bandaNap: sin propuesta (nap_tema_id null) es descartado', () => {
  assert.equal(bandaNap({ nap_tema_id: null, nap_confianza: null }), 'descartado');
});

test('bandaNap: confianza por debajo del umbral de descarte es descartado', () => {
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: 0.55 }), 'descartado');
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: 0.59 }), 'descartado');
});

test('bandaNap: la banda media (0.60 inclusive a 0.75 exclusive) es a revisar', () => {
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: 0.60 }), 'revisar');
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: 0.74 }), 'revisar');
});

test('bandaNap: 0.75 en adelante es confiable', () => {
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: 0.75 }), 'confiable');
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: 0.9 }), 'confiable');
});

test('bandaNap: tema puesto sin confianza (mapeo sin respaldo) es a revisar, no descartado', () => {
  // Caso real alcanzable desde la publicación: el schema de la tool no exige
  // nap_confianza. Un mapeo sin respaldo lo mira un humano — nunca se
  // descarta solo algo que SOL sí mapeó pero no supo puntuar.
  assert.equal(bandaNap({ nap_tema_id: 't1', nap_confianza: null }), 'revisar');
});

test('bandaNap: tolera campos ausentes (shape parcial de una consulta vieja)', () => {
  assert.equal(bandaNap({}), 'descartado');
  assert.equal(bandaNap({ nap_tema_id: 't1' }), 'revisar');
});

// ── mapeoCuenta (filtro del Observatorio) ────────────────────────────────

test('mapeoCuenta: confiable sin revisar cuenta', () => {
  assert.equal(mapeoCuenta({ nap_tema_id: 't1', nap_confianza: 0.8, nap_revisado: false }), true);
});

test('mapeoCuenta: banda media pendiente NO cuenta hasta que un humano confirme', () => {
  assert.equal(mapeoCuenta({ nap_tema_id: 't1', nap_confianza: 0.65, nap_revisado: false }), false);
});

test('mapeoCuenta: descartado no cuenta', () => {
  assert.equal(mapeoCuenta({ nap_tema_id: 't1', nap_confianza: 0.4, nap_revisado: false }), false);
  assert.equal(mapeoCuenta({ nap_tema_id: null, nap_confianza: null, nap_revisado: false }), false);
});

test('mapeoCuenta: la decisión humana manda aunque la confianza fuera baja', () => {
  assert.equal(mapeoCuenta({ nap_tema_id: 't1', nap_confianza: 0.2, nap_revisado: true }), true);
});

test('mapeoCuenta: revisado como fuera del marco no cuenta', () => {
  assert.equal(mapeoCuenta({ nap_tema_id: null, nap_confianza: 0.9, nap_revisado: true }), false);
});

test('mapeoCuenta: sin campos de banda (fila vieja, solo tema) no cuenta — pendiente es pendiente', () => {
  assert.equal(mapeoCuenta({ nap_tema_id: 't1' }), false);
});

// ── Paridad server ↔ front ───────────────────────────────────────────────
// El front muestra los umbrales en el copy de la pantalla de revisión; si se
// despegan del server, la pantalla miente. Mismo patrón que planes.ts /
// provincias.ts / auditoria-clasificacion.ts.

test('paridad: los umbrales del front y del server son idénticos', () => {
  assert.equal(front.UMBRAL_CONFIABLE, UMBRAL_CONFIABLE);
  assert.equal(front.UMBRAL_DESCARTE, UMBRAL_DESCARTE);
});

test('paridad: bandaNap y mapeoCuenta se comportan igual en ambos lados', () => {
  const casos = [];
  for (const tema of ['t1', null]) {
    for (const conf of [null, 0, 0.55, 0.6, 0.7, 0.74, 0.75, 0.8, 1]) {
      for (const rev of [true, false, undefined]) {
        casos.push({ nap_tema_id: tema, nap_confianza: conf, nap_revisado: rev });
      }
    }
  }
  for (const c of casos) {
    assert.equal(front.bandaNap(c), bandaNap(c), JSON.stringify(c));
    assert.equal(front.mapeoCuenta(c), mapeoCuenta(c), JSON.stringify(c));
  }
});
