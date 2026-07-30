// EDUTIA — seed de ACTIVIDAD simulada para LUNA (Fase 2 / copiloto docente).
// Corre DESPUÉS de seed.mjs y seed-demo-lengua.mjs. Hace dos cosas:
//
// 1) Vuelve el aula PLURIGRADO de verdad (decisión validada): Mateo y Lucía
//    pasan a 5°, Benja a 1° (Sofía y Tomás quedan en 3°), y crea los programas
//    de Lengua 1° y 5° (sol_materia publicada + 3 nodos + pool chico) para que
//    el picker de grados del boletín y el chat plurigrado se demuestren de
//    punta a punta. OJO: modifica perfil.grado de los alumnos semilla (DB de
//    demo); sus alumno_nodo viejos de 3° quedan, son inofensivos.
//
// 2) Siembra ~3 semanas de sesiones + respuestas con personas que disparan cada
//    alerta de LUNA (fechas RELATIVAS a hoy, así la demo anda cualquier día):
//    Mateo normal (~70%) · Lucía adelantada (~90%, nodos dominados) · Benja
//    caída de precisión (semanas viejas ~83% → última ~33%) · Sofía evita
//    `producir` (16 respuestas sin ninguno) · Tomás inactivo (última hace 11 días).
//
// Idempotente: sesiones con UUID fijo (delete-then-insert de respuesta/
// evaluacion_sesion/sesion); programas/nodos con upsert; ejercicios solo si el
// nodo está vacío. El service_role NUNCA va al front ni a git.
//   Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-actividad.mjs

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ID = {
  escuela: '11111111-1111-4111-8111-111111111111',
  materia: '22222222-2222-4222-8222-222222222222',
  programaG1: 'f0000001-0000-4000-8000-000000000001',
  programaG5: 'f0000005-0000-4000-8000-000000000005',
  solG1: 'd1000000-0000-4000-8000-000000000000',
  solG5: 'd5000000-0000-4000-8000-000000000000',
  nodosG1: ['f1000001-0000-4000-8000-000000000001', 'f1000002-0000-4000-8000-000000000002', 'f1000003-0000-4000-8000-000000000003'],
  nodosG5: ['f5000001-0000-4000-8000-000000000001', 'f5000002-0000-4000-8000-000000000002', 'f5000003-0000-4000-8000-000000000003'],
  // nodos de 3° que ya creó seed-demo-lengua.mjs
  nodoVocales: 'd0000001-0000-4000-8000-000000000001',
  nodoSilabas: 'd0000002-0000-4000-8000-000000000002',
};

// UUID fijo de sesión NN (01..99) → idempotencia por delete-then-insert.
const sesId = (nn) => `e0000000-0000-4000-8000-0000000000${String(nn).padStart(2, '0')}`;
const TOTAL_SESIONES = 23;

const NODOS_G1 = [
  { nombre: 'Las vocales', descripcion: 'Reconocer las vocales en palabras cortas.' },
  { nombre: 'Mi nombre', descripcion: 'Reconocer y armar el propio nombre, letra inicial.' },
  { nombre: 'Primeras palabras', descripcion: 'Leer y formar palabras simples de dos sílabas.' },
];
const NODOS_G5 = [
  { nombre: 'Verbos', descripcion: 'Reconocer verbos y conjugarlos en presente y pasado.' },
  { nombre: 'Textos informativos', descripcion: 'Leer textos breves y extraer la idea principal.' },
  { nombre: 'Tildes', descripcion: 'Reglas generales de acentuación: agudas, graves y esdrújulas.' },
];

