// EDUTIA — seed DEMO de Lengua (Fase 2 / SP-4a). Cuelga del programa Lengua semilla
// (scripts/seed.mjs ya creó escuela/materia/programa/docente Ana):
//   - sol_materia PUBLICADA (para que el alumno la vea en el picker)
//   - 6 nodos (Vocales..Cuento)
//   - pool de ejercicios reales de opción múltiple, etiquetados por tipo y dificultad
//     (varios `producir` y al menos un `dificil` por nodo → se puede DOMINAR según la
//      regla de 2026-06-28-evaluacion-y-dominio-de-nodos.md).
// Idempotente. El service_role NUNCA va al front ni a git.
//   Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-lengua.mjs

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ID = {
  escuela: '11111111-1111-4111-8111-111111111111',
  programa: '33333333-3333-4333-8333-333333333333',
  sol_materia: 'd0000000-0000-4000-8000-000000000000',
  nodos: [
    'd0000001-0000-4000-8000-000000000001',
    'd0000002-0000-4000-8000-000000000002',
    'd0000003-0000-4000-8000-000000000003',
    'd0000004-0000-4000-8000-000000000004',
    'd0000005-0000-4000-8000-000000000005',
    'd0000006-0000-4000-8000-000000000006',
  ],
};

const NODOS = [
  { nombre: 'Vocales', descripcion: 'Reconocer y usar las vocales a, e, i, o, u.' },
  { nombre: 'Sílabas', descripcion: 'Separar palabras en sílabas y contarlas.' },
  { nombre: 'Palabras', descripcion: 'Formar y escribir palabras correctamente.' },
  { nombre: 'Oraciones', descripcion: 'Armar oraciones con mayúscula y punto.' },
  { nombre: 'Lectura', descripcion: 'Leer y comprender oraciones cortas.' },
  { nombre: 'Cuento', descripcion: 'Partes del cuento, personajes y secuencia.' },
];

// Pool por nodo (índice = nodo). e=enunciado, o=opciones, c=correcta, d=dificultad, t=tipo.
const POOL = [
  // 0 Vocales
  [
    { e: '¿Cuál de estas letras es una vocal?', o: ['m', 'a', 't', 's'], c: 'a', d: 1, t: 'reconocer' },
    { e: '¿Cuántas vocales tiene la palabra ESCUELA?', o: ['2', '3', '4', '5'], c: '4', d: 2, t: 'reconocer' },
    { e: 'Completá: la palabra C_SA lleva la vocal…', o: ['a', 'e', 'i', 'o'], c: 'a', d: 2, t: 'completar' },
    { e: '¿Cuál es el orden correcto de las vocales?', o: ['a-e-i-o-u', 'e-a-i-o-u', 'a-i-e-u-o', 'u-o-i-e-a'], c: 'a-e-i-o-u', d: 2, t: 'ordenar' },
    { e: '¿Qué vocal falta en M_SA (mesa)?', o: ['e', 'a', 'i', 'o'], c: 'e', d: 2, t: 'producir' },
    { e: 'Elegí la palabra que tiene SOLO la vocal A:', o: ['mesa', 'sol', 'ala', 'pino'], c: 'ala', d: 3, t: 'producir' },
  ],
  // 1 Sílabas
  [
    { e: '¿Cuántas sílabas tiene GATO?', o: ['1', '2', '3', '4'], c: '2', d: 1, t: 'reconocer' },
    { e: '¿Cuántas sílabas tiene MARIPOSA?', o: ['2', '3', '4', '5'], c: '4', d: 2, t: 'reconocer' },
    { e: 'MA-RI-___-SA, ¿qué sílaba falta?', o: ['PO', 'PA', 'MO', 'TO'], c: 'PO', d: 2, t: 'completar' },
    { e: 'Ordená las sílabas para formar una palabra:', o: ['sa-me', 'me-sa', 'es-am', 'am-se'], c: 'me-sa', d: 2, t: 'ordenar' },
    { e: 'Separá en sílabas: PELOTA', o: ['pe-lo-ta', 'pel-ota', 'pe-lota', 'pelo-ta'], c: 'pe-lo-ta', d: 2, t: 'producir' },
    { e: '¿Qué palabra tiene 3 sílabas?', o: ['pan', 'camino', 'sol', 'flor'], c: 'camino', d: 3, t: 'producir' },
  ],
  // 2 Palabras
  [
    { e: '¿Cuál de estas es una palabra de verdad?', o: ['xkz', 'sol', 'brr', '123'], c: 'sol', d: 1, t: 'reconocer' },
    { e: '¿Cuál es un sustantivo (nombre de una cosa)?', o: ['correr', 'mesa', 'rápido', 'y'], c: 'mesa', d: 2, t: 'reconocer' },
    { e: 'El perro ___ en el patio.', o: ['juega', 'azul', 'tres', 'silla'], c: 'juega', d: 2, t: 'completar' },
    { e: '¿Qué palabra se forma con las letras P-A-T-O?', o: ['pato', 'topa', 'tapo', 'opta'], c: 'pato', d: 2, t: 'ordenar' },
    { e: "La palabra para 'donde vivís' se escribe:", o: ['kasa', 'casa', 'cassa', 'qasa'], c: 'casa', d: 2, t: 'producir' },
    { e: '¿Cuál está bien escrita?', o: ['avión', 'abion', 'avion', 'habión'], c: 'avión', d: 3, t: 'producir' },
  ],
  // 3 Oraciones
  [
    { e: '¿Cuál de estas es una oración?', o: ['el gato', 'corre', 'El gato corre.', 'gato y'], c: 'El gato corre.', d: 1, t: 'reconocer' },
    { e: '¿Con qué empieza una oración?', o: ['minúscula', 'mayúscula', 'número', 'punto'], c: 'mayúscula', d: 2, t: 'reconocer' },
    { e: 'Una oración termina con…', o: ['coma', 'punto', 'guion', 'nada'], c: 'punto', d: 2, t: 'completar' },
    { e: 'Ordená para formar una oración:', o: ['come Ana pan', 'Ana come pan.', 'pan Ana come', 'come pan Ana'], c: 'Ana come pan.', d: 2, t: 'ordenar' },
    { e: 'Elegí la oración bien escrita:', o: ['ana juega.', 'Ana juega', 'Ana juega.', 'ana Juega'], c: 'Ana juega.', d: 2, t: 'producir' },
    { e: "Completá: 'Mañana ___ a la escuela.'", o: ['voy', 'azul', 'mesa', 'lento ayer'], c: 'voy', d: 3, t: 'producir' },
  ],
  // 4 Lectura
  [
    { e: "Leé: 'El sol brilla.' ¿Qué brilla?", o: ['la luna', 'el sol', 'el agua', 'el perro'], c: 'el sol', d: 1, t: 'reconocer' },
    { e: "Leé: 'Mateo tiene un perro negro.' ¿De qué color es el perro?", o: ['blanco', 'negro', 'marrón', 'gris'], c: 'negro', d: 2, t: 'reconocer' },
    { e: "Leé: 'La niña ___ una manzana.' Elegí la palabra que tiene sentido:", o: ['come', 'vuela', 'llueve', 'duerme'], c: 'come', d: 2, t: 'completar' },
    { e: 'Ordená la historia: (1) se durmió (2) se acostó (3) se puso el pijama', o: ['1-2-3', '3-2-1', '2-3-1', '3-1-2'], c: '3-2-1', d: 2, t: 'ordenar' },
    { e: "Leé: 'Hoy llueve mucho.' ¿Qué tiempo hace?", o: ['sol', 'lluvia', 'nieve', 'viento'], c: 'lluvia', d: 2, t: 'producir' },
    { e: "Leé: 'Ana fue al mercado y compró pan y leche.' ¿Qué compró?", o: ['pan y queso', 'solo pan', 'pan y leche', 'leche y huevos'], c: 'pan y leche', d: 3, t: 'producir' },
  ],
  // 5 Cuento
  [
    { e: 'Un cuento tiene un…', o: ['número', 'principio, medio y final', 'dibujo solo', 'precio'], c: 'principio, medio y final', d: 1, t: 'reconocer' },
    { e: '¿Quién hace las cosas en un cuento?', o: ['el personaje', 'el lápiz', 'la página', 'el punto'], c: 'el personaje', d: 2, t: 'reconocer' },
    { e: "Los cuentos suelen empezar con: 'Había una ___.'", o: ['vez', 'mesa', 'silla', 'luz'], c: 'vez', d: 2, t: 'completar' },
    { e: 'Ordená las partes del cuento:', o: ['final-inicio-nudo', 'inicio-nudo-final', 'nudo-inicio-final', 'final-nudo-inicio'], c: 'inicio-nudo-final', d: 2, t: 'ordenar' },
    { e: 'Elegí un buen título para un cuento sobre un gato perdido:', o: ['1234', 'El gato perdido', 'mesa azul', 'corre rápido'], c: 'El gato perdido', d: 2, t: 'producir' },
    { e: 'Si el personaje estaba triste y encontró a su familia, al final está…', o: ['triste', 'feliz', 'enojado', 'dormido'], c: 'feliz', d: 3, t: 'producir' },
  ],
];

