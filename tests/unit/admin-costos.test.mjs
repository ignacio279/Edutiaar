// Tests de WP6 — Costos y salud técnica (Dashboard admin v3): precios puros,
// contrato registrarUso, agregación de admin-costos y helpers de la UI.
// Correr: npm test (o node --test tests/unit/admin-costos.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRECIOS, calcularCostoUsd } from '../../supabase/functions/_shared/precios.ts';
import { registrarUso } from '../../supabase/functions/_shared/uso.ts';
import {
  rangoValido, totalizar, agruparUso, percentil, tasaError, erroresConsecutivos,
  metricasSalud, saludPorFuncion, serieSemanal, SIN_COLEGIO,
} from '../../supabase/functions/admin-costos/agregar.ts';
import {
  fmtUsd, fmtTokens, fmtMs, porcentaje, colorSalud, RANGOS, SIN_DATOS_COPY,
} from '../../web/lib/admin/costos.ts';

// ── precios.ts ──────────────────────────────────────────────────────────────

test('PRECIOS cubre los dos modelos en uso con entrada y salida positivas', () => {
  for (const modelo of ['claude-haiku-4-5', 'claude-sonnet-4-6']) {
    assert.ok(PRECIOS[modelo], `falta ${modelo}`);
    assert.ok(PRECIOS[modelo].entrada > 0 && PRECIOS[modelo].salida > 0);
  }
});

test('calcularCostoUsd: haiku y sonnet a precio por millón', () => {
  // haiku: $1/Mtok entrada, $5/Mtok salida
  assert.equal(calcularCostoUsd('claude-haiku-4-5', 1000, 2000), 0.011);
  // sonnet: $3/Mtok entrada, $15/Mtok salida
  assert.equal(calcularCostoUsd('claude-sonnet-4-6', 10000, 2000), 0.06);
  assert.equal(calcularCostoUsd('claude-sonnet-4-6', 1, 1), 0.000018);
});

test('calcularCostoUsd: modelo desconocido → 0', () => {
  assert.equal(calcularCostoUsd('gpt-9-turbo', 100000, 100000), 0);
  assert.equal(calcularCostoUsd('', 1000, 1000), 0);
});

test('calcularCostoUsd: redondea a 6 decimales y banca tokens raros', () => {
  // (123456·1 + 654321·5)/1e6 = 3.395061 — el float intermedio trae ruido.
  assert.equal(calcularCostoUsd('claude-haiku-4-5', 123456, 654321), 3.395061);
  assert.equal(calcularCostoUsd('claude-haiku-4-5', -50, NaN), 0);
});

// ── uso.ts (contrato registrarUso con un cliente falso) ─────────────────────

test('registrarUso: arma la fila de uso_api con costo calculado y defaults', () => {
  let tabla = null;
  let fila = null;
  const sb = {
    from: (t) => ({
      insert: (row) => {
        tabla = t;
        fila = row;
        return { then: (cb) => cb({ error: null }) };
      },
    }),
  };
  registrarUso(sb, {
    funcion: 'luna-chat',
    modelo: 'claude-haiku-4-5',
    usage: { input_tokens: 1000, output_tokens: 2000 },
    latencia_ms: 850,
    ok: true,
  });
  assert.equal(tabla, 'uso_api');
  assert.equal(fila.funcion, 'luna-chat');
  assert.equal(fila.costo_usd, 0.011);
  assert.equal(fila.tokens_entrada, 1000);
  assert.equal(fila.tokens_salida, 2000);
  assert.equal(fila.escuela_id, null); // opcional → null explícito
  assert.equal(fila.perfil_id, null);
  assert.equal(fila.error_codigo, null);
  assert.equal(fila.ok, true);
});

test('registrarUso: error sin usage ni modelo → tokens 0, costo 0, y no explota', () => {
  let fila = null;
  const sb = {
    from: () => ({
      insert: (row) => {
        fila = row;
        return { then: (cb) => cb({ error: { message: 'se cayó la DB' } }) }; // fire-and-forget: solo loguea
      },
    }),
  };
  registrarUso(sb, { funcion: 'sol', ok: false, error_codigo: 'claude_529' });
  assert.equal(fila.tokens_entrada, 0);
  assert.equal(fila.costo_usd, 0);
  assert.equal(fila.modelo, null);
  assert.equal(fila.ok, false);
  assert.equal(fila.error_codigo, 'claude_529');
});

// ── agregar.ts ──────────────────────────────────────────────────────────────

