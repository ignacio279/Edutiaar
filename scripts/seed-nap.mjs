// scripts/seed-nap.mjs — carga el catálogo NAP en la base. Idempotente:
// upsert por (materia, nombre) en nap_eje y (eje_id, nombre, grado) en
// nap_tema. También sube texto_oficial y fuente (migración 0029) — son la
// cita textual del documento y su URL+página, la fuente de autoridad del
// observatorio.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-nap.mjs
import { CATALOGO_NAP } from '../supabase/functions/_shared/nap.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

for (const eje of CATALOGO_NAP) {
  const r = await fetch(`${URL}/rest/v1/nap_eje?on_conflict=materia,nombre`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ materia: eje.materia, nombre: eje.nombre, orden: eje.orden }]),
  });
  const filas = await r.json();
  const fila = filas?.[0];
  if (!r.ok || !fila?.id) { console.error('eje falló:', eje.nombre, filas); process.exit(1); }

  const temas = eje.temas.map((t) => ({
    eje_id: fila.id,
    nombre: t.nombre,
    grado: t.grado,
    orden: t.orden,
    texto_oficial: t.textoOficial,
    fuente: t.fuente,
  }));
  const rt = await fetch(`${URL}/rest/v1/nap_tema?on_conflict=eje_id,nombre,grado`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(temas),
  });
  if (!rt.ok) { console.error('temas fallaron:', eje.nombre, await rt.text()); process.exit(1); }
  console.log(`✓ ${eje.materia} — ${eje.nombre} (${temas.length} temas)`);
}
console.log('Listo.');
