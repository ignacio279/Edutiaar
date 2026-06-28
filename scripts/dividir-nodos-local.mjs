// División de nodos LOCAL (Etapa 2, pieza 3). Motor = suscripción de Claude vía Agent
// SDK (no API key). Toma un plan (texto), lo divide en nodos reales y crea programa +
// sol_materia (borrador, dueña Ana) + nodos. La seño después publica desde la UI.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/dividir-nodos-local.mjs --materia "Matemática" --grado 3 --plan plan.txt
import { readFileSync } from 'node:fs';
import { generarJSON } from './lib/sol-sdk.mjs';
import { construirPromptDivisionJSON, parseDivision } from '../supabase/functions/dividir-nodos/dividir.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const MATERIA = arg('materia', null);
const GRADO = Number(arg('grado', '3'));
const PLAN = arg('plan', null);
const CONTENIDO = arg('contenido', null);
if (!MATERIA || (!PLAN && !CONTENIDO)) {
  console.error('Uso: node scripts/dividir-nodos-local.mjs --materia "X" --grado 3 (--plan archivo.txt | --contenido "texto")');
  process.exit(1);
}
const contenido = PLAN ? readFileSync(PLAN, 'utf8') : CONTENIDO;

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H, ...opts });
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const insert = (table, row) => rest(table, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) });

async function main() {
  const ana = (await rest('perfil?rol=eq.docente&nombre=eq.Ana&select=id,escuela_id'))[0];
  if (!ana) throw new Error('No existe la docente Ana. Corré antes scripts/seed.mjs');

  console.log(`Dividiendo el plan de ${MATERIA} (${GRADO}°) en nodos — motor: suscripción…`);
  const { system, user } = construirPromptDivisionJSON(MATERIA, GRADO, contenido);
  const division = await generarJSON({ system, user }, (j) => parseDivision(j, MATERIA, GRADO));

  // materia (find-or-create) → programa → sol_materia (borrador) → nodos
  let materia = (await rest(`materia?nombre=eq.${encodeURIComponent(MATERIA)}&select=id`))[0];
  if (!materia) materia = await insert('materia', { nombre: MATERIA }).then((r) => r[0]);
  const programa = (await insert('programa', { materia_id: materia.id, grado: GRADO, contenido }))[0];
  const sm = (await insert('sol_materia', {
    programa_id: programa.id, docente_id: ana.id, escuela_id: ana.escuela_id, estado: 'borrador', perfil: division.perfil,
  }))[0];
  await insert('nodo', division.nodos.map((n) => ({ programa_id: programa.id, nombre: n.nombre, orden: n.orden, descripcion: n.descripcion })));

  console.log(`✓ ${division.nodos.length} nodos: ${division.nodos.map((n) => n.nombre).join(', ')}`);
  console.log(`  programa=${programa.id}  sol_materia=${sm.id} (borrador)`);
  console.log('La seño puede publicarla desde /docente/autoria, y generar ejercicios con generar-ejercicios-local.mjs --programa ' + programa.id);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
