// Tests ESPEJO (anti-drift): hay lógica que vive duplicada entre el codebase del
// front (web/lib) y el de las Edge Functions (supabase/functions) porque son runtimes
// separados (Next vs Deno). Estos tests importan AMBAS implementaciones y las comparan
// para que no se desincronicen sin que nadie se entere. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandaDeGrado as bandaServer, normalizarTexto as normServer, serializarPares as serServer } from '../../supabase/functions/generador-ejercicios/generar.ts';
import { bandaDeGrado as bandaFront } from '../../web/lib/practica.ts';
import { normalizarTexto as normFront, serializarPares as serFront } from '../../web/lib/correccion.ts';

test('espejo bandaDeGrado: front y server coinciden para grados 1..7', () => {
  for (let g = 1; g <= 7; g++) {
    assert.equal(bandaFront(g), bandaServer(g), `grado ${g}`);
  }
});

test('espejo normalizarTexto: front (correccion.ts) y server (generar.ts) dan lo mismo', () => {
  const casos = ['Camión.', '  Hola   Mundo  ', 'Niño', 'año', 'ANO', 'ÁÉÍÓÚ üÜ', '¡Sí, claro!', 'El PERRO corré', ''];
  for (const c of casos) {
    assert.equal(normFront(c), normServer(c), JSON.stringify(c));
  }
});

test('espejo serializarPares: front y server serializan los pares igual', () => {
  const pares = [{ izq: 'vaca', der: 'ternero' }, { izq: 'oveja', der: 'cordero' }];
  assert.equal(serFront(pares), serServer(pares));
});
