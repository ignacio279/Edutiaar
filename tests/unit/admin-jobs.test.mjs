// Unit — job nocturno de alertas (fase Observatorio y avisos): lógica pura de
// supabase/functions/admin-jobs/nocturno-logica.ts. planSnapshotAlertas decide
// cómo dejar admin_alerta igual a la salida de evaluarAlertas: upsert = TODAS
// las nuevas (idempotente por clave determinística), borrar = claves
// persistidas cuyo hecho ya se resolvió (trial extendido, colegio reactivado,
// mes nuevo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSnapshotAlertas } from '../../supabase/functions/admin-jobs/nocturno-logica.ts';

// Alerta mínima con la clave que importa (el resto del shape viaja tal cual).
const alerta = (clave, over = {}) => ({
  clave,
  tipo: 'trial_por_vencer',
  prioridad: 'alta',
  escuelaId: 'e1',
  escuelaNombre: 'Esc. Rural 12',
  titulo: 'El trial de Esc. Rural 12 vence en 2 días',
  detalle: 'Fin del trial: 2026-08-11.',
  ...over,
});

test('snapshot vacío: todo va a upsert y nada a borrar', () => {
  const nuevas = [alerta('trial:e1:2026-08-11'), alerta('inactivo:e2:2026-08')];
  const plan = planSnapshotAlertas(nuevas, []);
  assert.deepEqual(plan.upsert, nuevas);
  assert.deepEqual(plan.borrar, []);
});

test('alerta que desaparece del cálculo: su clave va a borrar', () => {
  const plan = planSnapshotAlertas([], [{ clave: 'trial:e1:2026-08-11' }]);
  assert.deepEqual(plan.upsert, []);
  assert.deepEqual(plan.borrar, ['trial:e1:2026-08-11']);
});

test('misma clave en nuevas y existentes: upsert (idempotente) y NO se borra', () => {
  const nuevas = [alerta('trial:e1:2026-08-11')];
  const plan = planSnapshotAlertas(nuevas, [{ clave: 'trial:e1:2026-08-11' }]);
  assert.deepEqual(plan.upsert, nuevas);
  assert.deepEqual(plan.borrar, []);
});

test('mezcla: se mantiene la vigente, entra la nueva y muere la resuelta', () => {
  // Vigente: la inactividad de e1 este mes. Nueva: el costo de e3.
  // Resuelta: el trial de e2 (lo extendieron → la clave vieja ya no sale).
  const nuevas = [
    alerta('inactivo:e1:2026-08', { tipo: 'colegio_inactivo', prioridad: 'media' }),
    alerta('costo:e3:2026-08', { tipo: 'costo_disparado', escuelaId: 'e3' }),
  ];
  const existentes = [
    { clave: 'inactivo:e1:2026-08' },
    { clave: 'trial:e2:2026-08-05' },
  ];
  const plan = planSnapshotAlertas(nuevas, existentes);
  assert.deepEqual(plan.upsert, nuevas, 'las dos vigentes se upsertean');
  assert.deepEqual(plan.borrar, ['trial:e2:2026-08-05'], 'solo muere la resuelta');
});

test('listas vacías → plan vacío', () => {
  assert.deepEqual(planSnapshotAlertas([], []), { upsert: [], borrar: [] });
});
