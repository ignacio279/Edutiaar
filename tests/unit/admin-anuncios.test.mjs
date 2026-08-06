// Unit — validadores puros de admin-anuncios (banner in-app a maestras,
// Dashboard admin v3, WP8). La fuente de verdad es la Edge Function; estos
// helpers la blindan. Node strippa los tipos del .ts, sin build.
// Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TITULO_MAX,
  CUERPO_MAX,
  validarAnuncio,
  estaVigente,
} from '../../supabase/functions/admin-anuncios/validar.ts';

const base = { titulo: 'Mantenimiento el sábado', cuerpo: 'La plataforma va a estar caída de 8 a 10.' };

// ── validarAnuncio ──────────────────────────────────────────────────────────

test('validarAnuncio: un anuncio completo y sin fechas es válido', () => {
  assert.deepEqual(validarAnuncio(base), { ok: true });
  assert.deepEqual(validarAnuncio({ ...base, desde: null, hasta: null }), { ok: true });
  assert.deepEqual(validarAnuncio({ ...base, desde: '', hasta: '' }), { ok: true });
});

test('validarAnuncio: titulo vacío o faltante', () => {
  assert.deepEqual(validarAnuncio({ ...base, titulo: '' }), { ok: false, error: 'titulo_vacio' });
  assert.deepEqual(validarAnuncio({ ...base, titulo: '   ' }), { ok: false, error: 'titulo_vacio' });
  assert.deepEqual(validarAnuncio({ ...base, titulo: undefined }), { ok: false, error: 'titulo_vacio' });
  assert.deepEqual(validarAnuncio({ ...base, titulo: 42 }), { ok: false, error: 'titulo_vacio' });
});

test('validarAnuncio: cuerpo vacío o faltante', () => {
  assert.deepEqual(validarAnuncio({ ...base, cuerpo: '' }), { ok: false, error: 'cuerpo_vacio' });
  assert.deepEqual(validarAnuncio({ ...base, cuerpo: '  ' }), { ok: false, error: 'cuerpo_vacio' });
  assert.deepEqual(validarAnuncio({ titulo: base.titulo }), { ok: false, error: 'cuerpo_vacio' });
});

test('validarAnuncio: largos máximos (120 / 500) — el límite exacto pasa', () => {
  assert.equal(TITULO_MAX, 120);
  assert.equal(CUERPO_MAX, 500);
  assert.deepEqual(validarAnuncio({ ...base, titulo: 'a'.repeat(120) }), { ok: true });
  assert.deepEqual(validarAnuncio({ ...base, titulo: 'a'.repeat(121) }), { ok: false, error: 'titulo_largo' });
  assert.deepEqual(validarAnuncio({ ...base, cuerpo: 'b'.repeat(500) }), { ok: true });
  assert.deepEqual(validarAnuncio({ ...base, cuerpo: 'b'.repeat(501) }), { ok: false, error: 'cuerpo_largo' });
});

test('validarAnuncio: el trim manda (espacios no cuentan para el largo)', () => {
  assert.deepEqual(validarAnuncio({ ...base, titulo: `  ${'a'.repeat(120)}  ` }), { ok: true });
});

test('validarAnuncio: fechas inválidas', () => {
  assert.deepEqual(validarAnuncio({ ...base, desde: 'no-es-fecha' }), { ok: false, error: 'desde_invalida' });
  assert.deepEqual(validarAnuncio({ ...base, hasta: 'ayer a la tarde' }), { ok: false, error: 'hasta_invalida' });
  assert.deepEqual(validarAnuncio({ ...base, desde: 123 }), { ok: false, error: 'desde_invalida' });
});

test('validarAnuncio: fechas invertidas (hasta <= desde)', () => {
  assert.deepEqual(
    validarAnuncio({ ...base, desde: '2026-08-10', hasta: '2026-08-05' }),
    { ok: false, error: 'fechas_invertidas' },
  );
  // Iguales tampoco: la ventana tiene que ser real.
  assert.deepEqual(
    validarAnuncio({ ...base, desde: '2026-08-10', hasta: '2026-08-10' }),
    { ok: false, error: 'fechas_invertidas' },
  );
  assert.deepEqual(validarAnuncio({ ...base, desde: '2026-08-05', hasta: '2026-08-10' }), { ok: true });
});

test('validarAnuncio: una sola fecha es legal (ventana abierta)', () => {
  assert.deepEqual(validarAnuncio({ ...base, desde: '2026-08-05' }), { ok: true });
  assert.deepEqual(validarAnuncio({ ...base, hasta: '2026-12-31' }), { ok: true });
});

// ── estaVigente ─────────────────────────────────────────────────────────────

const now = new Date('2026-08-06T12:00:00Z');

test('estaVigente: activo sin fechas → siempre vigente', () => {
  assert.equal(estaVigente({ activo: true, desde: null, hasta: null }, now), true);
  assert.equal(estaVigente({ activo: true }, now), true);
});

test('estaVigente: dentro de la ventana', () => {
  assert.equal(estaVigente({ activo: true, desde: '2026-08-01T00:00:00Z', hasta: '2026-08-31T00:00:00Z' }, now), true);
});

test('estaVigente: antes de desde → no', () => {
  assert.equal(estaVigente({ activo: true, desde: '2026-08-10T00:00:00Z' }, now), false);
});

test('estaVigente: después de hasta → no', () => {
  assert.equal(estaVigente({ activo: true, hasta: '2026-08-01T00:00:00Z' }, now), false);
});

test('estaVigente: inactivo → nunca, aunque la ventana lo cubra', () => {
  assert.equal(estaVigente({ activo: false }, now), false);
  assert.equal(estaVigente({ activo: false, desde: '2026-08-01T00:00:00Z', hasta: '2026-08-31T00:00:00Z' }, now), false);
});

test('estaVigente: los bordes de la ventana cuentan como vigentes (<=/>=)', () => {
  assert.equal(estaVigente({ activo: true, desde: '2026-08-06T12:00:00Z' }, now), true);
  assert.equal(estaVigente({ activo: true, hasta: '2026-08-06T12:00:00Z' }, now), true);
});
