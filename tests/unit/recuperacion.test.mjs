// Unit — lógica pura de la pantalla de contraseña nueva (`/nueva-contrasena`),
// la que abre el link de invitación de una maestra. Todo lo que se testea acá
// es parseo del fragmento (#) que devuelve Supabase Auth y validación del form:
// sin DOM, sin red. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RUTA_NUEVA_CONTRASENA, RUTA_DESTINO, destinoDe, rutaDestino,
  tokensDelFragmento, errorDelFragmento, validarNuevaPassword,
  LARGO_MINIMO_PASSWORD,
} from '../../web/lib/recuperacion.ts';

// El hash real que devuelve `/auth/v1/verify?type=recovery` (capturado en vivo,
// tokens recortados). Ojo con `sb=`: viene vacío y no molesta.
const HASH_OK =
  '#access_token=eyJhbGciOiJFUzI1NiJ9.abc.def&expires_at=1787075825&expires_in=3600'
  + '&refresh_token=nog5acfc3h7b&sb=&token_type=bearer&type=recovery';

// El hash de un link vencido o ya usado (Supabase no tira 400: redirige igual).
const HASH_VENCIDO =
  '#error=access_denied&error_code=otp_expired'
  + '&error_description=Email+link+is+invalid+or+has+expired';

test('tokensDelFragmento saca los dos tokens del hash real de recovery', () => {
  const t = tokensDelFragmento(HASH_OK);
  assert.ok(t);
  assert.equal(t.access_token, 'eyJhbGciOiJFUzI1NiJ9.abc.def');
  assert.equal(t.refresh_token, 'nog5acfc3h7b');
});

test('tokensDelFragmento tolera el hash sin "#" y con espacios', () => {
  const t = tokensDelFragmento(' access_token=aa&refresh_token=bb&type=recovery ');
  assert.deepEqual(t, { access_token: 'aa', refresh_token: 'bb' });
});

test('tokensDelFragmento devuelve null cuando falta algo', () => {
  assert.equal(tokensDelFragmento(null), null);
  assert.equal(tokensDelFragmento(''), null);
  assert.equal(tokensDelFragmento('#'), null);
  assert.equal(tokensDelFragmento('#access_token=aa'), null, 'sin refresh no sirve para setSession');
  assert.equal(tokensDelFragmento('#refresh_token=bb'), null);
  assert.equal(tokensDelFragmento(HASH_VENCIDO), null);
  assert.equal(tokensDelFragmento(42), null);
});

test('tokensDelFragmento desarma el percent-encoding', () => {
  const t = tokensDelFragmento('#access_token=a%2Bb&refresh_token=c%2Fd');
  assert.deepEqual(t, { access_token: 'a+b', refresh_token: 'c/d' });
});

test('errorDelFragmento explica el link vencido en castellano, sin jerga', () => {
  const msg = errorDelFragmento(HASH_VENCIDO);
  assert.ok(msg);
  assert.match(msg, /venci|us/i);
  assert.doesNotMatch(msg, /otp|access_denied|token/i);
});

test('errorDelFragmento no inventa error cuando el hash está bien', () => {
  assert.equal(errorDelFragmento(HASH_OK), null);
  assert.equal(errorDelFragmento(''), null);
  assert.equal(errorDelFragmento(null), null);
});

test('errorDelFragmento cae a un mensaje genérico ante un error desconocido', () => {
  const msg = errorDelFragmento('#error=server_error&error_code=unexpected_failure');
  assert.ok(msg);
  assert.doesNotMatch(msg, /server_error|unexpected_failure/);
});

test('destinoDe acepta solo los tres destinos conocidos y cae en docente', () => {
  assert.equal(destinoDe('docente'), 'docente');
  assert.equal(destinoDe('admin'), 'admin');
  assert.equal(destinoDe('institucion'), 'institucion');
  assert.equal(destinoDe(null), 'docente');
  assert.equal(destinoDe(''), 'docente');
  assert.equal(destinoDe('otro'), 'docente');
  assert.equal(destinoDe('https://malo.example'), 'docente');
});

test('rutaDestino nunca devuelve una URL externa (open redirect)', () => {
  for (const v of ['//malo.example', 'https://malo.example', 'javascript:alert(1)', 'docente']) {
    const r = rutaDestino(v);
    assert.ok(r.startsWith('/'), r);
    assert.ok(!r.startsWith('//'), r);
    assert.ok(Object.values(RUTA_DESTINO).includes(r), r);
  }
});

test('validarNuevaPassword exige largo mínimo y que las dos coincidan', () => {
  assert.equal(LARGO_MINIMO_PASSWORD, 6, 'es el password_min_length del proyecto en Supabase');

  const ok = validarNuevaPassword('miclave1', 'miclave1');
  assert.equal(ok.ok, true);
  assert.equal(ok.password, 'miclave1');

  const corta = validarNuevaPassword('abc', 'abc');
  assert.equal(corta.ok, false);
  assert.match(corta.error, /6/);

  const distinta = validarNuevaPassword('miclave1', 'miclave2');
  assert.equal(distinta.ok, false);
  assert.match(distinta.error, /coincid|igual/i);

  assert.equal(validarNuevaPassword('', '').ok, false);
  assert.equal(validarNuevaPassword(null, null).ok, false);
});

test('validarNuevaPassword NO recorta la contraseña (un espacio es un carácter)', () => {
  const r = validarNuevaPassword(' clave1 ', ' clave1 ');
  assert.equal(r.ok, true);
  assert.equal(r.password, ' clave1 ');
});

// ── Paridad con las Edge Functions ──────────────────────────────────────────
// El `redirectTo` de los 5 generateLink sale de `_shared/invitacion.ts`. Si esa
// ruta y la del front se separan, el link vuelve a caer en una página que no
// existe — que es exactamente el bug que arreglamos.

test('la ruta del front y la del _shared de las fns son la misma', async () => {
  const shared = await import('../../supabase/functions/_shared/invitacion.ts');
  assert.equal(shared.RUTA_NUEVA_CONTRASENA, RUTA_NUEVA_CONTRASENA);
});

test('la ruta existe como página en el App Router', () => {
  const page = `web/app${RUTA_NUEVA_CONTRASENA}/page.tsx`;
  const src = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
  assert.match(src, /updateUser/, `${page} tiene que cambiar la contraseña de verdad`);
});

test('linkRecuperacion arma el destino con el origen y el rol', async () => {
  const { linkRecuperacion } = await import('../../supabase/functions/_shared/invitacion.ts');
  assert.equal(
    linkRecuperacion('https://www.edutia.ar', 'docente'),
    'https://www.edutia.ar/nueva-contrasena?d=docente',
  );
  assert.equal(
    linkRecuperacion('https://www.edutia.ar/', 'admin'),
    'https://www.edutia.ar/nueva-contrasena?d=admin',
    'la barra de más del origen no puede duplicarse',
  );
});
