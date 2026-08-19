// Tests de web/lib/admin/login.ts — normalización del campo "Usuario" del
// panel admin a un email de Auth. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emailDeUsuario, DOMINIO_ADMIN } from '../../web/lib/admin/login.ts';

test('un usuario corto se completa con el dominio de la casa', () => {
  assert.equal(emailDeUsuario('admin'), 'admin@edutia.ar');
  assert.equal(emailDeUsuario('jorge'), 'jorge@edutia.ar');
  assert.equal(DOMINIO_ADMIN, 'edutia.ar');
});

test('trim y minúsculas: lo que se tipea en el celular igual entra', () => {
  assert.equal(emailDeUsuario('  Admin '), 'admin@edutia.ar');
  assert.equal(emailDeUsuario('ADMIN'), 'admin@edutia.ar');
});

test('un email completo pasa tal cual, sin forzarle el dominio propio', () => {
  assert.equal(emailDeUsuario('jorge@edutia.ar'), 'jorge@edutia.ar');
  assert.equal(emailDeUsuario('ivargasfernandez@udesa.edu.ar'), 'ivargasfernandez@udesa.edu.ar');
  assert.equal(emailDeUsuario(' Ana@Otra.COM '), 'ana@otra.com');
});

test('vacío o basura devuelve "" para cortar antes de pegarle a Auth', () => {
  assert.equal(emailDeUsuario(''), '');
  assert.equal(emailDeUsuario('   '), '');
  assert.equal(emailDeUsuario(undefined), '');
  assert.equal(emailDeUsuario(null), '');
  assert.equal(emailDeUsuario('@edutia.ar'), '');
  assert.equal(emailDeUsuario('admin@'), '');
});

test('la pantalla usa el helper y no arma el email a mano', () => {
  const pagina = readFileSync(fileURLToPath(new URL('../../web/app/admin/login/page.tsx', import.meta.url)), 'utf8');
  assert.match(pagina, /emailDeUsuario/, 'el login tiene que normalizar con el helper');
  assert.doesNotMatch(pagina, /['"`]@edutia\.ar['"`]/, 'el dominio vive en login.ts, no hardcodeado en la pantalla');
  // Ninguna contraseña puede vivir en el bundle del cliente.
  assert.doesNotMatch(pagina, /password\s*[:=]\s*['"`][^'"`]/, 'no puede haber una contraseña literal en la pantalla');
});