test('rangoValido: default 30, tope 90, piso 1, basura → default', () => {
  assert.equal(rangoValido(undefined), 30);
  assert.equal(rangoValido(7), 7);
  assert.equal(rangoValido(90), 90);
  assert.equal(rangoValido(999), 90);
  assert.equal(rangoValido(0), 1);
  assert.equal(rangoValido(-5), 1);
  assert.equal(rangoValido('15'), 30);
  assert.equal(rangoValido(NaN), 30);
});

test('percentil: dataset conocido, n=1 y vacío', () => {
  const diez = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  assert.equal(percentil(diez, 50), 500); // nearest-rank: ceil(5)-1 → 5º valor
  assert.equal(percentil(diez, 95), 1000);
  assert.equal(percentil([10, 20, 30, 40], 50), 20);
  assert.equal(percentil([42], 50), 42);
  assert.equal(percentil([42], 95), 42);
  assert.equal(percentil([], 50), 0);
  assert.equal(percentil([300, 100, 200], 50), 200); // no exige orden de entrada
});

test('tasaError: fracción sobre el total, vacío → 0', () => {
  assert.equal(tasaError([]), 0);
  assert.equal(tasaError([{ ok: true }, { ok: true }]), 0);
  assert.equal(tasaError([{ ok: true }, { ok: false }, { ok: true }, { ok: false }]), 0.5);
  assert.equal(tasaError([{ ok: false }, { ok: true }, { ok: true }]), 0.3333);
});

test('erroresConsecutivos: racha en el tope vs cortada por un éxito', () => {
  assert.equal(erroresConsecutivos([false, false, false, true, false]), 3);
  assert.equal(erroresConsecutivos([true, false, false]), 0); // el último éxito corta la racha
  assert.equal(erroresConsecutivos([false, false]), 2);
  assert.equal(erroresConsecutivos([]), 0);
});

const fila = (extra = {}) => ({
  escuela_id: 'esc-a', funcion: 'sol', costo_usd: 0.01, ok: true,
  latencia_ms: 500, tokens_entrada: 100, tokens_salida: 50, ...extra,
});

test('agruparUso: por colegio y por función, null → sin_colegio, orden por costo desc', () => {
  const filas = [
    fila({ escuela_id: 'esc-a', funcion: 'sol', costo_usd: 0.01 }),
    fila({ escuela_id: 'esc-a', funcion: 'luna-chat', costo_usd: 0.05, ok: false }),
    fila({ escuela_id: 'esc-b', funcion: 'sol', costo_usd: 0.5 }),
    fila({ escuela_id: null, funcion: 'sol', costo_usd: 0.002 }),
  ];
  const porColegio = agruparUso(filas, 'escuela_id');
  assert.deepEqual(porColegio.map((g) => g.clave), ['esc-b', 'esc-a', SIN_COLEGIO]);
  const escA = porColegio.find((g) => g.clave === 'esc-a');
  assert.equal(escA.costo_usd, 0.06);
  assert.equal(escA.llamadas, 2);
  assert.equal(escA.errores, 1);
  assert.equal(escA.tokens_entrada, 200);
  assert.equal(escA.tokens_salida, 100);

  const porFuncion = agruparUso(filas, 'funcion');
  assert.deepEqual(porFuncion.map((g) => g.clave), ['sol', 'luna-chat']);
  assert.equal(porFuncion[0].costo_usd, 0.512);
  assert.equal(porFuncion[0].llamadas, 3);
});

test('totalizar: suma redondeada a 6 decimales, vacío → todo cero', () => {
  const t = totalizar([fila({ costo_usd: 0.1 }), fila({ costo_usd: 0.2, ok: false })]);
  assert.equal(t.costo_usd, 0.3); // 0.1+0.2 en float da 0.30000000000000004
  assert.equal(t.llamadas, 2);
  assert.equal(t.errores, 1);
  assert.deepEqual(totalizar([]), { costo_usd: 0, llamadas: 0, tokens_entrada: 0, tokens_salida: 0, errores: 0 });
});

test('saludPorFuncion: percentiles, tasa y racha por función (orden desc por created_at)', () => {
  // "sol" viene fallando AHORA (2 errores al tope); "luna-chat" está sana.
  const filas = [
    fila({ funcion: 'sol', ok: false, latencia_ms: 900 }),
    fila({ funcion: 'luna-chat', ok: true, latencia_ms: 300 }),
    fila({ funcion: 'sol', ok: false, latencia_ms: 800 }),
    fila({ funcion: 'sol', ok: true, latencia_ms: 100 }),
    fila({ funcion: 'sol', ok: false, latencia_ms: null }), // sin latencia: no entra al percentil
  ];
  const salud = saludPorFuncion(filas);
  assert.deepEqual(salud.map((s) => s.funcion), ['sol', 'luna-chat']); // más llamadas primero
  const sol = salud[0];
  assert.equal(sol.llamadas, 4);
  assert.equal(sol.tasa_error, 0.75);
  assert.equal(sol.errores_consecutivos, 2); // la racha corta en el éxito del medio
  assert.equal(sol.p50, 800); // sobre [100, 800, 900]
  assert.equal(sol.p95, 900);
  const luna = salud[1];
  assert.equal(luna.errores_consecutivos, 0);
  assert.equal(luna.tasa_error, 0);
});

