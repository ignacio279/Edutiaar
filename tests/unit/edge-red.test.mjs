// Robustez de red del cliente de Edge Functions (web/lib/edge.ts).
//
// Por qué existe este archivo: EDUTIA corre en escuelas rurales con conexión
// mala, y la pantalla de autorización de un pase la abre una familia desde el
// celular. Un `fetch` que lanza le tira un error de runtime encima a una
// maestra o a una madre. `postFn` convierte eso en un error normal, del mismo
// tipo que los que devuelve el server.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// edge.ts lee las env NEXT_PUBLIC_* al importarse. En el browser Next las
// inlinea en build; acá hay que ponerlas ANTES del import, por eso es dinámico.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-prueba';
const { postFn, ERR_RED } = await import('../../web/lib/edge.ts');

const conFetchFalso = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
};

test('postFn: la red caída NO lanza, vuelve como sin_conexion', async () => {
  const r = await conFetchFalso(
    () => Promise.reject(new TypeError('Failed to fetch')),
    () => postFn('gestion-transferencias', { accion: 'listar' }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.data.error, ERR_RED);
  // status 0 = ni siquiera hubo respuesta. El caller lo distingue de un 4xx.
  assert.equal(r.status, 0);
});

test('postFn: una función sin deployar tampoco lanza', async () => {
  // Supabase responde 404 sin headers CORS → el navegador tira TypeError.
  const r = await conFetchFalso(
    () => Promise.reject(new TypeError('NetworkError when attempting to fetch resource.')),
    () => postFn('funcion-que-no-existe', {}),
  );
  assert.equal(r.ok, false);
  assert.equal(r.data.error, ERR_RED);
});

test('postFn: un error del server pasa derecho, sin disfrazarse de sin_conexion', async () => {
  const r = await conFetchFalso(
    () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: 'solo_admin' }) }),
    () => postFn('gestion-transferencias', { accion: 'listar' }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.data.error, 'solo_admin', 'un 403 tiene que llegar como 403');
});

test('postFn: respuesta OK con cuerpo roto no lanza', async () => {
  const r = await conFetchFalso(
    () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('unexpected end of JSON')) }),
    () => postFn('gestion-transferencias', { accion: 'listar' }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, {}, 'cuerpo vacío, no una excepción');
});

test('postFn: manda el access_token cuando se lo pasan, y la anon key si no', async () => {
  const vistos = [];
  const espia = (_url, init) => {
    vistos.push(init.headers.Authorization);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  };
  await conFetchFalso(espia, async () => {
    await postFn('institucion-panel', {}, { token: 'jwt-de-la-sesion' });
    await postFn('transferencia-confirmar', {});
  });
  assert.equal(vistos[0], 'Bearer jwt-de-la-sesion');
  assert.ok(vistos[1].startsWith('Bearer '), 'sin token va la anon key, no undefined');
  assert.ok(!vistos[1].includes('undefined'));
});