// Pools chicos (6 por nodo, con ≥2 `producir` y ≥1 dificultad 3, como el resto del seed).
const POOL_G1 = [
  [
    { e: '¿Cuál es una vocal?', o: ['m', 'a', 'p', 't'], c: 'a', d: 1, t: 'reconocer' },
    { e: '¿Con qué vocal empieza OSO?', o: ['o', 'a', 'e', 'u'], c: 'o', d: 1, t: 'reconocer' },
    { e: 'Completá: S_L (sol)', o: ['o', 'a', 'e', 'i'], c: 'o', d: 2, t: 'completar' },
    { e: '¿Qué vocal falta en P_TO (pato)?', o: ['a', 'e', 'o', 'u'], c: 'a', d: 2, t: 'completar' },
    { e: 'Elegí la palabra que empieza con E:', o: ['ala', 'eco', 'iso', 'uno'], c: 'eco', d: 2, t: 'producir' },
    { e: '¿Qué palabra tiene las vocales A y O?', o: ['gato', 'nene', 'lulu', 'pipi'], c: 'gato', d: 3, t: 'producir' },
  ],
  [
    { e: '¿Con qué letra empieza ANA?', o: ['A', 'N', 'M', 'O'], c: 'A', d: 1, t: 'reconocer' },
    { e: '¿Cuántas letras tiene LUZ?', o: ['2', '3', '4', '5'], c: '3', d: 1, t: 'reconocer' },
    { e: 'Completá el nombre: MAT_O', o: ['E', 'A', 'I', 'U'], c: 'E', d: 2, t: 'completar' },
    { e: 'Ordená las letras: N-A-A (nombre de nena)', o: ['ANA', 'NAA', 'AAN', 'NNA'], c: 'ANA', d: 2, t: 'ordenar' },
    { e: '¿Cuál está escrito bien?', o: ['sofia', 'Sofía', 'SOFíA', 'sOFIA'], c: 'Sofía', d: 3, t: 'producir' },
    { e: 'Elegí el nombre que empieza como TOMÁS:', o: ['Tobías', 'Ana', 'Lucía', 'Benja'], c: 'Tobías', d: 2, t: 'producir' },
  ],
  [
    { e: '¿Qué dice acá? MA-MÁ', o: ['mamá', 'mesa', 'mano', 'mimo'], c: 'mamá', d: 1, t: 'reconocer' },
    { e: '¿Cuál es una palabra de verdad?', o: ['pa', 'pan', 'pn', 'np'], c: 'pan', d: 1, t: 'reconocer' },
    { e: 'Completá: CA-__ (casa)', o: ['SA', 'MA', 'TO', 'PI'], c: 'SA', d: 2, t: 'completar' },
    { e: 'Ordená las sílabas: TO-GA', o: ['gato', 'toga', 'gota', 'tago'], c: 'gato', d: 2, t: 'ordenar' },
    { e: '¿Qué palabra nombra un animal?', o: ['vaca', 'mesa', 'pelo', 'sopa'], c: 'vaca', d: 2, t: 'producir' },
    { e: 'Elegí la palabra bien escrita:', o: ['oveja', 'obeja', 'ovexa', 'hoveja'], c: 'oveja', d: 3, t: 'producir' },
  ],
];
const POOL_G5 = [
  [
    { e: '¿Cuál de estas palabras es un verbo?', o: ['galope', 'galopar', 'galopante', 'galopado'], c: 'galopar', d: 1, t: 'reconocer' },
    { e: "En 'La yegua corrió al corral', el verbo es…", o: ['yegua', 'corrió', 'corral', 'la'], c: 'corrió', d: 1, t: 'reconocer' },
    { e: 'Completá: Ayer nosotros ___ leña.', o: ['juntamos', 'juntaremos', 'juntan', 'juntar'], c: 'juntamos', d: 2, t: 'completar' },
    { e: '¿Cuál está en tiempo futuro?', o: ['sembré', 'siembro', 'sembraré', 'sembrando'], c: 'sembraré', d: 2, t: 'reconocer' },
    { e: "Pasá a pasado: 'El puestero arrea las cabras.'", o: ['arreó', 'arreará', 'arrea', 'arrear'], c: 'arreó', d: 2, t: 'producir' },
    { e: "¿Qué verbo completa bien? 'Si llueve, no ___ a la escuela.'", o: ['iremos', 'fuimos', 'íbamos', 'ir'], c: 'iremos', d: 3, t: 'producir' },
  ],
  [
    { e: 'Un texto informativo sirve para…', o: ['contar un cuento', 'dar información real', 'hacer reír', 'rimar'], c: 'dar información real', d: 1, t: 'reconocer' },
    { e: "'El cóndor vive en la cordillera. Come carroña.' ¿De qué habla?", o: ['del cóndor', 'de la lluvia', 'del puma', 'de la escuela'], c: 'del cóndor', d: 1, t: 'reconocer' },
    { e: 'La idea principal de un texto es…', o: ['lo más importante', 'la última palabra', 'el título solo', 'un dibujo'], c: 'lo más importante', d: 2, t: 'completar' },
    { e: '¿Qué parte va PRIMERO en una noticia?', o: ['el título', 'la firma', 'el final', 'la foto'], c: 'el título', d: 2, t: 'ordenar' },
    { e: "Leé: 'La esquila se hace en primavera.' ¿Cuándo se esquila?", o: ['en primavera', 'en invierno', 'de noche', 'en marzo'], c: 'en primavera', d: 2, t: 'producir' },
    { e: '¿Cuál sería un buen título informativo?', o: ['Cómo cuidar la huerta', 'Había una vez', 'El lobo feroz', 'Colorín colorado'], c: 'Cómo cuidar la huerta', d: 3, t: 'producir' },
  ],
  [
    { e: '¿Cuál palabra es aguda?', o: ['camión', 'mesa', 'árbol', 'sábado'], c: 'camión', d: 1, t: 'reconocer' },
    { e: '¿Cuál palabra es esdrújula?', o: ['pájaro', 'cantor', 'papel', 'venta'], c: 'pájaro', d: 2, t: 'reconocer' },
    { e: 'Completá: las esdrújulas llevan tilde…', o: ['siempre', 'nunca', 'a veces', 'los lunes'], c: 'siempre', d: 2, t: 'completar' },
    { e: '¿Dónde va la sílaba tónica de VENTANA?', o: ['ven', 'TA', 'na', 'no tiene'], c: 'TA', d: 2, t: 'ordenar' },
    { e: '¿Cuál está bien escrita?', o: ['arbol', 'árbol', 'árbol.', 'arból'], c: 'árbol', d: 2, t: 'producir' },
    { e: 'Elegí la oración sin errores de tilde:', o: ['El té está rico.', 'El te está rico.', 'Él te esta rico.', 'El té esta rico.'], c: 'El té está rico.', d: 3, t: 'producir' },
  ],
];