async function upsert(table, rows, prefer = 'resolution=merge-duplicates,return=minimal') {
  const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: prefer }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}
async function del(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`delete ${path}: ${r.status} ${await r.text()}`);
}

async function main() {
  // Ana (docente dueña) — la creó scripts/seed.mjs
  const ana = (await (await fetch(`${URL}/rest/v1/perfil?rol=eq.docente&nombre=eq.Ana&select=id`, { headers: H })).json())[0];
  if (!ana) throw new Error('No existe la docente Ana. Corré antes scripts/seed.mjs');

  await upsert('sol_materia', [{
    id: ID.sol_materia, programa_id: ID.programa, docente_id: ana.id, escuela_id: ID.escuela,
    estado: 'publicado', version: 1,
    perfil: { system_prompt: 'Sos SOL, copiloto de Lengua para 3° grado en una escuela rural de Argentina.', tono: 'Español rioplatense, cálido.', criterios_eval: ['claridad', 'cobertura'], ejemplos_zona: [] },
  }]);

  const nodos = NODOS.map((n, i) => ({ id: ID.nodos[i], programa_id: ID.programa, nombre: n.nombre, orden: i, descripcion: n.descripcion, version: 1 }));
  await upsert('nodo', nodos);

  // ejercicios: borrar los de estos nodos y reinsertar (idempotente)
  await del(`ejercicio?nodo_id=in.(${ID.nodos.join(',')})`);
  const ejercicios = POOL.flatMap((lista, i) => lista.map((x) => ({
    nodo_id: ID.nodos[i], enunciado: x.e, opciones: x.o, correcta: x.c, dificultad: x.d, tipo: x.t,
  })));
  await upsert('ejercicio', ejercicios, 'return=minimal');

  console.log(`✓ Lengua demo: sol_materia publicada + ${nodos.length} nodos + ${ejercicios.length} ejercicios`);
}

main().catch((e) => { console.error('SEED DEMO ERROR:', e.message); process.exit(1); });
