// Tests de las provincias espejo (fase Observatorio y avisos): la lista de
// jurisdicciones vive en TRES lugares — el check de la migración 0021 y los
// dos módulos espejo (Deno y web) — y no pueden divergir jamás.
// Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROVINCIAS, esProvinciaValida } from '../../supabase/functions/_shared/provincias.ts';
import { PROVINCIAS as PROVINCIAS_WEB, esProvinciaValida as esValidaWeb } from '../../web/lib/admin/provincias.ts';

test('los dos módulos espejo son BYTE-idénticos', () => {
  const deno = readFileSync(new URL('../../supabase/functions/_shared/provincias.ts', import.meta.url), 'utf8');
  const web = readFileSync(new URL('../../web/lib/admin/provincias.ts', import.meta.url), 'utf8');
  assert.equal(deno, web, 'los espejos divergieron: copiá uno sobre el otro');
});

test('son las 24 jurisdicciones, sin duplicados, ordenadas como el check de 0021', () => {
  assert.equal(PROVINCIAS.length, 24);
  assert.equal(new Set(PROVINCIAS).size, 24, 'duplicados');
  assert.deepEqual([...PROVINCIAS], [...PROVINCIAS_WEB]);
  // El SQL del check debe listar exactamente las mismas, en el mismo orden.
  const sql = readFileSync(new URL('../../supabase/migrations/0021_observatorio_avisos.sql', import.meta.url), 'utf8');
  const bloque = sql.match(/provincia in \(([\s\S]*?)\)\)/)?.[1] ?? '';
  const delSql = [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(delSql, [...PROVINCIAS], 'el check de 0021 divergió de PROVINCIAS');
});

test('esProvinciaValida: exacta, sin normalización', () => {
  assert.equal(esProvinciaValida('Neuquén'), true);
  assert.equal(esProvinciaValida('CABA'), true);
  assert.equal(esProvinciaValida('neuquén'), false, 'minúscula no vale: la UI usa select');
  assert.equal(esProvinciaValida('Marte'), false);
  assert.equal(esProvinciaValida(''), false);
  assert.equal(esProvinciaValida(null), false);
  assert.equal(esProvinciaValida(undefined), false);
  assert.equal(esProvinciaValida(3), false);
  assert.equal(esValidaWeb('Neuquén'), true, 'el espejo web valida igual');
});
