// Tests de planes.ts (WP4 — Features por colegio, Dashboard admin v3):
// paridad byte a byte entre la copia Deno y la copia web, presets, detección
// de plan, normalización tolerante y validación. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as denoPlanes from '../../supabase/functions/admin-features/planes.ts';
import * as webPlanes from '../../web/lib/admin/planes.ts';

const { PRESETS, detectarPlan, normalizarFlags, validarFlags } = webPlanes;

const ruta = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const RUTA_DENO = ruta('../../supabase/functions/admin-features/planes.ts');
const RUTA_WEB = ruta('../../web/lib/admin/planes.ts');

test('paridad: los dos planes.ts son byte-idénticos (Deno ↔ web)', () => {
  const deno = readFileSync(RUTA_DENO, 'utf8');
  const web = readFileSync(RUTA_WEB, 'utf8');
  assert.equal(web, deno, 'los archivos divergieron: copiá uno sobre el otro');
  // Y los módulos importados exportan los mismos presets.
  assert.deepEqual(webPlanes.PRESETS, denoPlanes.PRESETS);
  assert.deepEqual(Object.keys(webPlanes).sort(), Object.keys(denoPlanes).sort());
});

test('PRESETS: shape canónico de features_default() (0018) y semántica de cada plan', () => {
  // 'docente' ES el default de la migración 0018 (features_default()).
  assert.deepEqual(PRESETS.docente, {
    sol: true,
    luna: { activa: true, alertas: true, boletines: true, chat: true },
    terra: false,
  });
  // 'basico' = solo SOL.
  assert.equal(PRESETS.basico.sol, true);
  assert.deepEqual(PRESETS.basico.luna, { activa: false, alertas: false, boletines: false, chat: false });
  assert.equal(PRESETS.basico.terra, false);
  // 'completo' = todo, con terra prendida (el toggle existe aunque TERRA no).
  assert.equal(PRESETS.completo.sol, true);
  assert.deepEqual(PRESETS.completo.luna, PRESETS.docente.luna);
  assert.equal(PRESETS.completo.terra, true);
});

test('detectarPlan: reconoce cada preset y cae a custom en cualquier otra combinación', () => {
  assert.equal(detectarPlan(PRESETS.basico), 'basico');
  assert.equal(detectarPlan(PRESETS.docente), 'docente');
  assert.equal(detectarPlan(PRESETS.completo), 'completo');
  // Copias frescas (no la misma referencia) también calzan.
  assert.equal(detectarPlan(JSON.parse(JSON.stringify(PRESETS.docente))), 'docente');
  // Custom: LUNA sin chat.
  assert.equal(detectarPlan({
    sol: true,
    luna: { activa: true, alertas: true, boletines: true, chat: false },
    terra: false,
  }), 'custom');
  // Custom: todo apagado.
  assert.equal(detectarPlan({
    sol: false,
    luna: { activa: false, alertas: false, boletines: false, chat: false },
    terra: false,
  }), 'custom');
});

test('normalizarFlags: completa claves faltantes con el default (docente)', () => {
  assert.deepEqual(normalizarFlags({}), PRESETS.docente);
  assert.deepEqual(normalizarFlags({ sol: false }), { ...PRESETS.docente, sol: false });
  assert.deepEqual(
    normalizarFlags({ luna: { chat: false } }),
    { sol: true, luna: { activa: true, alertas: true, boletines: true, chat: false }, terra: false },
  );
});

test('normalizarFlags: tolera shapes viejos (luna plana) y castea truthiness', () => {
  // Shape viejo: luna como boolean plano prende/apaga todo el bloque.
  assert.deepEqual(
    normalizarFlags({ sol: true, luna: false, terra: false }),
    { sol: true, luna: { activa: false, alertas: false, boletines: false, chat: false }, terra: false },
  );
  assert.deepEqual(normalizarFlags({ luna: true }).luna, PRESETS.docente.luna);
  // Truthiness: 1/0/'x' se castean a boolean.
  const f = normalizarFlags({ sol: 1, luna: { activa: 0, alertas: 'si', boletines: '', chat: null }, terra: 'x' });
  assert.deepEqual(f, {
    sol: true,
    luna: { activa: false, alertas: true, boletines: false, chat: true }, // null → default
    terra: true,
  });
});

test('normalizarFlags: basura total cae al default entero', () => {
  for (const basura of [null, undefined, 42, 'flags', true, [1, 2]]) {
    assert.deepEqual(normalizarFlags(basura), PRESETS.docente, `no normalizó: ${JSON.stringify(basura)}`);
  }
  // No muta los presets al completar con default.
  const antes = JSON.stringify(PRESETS);
  const f = normalizarFlags({});
  f.luna.chat = false;
  assert.equal(JSON.stringify(PRESETS), antes, 'normalizarFlags devolvió una referencia al preset');
});

test('validarFlags: acepta objetos (normalizados) y rechaza lo que no es objeto', () => {
  const ok = validarFlags({ sol: true, luna: { activa: false }, terra: false });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.flags, {
    sol: true,
    luna: { activa: false, alertas: true, boletines: true, chat: true },
    terra: false,
  });
  for (const basura of [null, undefined, 42, 'flags', true, ['sol']]) {
    const r = validarFlags(basura);
    assert.equal(r.ok, false, `aceptó basura: ${JSON.stringify(basura)}`);
    assert.equal(r.error, 'flags_invalidos');
  }
});
