import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

test('el catálogo NAP no es legible por anon', async () => {
  // Crear datos de prueba efímeros con service_role
  const testMarker = `ZZ-test-rls-${Date.now()}`;
  let ejeId;

  try {
    // 1. Insertar un nap_eje de prueba con service_role
    const insertEjeRes = await fetch(`${URL}/rest/v1/nap_eje`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        materia: 'Lengua',
        nombre: testMarker,
        orden: 999,
      }),
    });
    assert.equal(insertEjeRes.status, 201, `No se pudo insertar nap_eje: ${insertEjeRes.status}`);
    const [ejeData] = await insertEjeRes.json();
    ejeId = ejeData.id;

    // 2. Insertar un nap_tema de prueba colgado del eje
    const insertTemaRes = await fetch(`${URL}/rest/v1/nap_tema`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        eje_id: ejeId,
        nombre: testMarker,
        grado: 1,
        orden: 999,
      }),
    });
    assert.equal(insertTemaRes.status, 201, `No se pudo insertar nap_tema: ${insertTemaRes.status}`);
    const temaData = await insertTemaRes.json();
    const temaId = temaData[0]?.id;

    // 3. Consultar como anon y verificar que devuelve 0 filas
    for (const tabla of ['nap_eje', 'nap_tema']) {
      const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      });
      const cuerpo = await r.json();
      const filas = Array.isArray(cuerpo) ? cuerpo : [];
      assert.equal(filas.length, 0, `${tabla}: anon debería ver 0 filas, vio ${filas.length}`);
    }

    // 4. Verificar que service_role SÍ ve las filas (descarta que la tabla no existe)
    const checkEjeRes = await fetch(
      `${URL}/rest/v1/nap_eje?nombre=eq.${encodeURIComponent(testMarker)}&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      },
    );
    const ejeCheck = await checkEjeRes.json();
    assert.ok(Array.isArray(ejeCheck) && ejeCheck.length > 0, 'service_role no ve el nap_eje insertado');

    const checkTemaRes = await fetch(
      `${URL}/rest/v1/nap_tema?nombre=eq.${encodeURIComponent(testMarker)}&select=id`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      },
    );
    const temaCheck = await checkTemaRes.json();
    assert.ok(Array.isArray(temaCheck) && temaCheck.length > 0, 'service_role no ve el nap_tema insertado');
  } finally {
    // 5. Limpiar: borrar las filas efímeras (pase o falle el test)
    if (ejeId) {
      await fetch(`${URL}/rest/v1/nap_eje?id=eq.${ejeId}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      });
    }
  }
});

test('admin-observatorio sigue exigiendo un admin', async () => {
  const r = await fetch(`${URL}/functions/v1/admin-observatorio`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'desempeno', materia: 'Matemática', grado: 4 }),
  });
  assert.ok(r.status === 401 || r.status === 403, `esperaba 401/403, vino ${r.status}`);
});
