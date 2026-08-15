// scripts/seed-nap.mjs — carga el catálogo NAP en la base. Idempotente:
// upsert por (materia, nombre) en nap_eje y (eje_id, nombre, grado) en
// nap_tema. También sube texto_oficial y fuente (migración 0029) — son la
// cita textual del documento y su URL+página, la fuente de autoridad del
// observatorio.
//
// El loop de arriba no es transaccional (concesión aceptable para un seed),
// pero por eso mismo el script NUNCA puede terminar "Listo." si se cortó a
// mitad de camino: al final verifica los conteos reales contra la base y
// compara contra CATALOGO_NAP en memoria. Si no coinciden, sale con error
// en vez de mentir que quedó completo — el catálogo es la vara del
// observatorio, y una vara incompleta que no avisa es peor que un error.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-nap.mjs
import { CATALOGO_NAP } from '../supabase/functions/_shared/nap.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Conteo exacto de una tabla vía Content-Range (HEAD + count=exact evita
// traer filas). Range 0-0 alcanza para pedir el header aunque haya 0 filas.
async function contar(tabla) {
  const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const rango = r.headers.get('content-range'); // formato "0-18/19" o "*/0"
  const total = rango?.split('/')?.[1];
  if (!r.ok || total === undefined) { console.error(`no pude contar ${tabla}:`, r.status, rango); process.exit(1); }
  return Number(total);
}

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

const ejesEsperados = CATALOGO_NAP.length;
const temasEsperados = CATALOGO_NAP.reduce((n, e) => n + e.temas.length, 0);
const ejesReales = await contar('nap_eje');
const temasReales = await contar('nap_tema');

if (ejesReales !== ejesEsperados || temasReales !== temasEsperados) {
  console.error(
    `Cargado incompleto: esperaba ${ejesEsperados} ejes y ${temasEsperados} temas, ` +
    `la base tiene ${ejesReales} y ${temasReales}. Volvé a correr el script.`,
  );
  process.exit(1);
}

console.log(`Listo: ${ejesReales} ejes, ${temasReales} temas.`);
