// Generador de ejercicios LOCAL (Etapa 2, pieza 2). Motor = suscripción de Claude
// vía Agent SDK (no API key). Por cada nodo del programa genera un pool real de
// opción múltiple y lo siembra en `ejercicio` (idempotente: borra y reinserta).
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/generar-ejercicios-local.mjs [--programa <id>] [--nodo <id>] [--n 6]
import { generarJSON } from './lib/sol-sdk.mjs';
import { construirPromptEjercicios, parseEjercicios, cubreDominio } from '../supabase/functions/generador-ejercicios/generar.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PROGRAMA = arg('programa', '33333333-3333-4333-8333-333333333333'); // Lengua semilla
const SOLO_NODO = arg('nodo', null);
const N = Number(arg('n', '6'));

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H, ...opts });
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function main() {
  const prog = (await rest(`programa?id=eq.${PROGRAMA}&select=grado,materia:materia_id(nombre)`))[0];
  if (!prog) throw new Error(`No existe el programa ${PROGRAMA}`);
  const materia = prog.materia?.nombre ?? 'la materia';
  const grado = prog.grado;

  const filtroNodo = SOLO_NODO ? `&id=eq.${SOLO_NODO}` : '';
  const nodos = await rest(`nodo?programa_id=eq.${PROGRAMA}${filtroNodo}&select=id,nombre,descripcion&order=orden`);
  if (!nodos.length) throw new Error('El programa no tiene nodos. Corré antes dividir-nodos.');

  console.log(`Generando ejercicios de ${materia} (${grado}°) para ${nodos.length} nodo(s) — motor: suscripción…\n`);
  for (const nodo of nodos) {
    let pool = await generarJSON(
      { ...construirPromptEjercicios(materia, grado, nodo.nombre, nodo.descripcion || '', N) },
      (j) => parseEjercicios(j, nodo.id),
    );
    if (!cubreDominio(pool)) {
      // reintento pidiendo cobertura para que el nodo se pueda dominar (regla SP-4b)
      const p = construirPromptEjercicios(materia, grado, nodo.nombre, nodo.descripcion || '', N);
      pool = await generarJSON(
        { system: p.system, user: `${p.user}\nIMPORTANTE: incluí al menos 2 de tipo "producir" y al menos 1 de dificultad 3.` },
        (j) => parseEjercicios(j, nodo.id),
      );
    }
    await rest(`ejercicio?nodo_id=eq.${nodo.id}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
    await rest('ejercicio', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(pool) });
    const cobertura = cubreDominio(pool) ? 'OK' : '⚠ sin cobertura para dominar';
    console.log(`✓ ${nodo.nombre}: ${pool.length} ejercicios (${cobertura})`);
  }
  console.log('\nListo.');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
