// Tests unitarios de la división pura (supabase/functions/dividir-nodos/dividir.ts).
// Sin red ni API key: el modo mock y la validación corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  partirContenido, perfilDe, mockDividir, parseDivision,
} from '../../supabase/functions/dividir-nodos/dividir.ts';

test('partirContenido: separa por comas y limpia el punto final', () => {
  const items = partirContenido('Vocales, sílabas, palabras, oraciones, lectura, cuento.');
  assert.deepEqual(items, ['Vocales', 'sílabas', 'palabras', 'oraciones', 'lectura', 'cuento']);
});

test('partirContenido: separa por líneas y viñetas, descarta vacíos', () => {
  const items = partirContenido('- Suma\n- Resta\n\n• Multiplicación\n');
  assert.deepEqual(items, ['Suma', 'Resta', 'Multiplicación']);
});

test('partirContenido: vacío → []', () => {
  assert.deepEqual(partirContenido(''), []);
  assert.deepEqual(partirContenido('   '), []);
});

test('mockDividir: arma nodos ordenados y capitalizados + perfil', () => {
  const { perfil, nodos } = mockDividir('vocales, sílabas, palabras', 'Lengua', 3);
  assert.equal(nodos.length, 3);
  assert.deepEqual(nodos.map((n) => n.orden), [0, 1, 2]);
  assert.equal(nodos[0].nombre, 'Vocales');
  assert.match(nodos[0].descripcion, /Lengua/);
  assert.match(perfil.system_prompt, /Lengua/);
  assert.match(perfil.system_prompt, /3°/);
  assert.ok(Array.isArray(perfil.criterios_eval) && perfil.criterios_eval.length > 0);
});

test('perfilDe: cae a "la materia" si viene vacío', () => {
  assert.match(perfilDe('', 1).system_prompt, /la materia/);
});

test('parseDivision: válido → normaliza nodos y completa perfil faltante', () => {
  const input = { nodos: [{ nombre: ' Sumas ' }, { nombre: 'Restas', orden: 5, descripcion: 'd' }] };
  const { perfil, nodos } = parseDivision(input, 'Mate', 2);
  assert.equal(nodos[0].nombre, 'Sumas'); // trim
  assert.equal(nodos[0].orden, 0); // default por índice
  assert.equal(nodos[1].orden, 5); // respeta el dado
  assert.match(perfil.system_prompt, /Mate/); // perfil base porque no vino
});

test('parseDivision: sin nodos → lanza', () => {
  assert.throws(() => parseDivision({ nodos: [] }, 'Mate', 2), /division_sin_nodos/);
  assert.throws(() => parseDivision({}, 'Mate', 2), /division_sin_nodos/);
});

test('parseDivision: nodo sin nombre → lanza', () => {
  assert.throws(() => parseDivision({ nodos: [{ descripcion: 'x' }] }, 'Mate', 2), /sin_nombre/);
});
