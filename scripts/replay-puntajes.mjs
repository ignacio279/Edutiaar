// Replay ÚNICO de compatibilidad (spec 2026-07-03): recalcula alumno_nodo.puntaje
// con el motor ELO-lite sobre el histórico completo del chico en el nodo. Los
// estados NO se tocan (dominado es pegajoso hacia atrás). Idempotente.
// Las filas de una misma sesión comparten created_at (insert en lote), orden
// interno no reconstruible; desempate por id hace el replay determinístico e
// idempotente, margen de error acotado (script one-off de compatibilidad).
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/replay-puntajes.mjs
import { puntajeSesion } from '../web/lib/dominio.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const filas = await (await fetch(`${URL}/rest/v1/alumno_nodo?select=id,alumno_id,nodo_id`, { headers: H })).json();
for (const an of filas) {
  const resp = await (await fetch(
    `${URL}/rest/v1/respuesta?select=correcta,reintentos,created_at,ejercicio:ejercicio_id(tipo,dificultad),sesion:sesion_id!inner(alumno_id,nodo_id)&sesion.alumno_id=eq.${an.alumno_id}&sesion.nodo_id=eq.${an.nodo_id}&order=created_at.asc,id.asc`,
    { headers: H },
  )).json();
  const cronologicas = resp.map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo ?? 'reconocer', dificultad: x.ejercicio?.dificultad ?? 1 }));
  const puntaje = puntajeSesion(0, cronologicas);
  await fetch(`${URL}/rest/v1/alumno_nodo?id=eq.${an.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ puntaje }) });
  console.log(`✓ alumno ${an.alumno_id.slice(0, 8)} nodo ${an.nodo_id.slice(0, 8)} → ${puntaje}`);
}
console.log('Listo.');