// `conflicto` (opcional): columnas del unique a usar cuando el conflicto no es
// por PK (ej. alumno_nodo tiene PK id pero unique (alumno_id, nodo_id)).
async function upsert(table, rows, conflicto) {
  const q = conflicto ? `?on_conflict=${conflicto}` : '';
  const r = await fetch(`${URL}/rest/v1/${table}${q}`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${table}: ${r.status} ${await r.text()}`);
}

async function get(pathQ) {
  const r = await fetch(`${URL}/rest/v1/${pathQ}`, { headers: H });
  if (!r.ok) throw new Error(`get ${pathQ}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function del(pathQ) {
  const r = await fetch(`${URL}/rest/v1/${pathQ}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`delete ${pathQ}: ${r.status} ${await r.text()}`);
}

async function insert(table, rows) {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${await r.text()}`);
}

// Fecha "hace N días" a la hora local `h`.
const hace = (dias, h = 10) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dias, h, 0, 0).toISOString();
};

async function main() {
  // 0) docente Ana + alumnos semilla (ids de auth → se resuelven en runtime)
  const [ana] = await get(`perfil?rol=eq.docente&escuela_id=eq.${ID.escuela}&nombre=eq.Ana&select=id`);
  if (!ana) throw new Error('No está la seño Ana: corré antes scripts/seed.mjs');
  const alumnos = await get(`perfil?rol=eq.alumno&docente_id=eq.${ana.id}&select=id,nombre`);
  const porNombre = Object.fromEntries(alumnos.map((a) => [a.nombre, a.id]));
  for (const n of ['Mateo', 'Lucía', 'Benja', 'Sofía', 'Tomás']) {
    if (!porNombre[n]) throw new Error(`Falta el alumno semilla ${n}: corré antes scripts/seed.mjs`);
  }

  // 1) plurigrado: Mateo y Lucía a 5°, Benja a 1° (Sofía y Tomás quedan en 3°)
  for (const [nombre, grado] of [['Mateo', 5], ['Lucía', 5], ['Benja', 1]]) {
    await upsert('perfil', [{ id: porNombre[nombre], rol: 'alumno', nombre, grado }]);
  }
  console.log('✓ aula plurigrado (Benja 1° · Sofía y Tomás 3° · Mateo y Lucía 5°)');

  // 2) programas + materias publicadas de Lengua 1° y 5°
  await upsert('programa', [
    { id: ID.programaG1, materia_id: ID.materia, grado: 1, contenido: 'Vocales, el propio nombre, primeras palabras.' },
    { id: ID.programaG5, materia_id: ID.materia, grado: 5, contenido: 'Verbos, textos informativos, tildes.' },
  ]);
  const perfilSol = (grado) => ({
    system_prompt: `Sos SOL, copiloto de Lengua para ${grado}° grado de una escuela rural de la Patagonia.`,
    tono: 'cálido, alentador, rioplatense',
    criterios_eval: 'claridad, sin ambigüedades, una sola correcta',
    ejemplos_zona: 'campo, animales, cerros de Neuquén',
  });
  await upsert('sol_materia', [
    { id: ID.solG1, programa_id: ID.programaG1, docente_id: ana.id, escuela_id: ID.escuela, estado: 'publicado', perfil: perfilSol(1) },
    { id: ID.solG5, programa_id: ID.programaG5, docente_id: ana.id, escuela_id: ID.escuela, estado: 'publicado', perfil: perfilSol(5) },
  ]);
  await upsert('nodo', ID.nodosG1.map((id, i) => ({ id, programa_id: ID.programaG1, orden: i, ...NODOS_G1[i] })));
  await upsert('nodo', ID.nodosG5.map((id, i) => ({ id, programa_id: ID.programaG5, orden: i, ...NODOS_G5[i] })));
  for (const [nodos, pool] of [[ID.nodosG1, POOL_G1], [ID.nodosG5, POOL_G5]]) {
    for (let i = 0; i < nodos.length; i++) {
      const ya = await get(`ejercicio?nodo_id=eq.${nodos[i]}&select=id&limit=1`);
      if (ya.length) continue; // idempotencia: no duplicar el pool
      await insert('ejercicio', pool[i].map((x) => ({
        nodo_id: nodos[i], enunciado: x.e, opciones: x.o, correcta: x.c, dificultad: x.d, tipo: x.t,
      })));
    }
  }
  console.log('✓ Lengua 1° y 5° publicadas (3 nodos + pool cada una)');

  // 3) actividad: delete-then-insert de las sesiones fijas
  const ids = Array.from({ length: TOTAL_SESIONES }, (_, i) => sesId(i + 1));
  const inList = `in.(${ids.join(',')})`;
  await del(`respuesta?sesion_id=${inList}`);
  await del(`evaluacion_sesion?sesion_id=${inList}`);
  await del(`sesion?id=${inList}`);

  // ejercicios reales por nodo (para respuesta.ejercicio_id y su tipo)
  const ejsDe = async (nodoId, filtro = () => true) =>
    (await get(`ejercicio?nodo_id=eq.${nodoId}&select=id,correcta,tipo&order=dificultad`)).filter(filtro);

  let nn = 0;
  const sesiones = [];
  const respuestas = [];
  // Una sesión de `total` respuestas sobre `ejs` (cicla), `aciertos` correctas.
  const armarSesion = (alumnoId, nodoId, diasAtras, ejs, aciertos, total) => {
    nn += 1;
    const id = sesId(nn);
    sesiones.push({ id, alumno_id: alumnoId, nodo_id: nodoId, fecha: hace(diasAtras), duracion_seg: 60 * total, aciertos, total });
    for (let i = 0; i < total; i++) {
      const ej = ejs[i % ejs.length];
      const ok = i < aciertos;
      respuestas.push({
        sesion_id: id, ejercicio_id: ej.id, dada: ok ? ej.correcta : 'otra',
        correcta: ok, tiempo_seg: 20 + (i % 4) * 10, reintentos: ok ? 0 : 1, created_at: hace(diasAtras),
      });
    }
  };

  const g5n = [ID.nodosG5[0], ID.nodosG5[1], ID.nodosG5[2]];
  const ejsG5 = await Promise.all(g5n.map((n) => ejsDe(n)));
  const ejsG1n1 = await ejsDe(ID.nodosG1[0]);
  const ejsVocales = await ejsDe(ID.nodoVocales);
  const ejsSinProducir = [
    ...(await ejsDe(ID.nodoVocales, (e) => e.tipo !== 'producir')),
    ...(await ejsDe(ID.nodoSilabas, (e) => e.tipo !== 'producir')),
  ];

  // Mateo (5°, normal ~70%): 6 sesiones repartidas en 3 semanas.
  [[20, 0], [16, 1], [12, 2], [8, 0], [4, 1], [1, 2]].forEach(([d, i]) =>
    armarSesion(porNombre['Mateo'], g5n[i], d, ejsG5[i], 4, 6));
  // Lucía (5°, adelantada ~90%): 6 sesiones, casi todo bien.
  [[15, 0], [12, 1], [9, 2], [6, 0], [3, 1], [1, 2]].forEach(([d, i]) =>
    armarSesion(porNombre['Lucía'], g5n[i], d, ejsG5[i], 6, 6));
  // Benja (1°, caída en "Las vocales"): antes ~83% (días 15 y 12) → ahora ~33% (días 2 y 1).
  armarSesion(porNombre['Benja'], ID.nodosG1[0], 15, ejsG1n1, 5, 6);
  armarSesion(porNombre['Benja'], ID.nodosG1[0], 12, ejsG1n1, 5, 6);
  armarSesion(porNombre['Benja'], ID.nodosG1[0], 2, ejsG1n1, 2, 6);
  armarSesion(porNombre['Benja'], ID.nodosG1[0], 1, ejsG1n1, 2, 6);
  // Sofía (3°, evita producir): 16 respuestas en 14 días, ninguna de ese tipo.
  [[10, 0], [7, 1], [4, 2], [2, 3]].forEach(([d], idx) =>
    armarSesion(porNombre['Sofía'], idx % 2 ? ID.nodoSilabas : ID.nodoVocales, d, ejsSinProducir, 3, 4));
  // Tomás (3°, inactivo): la última fue hace 11 días.
  [[18], [14], [11]].forEach(([d]) =>
    armarSesion(porNombre['Tomás'], ID.nodoVocales, d, ejsVocales, 4, 6));

  await insert('sesion', sesiones);
  await insert('respuesta', respuestas);
  console.log(`✓ ${sesiones.length} sesiones + ${respuestas.length} respuestas simuladas`);

  // 4) estados de nodos coherentes con las personas
  await upsert('alumno_nodo', [
    { alumno_id: porNombre['Lucía'], nodo_id: ID.nodosG5[0], estado: 'dominado', puntaje: 92 },
    { alumno_id: porNombre['Lucía'], nodo_id: ID.nodosG5[1], estado: 'dominado', puntaje: 88 },
    { alumno_id: porNombre['Lucía'], nodo_id: ID.nodosG5[2], estado: 'en_construccion', puntaje: 45 },
    { alumno_id: porNombre['Mateo'], nodo_id: ID.nodosG5[0], estado: 'en_construccion', puntaje: 55 },
    { alumno_id: porNombre['Benja'], nodo_id: ID.nodosG1[0], estado: 'a_reforzar', puntaje: 25 },
    { alumno_id: porNombre['Sofía'], nodo_id: ID.nodoVocales, estado: 'en_construccion', puntaje: 50 },
    { alumno_id: porNombre['Tomás'], nodo_id: ID.nodoVocales, estado: 'en_construccion', puntaje: 30 },
  ].map((r) => ({ ...r, actualizado_at: hace(1) })), 'alumno_id,nodo_id');
  console.log('✓ alumno_nodo acorde a cada persona');

  console.log('\nSeed de actividad OK. Entrá como ana@edutia.ar y abrí LUNA.');
}

main().catch((e) => { console.error('SEED ERROR:', e.message); process.exit(1); });
