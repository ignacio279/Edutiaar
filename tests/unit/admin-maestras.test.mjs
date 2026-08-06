// Unit — validadores puros de admin-maestras (alta de maestras desde el admin).
// La fuente de verdad de la validación es la Edge Function; estos helpers la
// blindan. Node strippa los tipos del .ts, sin build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emailValido,
  emailNormalizado,
  nombreValido,
  validarCrearMaestra,
  generarPasswordTemporal,
  PALABRAS,
} from '../../supabase/functions/admin-maestras/validar.ts';

test('emailValido: acepta emails razonables', () => {
  assert.equal(emailValido('marta@escuela.edu.ar'), true);
  assert.equal(emailValido('seño.marta+edutia@gmail.com'), true);
  assert.equal(emailValido('  con-espacios@borde.com  '), true, 'trimea antes de validar');
});

test('emailValido: rechaza lo que no es email', () => {
  assert.equal(emailValido('sin-arroba.com'), false);
  assert.equal(emailValido('sin@dominio'), false, 'sin punto en el dominio');
  assert.equal(emailValido('dos espacios@x.com'), false);
  assert.equal(emailValido('@x.com'), false);
  assert.equal(emailValido('a@.com'), false, 'dominio sin nombre antes del punto');
  assert.equal(emailValido(''), false);
  assert.equal(emailValido(null), false);
  assert.equal(emailValido(42), false);
});

test('emailNormalizado: trim + lowercase', () => {
  assert.equal(emailNormalizado('  Marta@Escuela.EDU.ar '), 'marta@escuela.edu.ar');
  assert.equal(emailNormalizado(undefined), '');
});

test('nombreValido: no vacío', () => {
  assert.equal(nombreValido('Marta'), true);
  assert.equal(nombreValido('   '), false);
  assert.equal(nombreValido(''), false);
  assert.equal(nombreValido(7), false);
});

test('validarCrearMaestra: cada campo corta con su código', () => {
  const base = { email: 'm@x.com', nombre: 'Marta', escuela_id: 'uuid-cualquiera' };
  assert.deepEqual(validarCrearMaestra(base), { ok: true });
  assert.deepEqual(validarCrearMaestra({ ...base, email: 'nope' }), { ok: false, error: 'email_invalido' });
  assert.deepEqual(validarCrearMaestra({ ...base, nombre: '  ' }), { ok: false, error: 'nombre_vacio' });
  assert.deepEqual(validarCrearMaestra({ ...base, escuela_id: undefined }), { ok: false, error: 'escuela_requerida' });
  assert.deepEqual(validarCrearMaestra({}), { ok: false, error: 'email_invalido' }, 'el email se valida primero');
});

test('generarPasswordTemporal: determinística con azar inyectado', () => {
  // azar(max) siempre 0 → primera palabra tres veces + "000".
  const p = generarPasswordTemporal(() => 0);
  assert.equal(p, `${PALABRAS[0]}-${PALABRAS[0]}-${PALABRAS[0]}-000`);
  // azar que devuelve max-1 → última palabra + "999".
  const q = generarPasswordTemporal((max) => max - 1);
  const ultima = PALABRAS[PALABRAS.length - 1];
  assert.equal(q, `${ultima}-${ultima}-${ultima}-999`);
});

test('generarPasswordTemporal: formato, charset y longitud (default cripto)', () => {
  for (let i = 0; i < 50; i++) {
    const p = generarPasswordTemporal();
    assert.match(p, /^[a-z]+-[a-z]+-[a-z]+-\d{3}$/, `formato palabra-palabra-palabra-ddd (${p})`);
    assert.ok(p.length >= 12, `larga de verdad (${p})`);
    const partes = p.split('-');
    for (const w of partes.slice(0, 3)) assert.ok(PALABRAS.includes(w), `palabra del set (${w})`);
  }
});

test('generarPasswordTemporal: el default no repite siempre lo mismo', () => {
  const set = new Set(Array.from({ length: 20 }, () => generarPasswordTemporal()));
  assert.ok(set.size > 1, 'con azar real salen passwords distintas');
});
