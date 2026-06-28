// Unit — validadores puros de gestion-alumnos (crear aulas/alumnos desde la docente).
// La fuente de verdad de la validación es la Edge Function; estos helpers la blindan.
// Node strippa los tipos del .ts, sin build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pinValido,
  AVATARES,
  avatarValido,
  codigoNormalizado,
  validarCrearAula,
  validarCrearAlumno,
} from '../../supabase/functions/gestion-alumnos/validar.ts';

test('pinValido: exactamente 4 dígitos', () => {
  assert.equal(pinValido('1234'), true);
  assert.equal(pinValido('0007'), true);
  assert.equal(pinValido('12'), false);
  assert.equal(pinValido('12345'), false);
  assert.equal(pinValido('abcd'), false);
  assert.equal(pinValido('12 4'), false);
  assert.equal(pinValido(''), false);
});

test('AVATARES es el set de animales de art.ts', () => {
  assert.deepEqual(AVATARES, ['fox', 'owl', 'turtle', 'cat', 'sheep']);
});

test('avatarValido: solo claves del set', () => {
  assert.equal(avatarValido('fox'), true);
  assert.equal(avatarValido('sheep'), true);
  assert.equal(avatarValido('dragon'), false);
  assert.equal(avatarValido(''), false);
});

test('codigoNormalizado: trim + mayúsculas', () => {
  assert.equal(codigoNormalizado('  aula1 '), 'AULA1');
  assert.equal(codigoNormalizado('Sol-3'), 'SOL-3');
});

test('validarCrearAula: acepta input válido', () => {
  assert.deepEqual(validarCrearAula({ nombre: 'Sala roja', codigo: 'ROJA', secreto: 'luna', grado: 3 }), { ok: true });
  // grado opcional
  assert.deepEqual(validarCrearAula({ nombre: 'Sala roja', codigo: 'ROJA', secreto: 'luna' }), { ok: true });
});

test('validarCrearAula: rechaza faltantes', () => {
  assert.equal(validarCrearAula({ nombre: '', codigo: 'X', secreto: 'y' }).ok, false);
  assert.equal(validarCrearAula({ nombre: 'A', codigo: '  ', secreto: 'y' }).ok, false);
  assert.equal(validarCrearAula({ nombre: 'A', codigo: 'X', secreto: '' }).ok, false);
  assert.equal(validarCrearAula({ nombre: 'A', codigo: 'X', secreto: 'y', grado: 9 }).ok, false);
});

test('validarCrearAlumno: acepta input válido', () => {
  assert.deepEqual(
    validarCrearAlumno({ nombre: 'Mateo', avatar: 'fox', grado: 3, pin: '1111', aula_id: 'a-1' }),
    { ok: true },
  );
});

test('validarCrearAlumno: rechaza faltantes / inválidos', () => {
  assert.equal(validarCrearAlumno({ nombre: '', avatar: 'fox', grado: 3, pin: '1111', aula_id: 'a' }).ok, false);
  assert.equal(validarCrearAlumno({ nombre: 'M', avatar: 'dragon', grado: 3, pin: '1111', aula_id: 'a' }).ok, false);
  assert.equal(validarCrearAlumno({ nombre: 'M', avatar: 'fox', grado: 3, pin: '12', aula_id: 'a' }).ok, false);
  assert.equal(validarCrearAlumno({ nombre: 'M', avatar: 'fox', grado: 0, pin: '1111', aula_id: 'a' }).ok, false);
  assert.equal(validarCrearAlumno({ nombre: 'M', avatar: 'fox', grado: 3, pin: '1111', aula_id: '' }).ok, false);
});

test('los validadores devuelven un error legible cuando fallan', () => {
  const r = validarCrearAlumno({ nombre: '', avatar: 'fox', grado: 3, pin: '1111', aula_id: 'a' });
  assert.equal(r.ok, false);
  assert.ok(typeof r.error === 'string' && r.error.length > 0);
});
