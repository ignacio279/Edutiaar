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
const { postFn, ERR_RED, ERR_SIN_RESPUESTA } = await import('../../web/lib/edge.ts');

const conFetchFalso = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
};

// El navegador reporta el estado de la red por `navigator.onLine`. En Node no
// existe, así que se simula para poder testear las dos ramas.
const conRed = async (online, fn) => {
  const previo = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true });
  try { return await fn(); } finally {
    if (previo === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: previo, configurable: true });
  }
};

const revienta = () => Promise.reject(new TypeError('Failed to fetch'));

test('postFn: sin internet NO lanza, y lo dice: sin_conexion', async () => {
  const r = await conRed(false, () => conFetchFalso(
    revienta, () => postFn('gestion-transferencias', { accion: 'listar' }),
  ));
  assert.equal(r.ok, false);
  assert.equal(r.data.error, ERR_RED);
  // status 0 = ni siquiera hubo respuesta. El caller lo distingue de un 4xx.
  assert.equal(r.status, 0);
});

test('postFn: con internet, una función sin deployar NO se disfraza de "revisá tu conexión"', async () => {
  // Supabase responde 404 sin headers CORS → el navegador tira el mismo
  // TypeError que si no hubiera red. Lo único que los separa es navigator.onLine.
  const r = await conRed(true, () => conFetchFalso(
    revienta, () => postFn('funcion-que-no-existe', {}),
  ));
  assert.equal(r.ok, false);
  assert.equal(r.data.error, ERR_SIN_RESPUESTA,
    'con conexión buena, mandar a revisar el cable es mandar a buscar un problema inexistente');
});

test('los dos códigos de red tienen copy en TODOS los mapas que los muestran', async () => {
  const mapas = await Promise.all([
    import('../../web/lib/admin/errores.ts').then((m) => ['ERRS_ADMIN', m.ERRS_ADMIN]),
    import('../../web/lib/admin/errores.ts').then((m) => ['ERRS_RED_ADMIN', m.ERRS_RED_ADMIN]),
    import('../../web/lib/transferencias.ts').then((m) => ['ERRS_TRANSFERENCIA', m.ERRS_TRANSFERENCIA]),
    import('../../web/lib/admin/licencias.ts').then((m) => ['ERRS_LICENCIAS', m.ERRS_LICENCIAS]),
    import('../../web/lib/arco.ts').then((m) => ['ERRS_ARCO', m.ERRS_ARCO]),
  ]);
  for (const [nombre, mapa] of mapas) {
    for (const codigo of [ERR_RED, ERR_SIN_RESPUESTA]) {
      assert.ok(mapa[codigo], `${nombre} no tiene copy para ${codigo}: el usuario vería el código crudo`);
    }
  }
  // La pantalla que ve una FAMILIA no puede hablar de deploys ni de servidores.
  const { ERRS_TRANSFERENCIA } = await import('../../web/lib/transferencias.ts');
  for (const jerga of ['Edge Function', 'deploy', 'servidor']) {
    assert.ok(!ERRS_TRANSFERENCIA[ERR_SIN_RESPUESTA].includes(jerga),
      `"${jerga}" no va en el copy que lee una familia en /transferir`);
  }
});

test('un error del server pasa derecho, sin disfrazarse de un problema de red', async () => {
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