test('metricasSalud: vacío → todo cero (uso_api sin datos)', () => {
  assert.deepEqual(metricasSalud([]), { llamadas: 0, tasa_error: 0, p50: 0, p95: 0, errores_consecutivos: 0 });
});

test('serieSemanal: cubos de 7 días, del más viejo al más nuevo', () => {
  const ahora = Date.parse('2026-08-06T12:00:00Z');
  const DIA = 86400000;
  const filas = [
    fila({ costo_usd: 0.1, created_at: new Date(ahora - 1 * DIA).toISOString() }), // semana actual
    fila({ costo_usd: 0.2, created_at: new Date(ahora - 2 * DIA).toISOString() }), // semana actual
    fila({ costo_usd: 0.4, created_at: new Date(ahora - 8 * DIA).toISOString() }), // semana anterior
    fila({ costo_usd: 9.9, created_at: new Date(ahora - 40 * DIA).toISOString() }), // fuera del rango 30
  ];
  const serie = serieSemanal(filas, 30, ahora);
  assert.equal(serie.length, 5); // ceil(30/7)
  const actual = serie[serie.length - 1];
  assert.equal(actual.llamadas, 2);
  assert.equal(actual.costo_usd, 0.3);
  assert.equal(serie[serie.length - 2].costo_usd, 0.4);
  assert.equal(serie[0].llamadas, 0); // la fila de 40 días quedó afuera
  assert.equal(serie.reduce((acc, s) => acc + s.llamadas, 0), 3);
  assert.match(actual.hasta, /^2026-08-06$/);
  // rango 7 → un solo cubo
  assert.equal(serieSemanal(filas, 7, ahora).length, 1);
});

// ── web/lib/admin/costos.ts (helpers de la UI) ──────────────────────────────

test('fmtUsd: 2 decimales desde $1, 4 para montos chicos, 0 → $ 0.00', () => {
  assert.equal(fmtUsd(0), '$ 0.00');
  assert.equal(fmtUsd(12.3456), '$ 12.35');
  assert.equal(fmtUsd(1), '$ 1.00');
  assert.equal(fmtUsd(0.0042), '$ 0.0042');
  assert.equal(fmtUsd(0.5), '$ 0.5000');
  assert.equal(fmtUsd(NaN), '$ 0.00');
});

test('fmtTokens: 850 → "850", 1234 → "1.2k", 3.4M, bordes', () => {
  assert.equal(fmtTokens(0), '0');
  assert.equal(fmtTokens(850), '850');
  assert.equal(fmtTokens(1234), '1.2k');
  assert.equal(fmtTokens(12000), '12k');
  assert.equal(fmtTokens(3400000), '3.4M');
  assert.equal(fmtTokens(-5), '0');
});

test('fmtMs: ms cortos, segundos largos, vacío → —', () => {
  assert.equal(fmtMs(null), '—');
  assert.equal(fmtMs(undefined), '—');
  assert.equal(fmtMs(0), '—');
  assert.equal(fmtMs(850), '850 ms');
  assert.equal(fmtMs(2340), '2.3 s');
});

test('porcentaje: 1 decimal, denominador 0 → 0', () => {
  assert.equal(porcentaje(3, 200), 1.5);
  assert.equal(porcentaje(1, 3), 33.3);
  assert.equal(porcentaje(0, 100), 0);
  assert.equal(porcentaje(5, 0), 0);
});

test('colorSalud: verde <2%, naranja <10%, rojo el resto (fracciones)', () => {
  assert.equal(colorSalud(0), 'ok');
  assert.equal(colorSalud(0.019), 'ok');
  assert.equal(colorSalud(0.02), 'aviso');
  assert.equal(colorSalud(0.09), 'aviso');
  assert.equal(colorSalud(0.1), 'rojo');
  assert.equal(colorSalud(0.5), 'rojo');
});

test('RANGOS y copy del vacío existen como los usan las páginas', () => {
  assert.deepEqual([...RANGOS], [7, 30, 90]);
  assert.ok(SIN_DATOS_COPY.length > 20);
});
