// EDUTIA — seed de ACTIVIDAD simulada para LUNA (Fase 2 / copiloto docente) y,
// desde la fase "marco NAP", de VOLUMEN para el observatorio admin.
// Corre DESPUÉS de seed.mjs y seed-demo-lengua.mjs. Hace tres cosas:
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
// 3) Repone Matemática 4° (Task 9, marco NAP): el smoke de otra tarea de esta
//    misma fase borró la materia "Matematicas" preexistente (cargada a mano,
//    nunca versionada) y el cascade se llevó su programa con todos sus nodos.
//    Acá se recrea COMO SEED — con la tilde correcta ("Matemática", para no
//    repetir el problema de emparejamiento por nombre que arrastró el bug — y
//    de paso con ids fijos, así ni dividir-nodos ni nadie hace get-or-create
//    por nombre) — con 8 nodos que cubren los 8 temas NAP de 4° grado
//    (Número y operaciones + Geometría y medida), clasificados EN EL SEED
//    mismo (nap_tema_id resuelto contra la base por (materia, eje, nombre,
//    grado); nap_confianza 1, nap_revisado true: lo decidió una persona al
//    escribirlo). Suma 8 alumnos nuevos de 4° (mínimo para pasar k=5 con
//    margen) y reparte su práctica a propósito: 4 nodos con los 8 alumnos
//    (celda publicable), 1 nodo con solo 3 (`muestra insuficiente` con datos
//    reales, no un cero) y 3 nodos sin tocar (fila en cero — así se ve la
//    otra cara, un tema del marco que nadie practicó todavía).
//
// Idempotente: sesiones con UUID fijo (delete-then-insert de respuesta/
// evaluacion_sesion/sesion); programas/nodos/materia con upsert por id fijo
// (nunca get-or-create por nombre); ejercicios solo si el nodo está vacío;
// alumnos nuevos con ensureUser (crea o reusa) + matrícula idempotente. El
// service_role NUNCA va al front ni a git.
//   Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-actividad.mjs

import { randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const ID = {
  escuela: '11111111-1111-4111-8111-111111111111',
  aula: '44444444-4444-4444-8444-444444444444', // el aula única del colegio demo (creada en seed.mjs); un solo salón, plurigrado
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
  // Matemática 4° (Task 9, marco NAP): ids fijos a propósito, nunca
  // get-or-create por nombre (esa fue la causa raíz del contenido perdido).
  materiaMate: '90000000-0000-4900-8900-900000000001',
  programaG4Mate: '90000000-0000-4900-8900-900000000002',
  solG4Mate: '90000000-0000-4900-8900-900000000003',
  nodosG4Mate: [
    '90000000-0000-4900-8900-900000000011',
    '90000000-0000-4900-8900-900000000012',
    '90000000-0000-4900-8900-900000000013',
    '90000000-0000-4900-8900-900000000014',
    '90000000-0000-4900-8900-900000000015',
    '90000000-0000-4900-8900-900000000016',
    '90000000-0000-4900-8900-900000000017',
    '90000000-0000-4900-8900-900000000018',
  ],
};

// UUID fijo de sesión NN (01..99) → idempotencia por delete-then-insert.
const sesId = (nn) => `e0000000-0000-4000-8000-0000000000${String(nn).padStart(2, '0')}`;
// 23 de LUNA (Lengua) + 32 (4 nodos × 8 alumnos de 4°) + 3 (1 nodo con solo 3
// alumnos, la celda "muestra insuficiente") de Matemática = 58.
const TOTAL_SESIONES = 58;

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

// ── Matemática 4° (Task 9, marco NAP) ───────────────────────────────────────
// 8 nodos = los 8 temas NAP de 4° grado completos (Número y operaciones +
// Geometría y medida). `eje`/`tema` son el nombre EXACTO en nap_eje/nap_tema
// (se resuelven contra la base en main(), nunca hardcodeados como id).
const NODOS_G4_MATE = [
  { nombre: 'Números hasta el 9999', descripcion: 'Leer, escribir, comparar y ordenar números de cuatro cifras con la organización decimal.', eje: 'Número y operaciones', tema: 'Sistema decimal y números naturales' },
  { nombre: 'Fracciones en la vida diaria', descripcion: 'Usar fracciones y decimales de uso social: medio kilo de lana, un cuarto de hora.', eje: 'Número y operaciones', tema: 'Fracciones y decimales de uso social' },
  { nombre: 'Multiplicación y división', descripcion: 'Resolver problemas de multiplicación y división con distintos significados.', eje: 'Número y operaciones', tema: 'Operaciones entre naturales' },
  { nombre: 'Sumar y restar fracciones', descripcion: 'Sumar y restar fracciones y expresiones decimales sencillas.', eje: 'Número y operaciones', tema: 'Operaciones entre fracciones y decimales' },
  { nombre: 'Ubicación y recorridos', descripcion: 'Describir recorridos y ubicar objetos usando puntos de referencia del campo.', eje: 'Geometría y medida', tema: 'Relaciones espaciales' },
  { nombre: 'Figuras y cuerpos', descripcion: 'Reconocer y describir figuras y cuerpos geométricos por sus elementos.', eje: 'Geometría y medida', tema: 'Figuras y cuerpos geométricos' },
  { nombre: 'Medir con instrumentos', descripcion: 'Elegir el instrumento y la unidad adecuada para medir longitud, peso y capacidad.', eje: 'Geometría y medida', tema: 'Proceso de medir' },
  { nombre: 'Estimar medidas', descripcion: 'Estimar y calcular medidas de longitud, peso, capacidad y tiempo en situaciones cotidianas.', eje: 'Geometría y medida', tema: 'Estimar y calcular medidas' },
];

// Índices de NODOS_G4_MATE/ID.nodosG4Mate que reciben práctica: 4 nodos con
// los 8 alumnos (celda publicable, k=5 con margen), 1 con solo 3 (`muestra
// insuficiente` con datos reales) y el resto sin tocar (fila en cero).
const G4_NODOS_FULL = [0, 2, 4, 5]; // Números · Multiplicación y división · Ubicación · Figuras
const G4_NODO_PARCIAL = 1; // Fracciones en la vida diaria

// Pools chicos (6 por nodo, con ≥2 `producir` y ≥1 dificultad 3). Se siembran
// para los 8 nodos (también los que no se practican: un nodo publicado y
// nunca practicado tiene que poder practicarse igual, D-NAP5).
const POOL_G4_MATE = [
  [ // Números hasta el 9999
    { e: '¿Cuál es el número que sigue a 2399?', o: ['2400', '2398', '2410', '3400'], c: '2400', d: 1, t: 'reconocer' },
    { e: '¿Cuántas centenas tiene 3450?', o: ['3', '4', '34', '45'], c: '4', d: 2, t: 'reconocer' },
    { e: 'Completá: 5000 + 200 + 30 + 1 = ___', o: ['5231', '5213', '5123', '5321'], c: '5231', d: 2, t: 'completar' },
    { e: 'Ordená de menor a mayor: 4102, 4012, 4120 → ¿cuál va primero?', o: ['4012', '4102', '4120', '4201'], c: '4012', d: 2, t: 'ordenar' },
    { e: 'Un puestero contó 3725 ovejas. ¿Cómo se lee ese número?', o: ['tres mil setecientos veinticinco', 'tres mil setecientos cincuenta y dos', 'tres setecientos veinticinco', 'treinta y siete veinticinco'], c: 'tres mil setecientos veinticinco', d: 2, t: 'producir' },
    { e: '¿Qué número tiene 6 unidades de mil, 0 centenas, 4 decenas y 2 unidades?', o: ['6042', '6420', '6402', '6024'], c: '6042', d: 3, t: 'producir' },
  ],
  [ // Fracciones en la vida diaria
    { e: "Si repartís una torta en 4 partes iguales, ¿cómo se llama cada parte?", o: ['un medio', 'un cuarto', 'un tercio', 'un octavo'], c: 'un cuarto', d: 1, t: 'reconocer' },
    { e: "¿Cuál fracción representa 'medio kilo'?", o: ['1/2', '1/4', '2/1', '1/3'], c: '1/2', d: 1, t: 'reconocer' },
    { e: 'Completá: 3/4 de hora son ___ minutos.', o: ['45', '30', '15', '60'], c: '45', d: 2, t: 'completar' },
    { e: '¿Qué fracción es más grande, 1/3 o 1/5?', o: ['1/3', '1/5', 'son iguales', 'no se puede saber'], c: '1/3', d: 2, t: 'reconocer' },
    { e: 'En la despensa venden yerba en paquetes de 1/4 kilo. Si comprás 3 paquetes, ¿cuántos kilos son?', o: ['3/4', '1', '1/2', '2/4'], c: '3/4', d: 2, t: 'producir' },
    { e: '0,25 es lo mismo que…', o: ['1/4', '1/2', '1/3', '3/4'], c: '1/4', d: 3, t: 'producir' },
  ],
  [ // Multiplicación y división
    { e: '6 × 7 = ?', o: ['42', '36', '48', '40'], c: '42', d: 1, t: 'reconocer' },
    { e: '¿Cuál es el resultado de 45 ÷ 9?', o: ['5', '6', '4', '9'], c: '5', d: 1, t: 'reconocer' },
    { e: 'Completá: 8 × ___ = 56', o: ['7', '6', '8', '9'], c: '7', d: 2, t: 'completar' },
    { e: 'En la escuela hay 24 chicos y se forman equipos de 4. ¿Cuántos equipos hay?', o: ['6', '8', '4', '5'], c: '6', d: 2, t: 'producir' },
    { e: 'Un puestero tiene 9 corrales con 12 ovejas cada uno. ¿Cuántas ovejas tiene en total?', o: ['108', '96', '118', '101'], c: '108', d: 3, t: 'producir' },
    { e: '¿Qué operación conviene para repartir 60 alfajores entre 5 chicos por igual?', o: ['división', 'multiplicación', 'suma', 'resta'], c: 'división', d: 2, t: 'reconocer' },
  ],
  [ // Sumar y restar fracciones
    { e: '1/4 + 1/4 = ?', o: ['2/4', '1/8', '2/8', '1/2'], c: '2/4', d: 1, t: 'reconocer' },
    { e: '¿Cuánto es 3/5 − 1/5?', o: ['2/5', '2/10', '4/5', '1/5'], c: '2/5', d: 1, t: 'reconocer' },
    { e: 'Completá: 1/2 + ___ = 1', o: ['1/2', '1/4', '1/3', '2/2'], c: '1/2', d: 2, t: 'completar' },
    { e: '¿Qué fracción falta para llegar de 2/4 a 4/4?', o: ['2/4', '1/4', '3/4', '1/2'], c: '2/4', d: 2, t: 'producir' },
    { e: '0,5 + 0,25 = ?', o: ['0,75', '0,7', '1', '0,25'], c: '0,75', d: 2, t: 'producir' },
    { e: 'Ordená de menor a mayor: 1/2, 1/4, 3/4', o: ['1/4, 1/2, 3/4', '1/2, 1/4, 3/4', '3/4, 1/2, 1/4', '1/4, 3/4, 1/2'], c: '1/4, 1/2, 3/4', d: 3, t: 'ordenar' },
  ],
  [ // Ubicación y recorridos
    { e: 'Si estás mirando al norte y girás a la derecha, ¿hacia dónde quedás mirando?', o: ['este', 'oeste', 'sur', 'norte'], c: 'este', d: 1, t: 'reconocer' },
    { e: '¿Qué símbolo indica en un plano dónde estás parado?', o: ['una cruz o un punto', 'una flecha larga', 'un círculo grande', 'una línea punteada'], c: 'una cruz o un punto', d: 1, t: 'reconocer' },
    { e: 'Completá: para llegar del aula al patio hay que caminar hacia ___ y doblar en la puerta.', o: ['adelante', 'arriba', 'abajo', 'atrás'], c: 'adelante', d: 2, t: 'completar' },
    { e: 'Ordená los pasos para ir de la escuela al almacén: doblar en la tranquera / salir por el portón / caminar derecho por el camino', o: ['2,3,1', '1,2,3', '3,2,1', '2,1,3'], c: '2,3,1', d: 2, t: 'ordenar' },
    { e: 'Si el corral queda al lado del molino y el molino está detrás de la casa, ¿dónde está el corral respecto de la casa?', o: ['detrás y al costado', 'adelante', 'arriba', 'no se puede saber'], c: 'detrás y al costado', d: 3, t: 'producir' },
    { e: 'Un chico camina 3 cuadras al este y 2 al norte. ¿Qué representa mejor ese recorrido en un plano?', o: ['una línea en escalera', 'una línea recta', 'un círculo', 'un punto fijo'], c: 'una línea en escalera', d: 3, t: 'producir' },
  ],
  [ // Figuras y cuerpos
    { e: '¿Cuántos lados tiene un triángulo?', o: ['3', '4', '5', '6'], c: '3', d: 1, t: 'reconocer' },
    { e: '¿Qué cuerpo geométrico tiene forma de pelota?', o: ['esfera', 'cubo', 'cono', 'cilindro'], c: 'esfera', d: 1, t: 'reconocer' },
    { e: 'Completá: un cuadrado tiene ___ lados iguales.', o: ['4', '3', '5', '2'], c: '4', d: 2, t: 'completar' },
    { e: '¿Qué figura tiene todos los lados y ángulos iguales y 6 lados?', o: ['hexágono regular', 'pentágono', 'triángulo', 'rectángulo'], c: 'hexágono regular', d: 2, t: 'reconocer' },
    { e: 'Un tambo de leche tiene forma de…', o: ['cilindro', 'cubo', 'pirámide', 'esfera'], c: 'cilindro', d: 2, t: 'producir' },
    { e: '¿Cuál es la diferencia entre un cubo y una pirámide?', o: ['el cubo tiene todas las caras cuadradas y la pirámide no', 'son la misma figura', 'la pirámide no tiene caras', 'el cubo tiene una sola cara'], c: 'el cubo tiene todas las caras cuadradas y la pirámide no', d: 3, t: 'producir' },
  ],
  [ // Medir con instrumentos
    { e: '¿Con qué instrumento medís cuánto pesa una bolsa de harina?', o: ['balanza', 'regla', 'termómetro', 'cinta métrica'], c: 'balanza', d: 1, t: 'reconocer' },
    { e: '¿Qué unidad usarías para medir la distancia entre dos pueblos?', o: ['kilómetros', 'centímetros', 'gramos', 'litros'], c: 'kilómetros', d: 1, t: 'reconocer' },
    { e: 'Completá: para medir cuánta agua entra en un tanque se usan ___.', o: ['litros', 'metros', 'kilos', 'horas'], c: 'litros', d: 2, t: 'completar' },
    { e: '¿Qué instrumento usarías para medir el largo de un aula?', o: ['cinta métrica', 'balanza', 'termómetro', 'jarra medidora'], c: 'cinta métrica', d: 2, t: 'producir' },
    { e: 'Para saber si un chico tiene fiebre, ¿qué instrumento se usa?', o: ['termómetro', 'balanza', 'regla', 'reloj'], c: 'termómetro', d: 2, t: 'producir' },
    { e: '¿Cuál es más precisa para medir 200 gramos de yerba: una balanza de cocina o una de camión?', o: ['la de cocina', 'la de camión', 'da igual', 'ninguna sirve'], c: 'la de cocina', d: 3, t: 'producir' },
  ],
  [ // Estimar medidas
    { e: '¿Cuál es una buena estimación del largo de un aula?', o: ['8 metros', '8 centímetros', '8 kilómetros', '8 milímetros'], c: '8 metros', d: 1, t: 'reconocer' },
    { e: '¿Cuánto pesa aproximadamente una sandía?', o: ['3 kilos', '3 gramos', '30 kilos', '300 gramos'], c: '3 kilos', d: 1, t: 'reconocer' },
    { e: 'Completá: un recreo dura aproximadamente ___ minutos.', o: ['15', '150', '1', '1500'], c: '15', d: 2, t: 'completar' },
    { e: '¿Cuál es una buena estimación de cuánta agua toma un caballo por día?', o: ['30 litros', '3 litros', '300 litros', '3000 litros'], c: '30 litros', d: 2, t: 'producir' },
    { e: 'Sin usar la balanza, ¿cómo podrías estimar el peso de una bolsa de papas?', o: ['comparándola con algo que ya conozco', 'mirándola de lejos', 'contando las papas', 'no se puede estimar'], c: 'comparándola con algo que ya conozco', d: 2, t: 'producir' },
    { e: '¿Cuál es una estimación razonable de la altura de un poste de luz?', o: ['8 metros', '80 metros', '8 centímetros', '80 centímetros'], c: '8 metros', d: 3, t: 'producir' },
  ],
];

// 8 alumnos nuevos de 4° (mínimo para pasar k=5 con margen en el observatorio).
// Mismo patrón opaco de credenciales que scripts/seed.mjs; PIN propio (6001+)
// para no pisar los 1111-5555 de los alumnos semilla del mismo aula.
const ALUMNOS_G4 = [
  { name: 'Valentina', animal: 'fox', pin: '6001', email: 'alu-4a11f2@students.edutia.local' },
  { name: 'Bruno', animal: 'owl', pin: '6002', email: 'alu-8b22c4@students.edutia.local' },
  { name: 'Martina', animal: 'turtle', pin: '6003', email: 'alu-1c33d6@students.edutia.local' },
  { name: 'Ian', animal: 'cat', pin: '6004', email: 'alu-9d44e8@students.edutia.local' },
  { name: 'Delfina', animal: 'sheep', pin: '6005', email: 'alu-2e55fa@students.edutia.local' },
  { name: 'Agustín', animal: 'fox', pin: '6006', email: 'alu-6f66ac@students.edutia.local' },
  { name: 'Catalina', animal: 'owl', pin: '6007', email: 'alu-3a77be@students.edutia.local' },
  { name: 'Franco', animal: 'turtle', pin: '6008', email: 'alu-7b88d0@students.edutia.local' },
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

async function rpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return null; }
}

// crea el user de Auth (o reusa el existente si el email ya está tomado) —
// mismo patrón que seed.mjs/seed-golondrina.mjs.
const randPass = () => randomBytes(24).toString('hex');
async function ensureUser(email, password, meta) {
  const c = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  if (c.ok) return (await c.json()).id;
  const t = await c.text();
  if (c.status === 422 || /already|registered|exists/i.test(t)) {
    const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, { headers: H });
    const data = await r.json();
    const users = data?.users ?? data ?? [];
    const u = users.find?.((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
  }
  throw new Error(`create ${email}: ${c.status} ${t}`);
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

  // 1) plurigrado: Mateo y Lucía a 5°, Benja a 1° (Sofía y Tomás quedan en 3°).
  // Alumno golondrina (0022): el grado es del VÍNCULO → se escribe en la
  // matrícula activa y su trigger sincroniza perfil.grado (un update directo
  // de perfil.grado lo rechaza perfil_guard).
  for (const [nombre, grado] of [['Mateo', 5], ['Lucía', 5], ['Benja', 1]]) {
    const r = await fetch(`${URL}/rest/v1/matricula?alumno_id=eq.${porNombre[nombre]}&fecha_fin=is.null`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ grado }),
    });
    const filas = await r.json().catch(() => []);
    if (!r.ok || !Array.isArray(filas) || filas.length === 0) {
      throw new Error(`No se pudo poner a ${nombre} en ${grado}°: ¿tiene matrícula activa? (corré scripts/seed.mjs post-0022)`);
    }
  }
  console.log('✓ aula plurigrado (Benja 1° · Sofía y Tomás 3° · Mateo y Lucía 5°)');

  // 1b) 8 alumnos nuevos de 4° (Task 9): mínimo para pasar k=5 con margen en
  // el observatorio. Mismo aula única del colegio (un salón, plurigrado);
  // matrícula activa como fuente de verdad del grado (0022).
  const porNombreG4 = {};
  for (const a of ALUMNOS_G4) {
    const id = await ensureUser(a.email, randPass(), { nombre: a.name, rol: 'alumno' });
    await upsert('perfil', [{ id, rol: 'alumno', nombre: a.name, avatar: a.animal, grado: 4, escuela_id: ID.escuela, docente_id: ana.id, aula_id: ID.aula }]);
    const mExiste = await get(`matricula?alumno_id=eq.${id}&fecha_fin=is.null&select=id`);
    if (!Array.isArray(mExiste) || mExiste.length === 0) {
      await rpc('matricula_abrir', { p_alumno: id, p_escuela: ID.escuela, p_aula: ID.aula, p_docente: ana.id, p_grado: 4, p_actor: ana.id });
    }
    await rpc('set_alumno_cred', { p_perfil: id, p_aula: ID.aula, p_pin: a.pin, p_email: a.email, p_password: randPass() });
    porNombreG4[a.name] = id;
  }
  console.log(`✓ ${ALUMNOS_G4.length} alumnos nuevos de 4° (PIN 6001-600${ALUMNOS_G4.length})`);

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

  // 2b) Matemática 4° (Task 9, marco NAP): materia/programa/nodos con ids
  // fijos (nunca get-or-create por nombre), clasificados contra el catálogo
  // NAP resolviendo el id de cada tema EN LA BASE (nunca hardcodeado).
  const ejesMate = await get(`nap_eje?materia=eq.${encodeURIComponent('Matemática')}&select=id,nombre`);
  if (!ejesMate.length) throw new Error('No hay catálogo NAP de Matemática: corré antes scripts/seed-nap.mjs');
  const ejeNombrePorId = new Map(ejesMate.map((e) => [e.id, e.nombre]));
  const temasG4 = await get(`nap_tema?grado=eq.4&eje_id=in.(${ejesMate.map((e) => e.id).join(',')})&select=id,nombre,eje_id`);
  const temaIdPor = new Map(temasG4.map((t) => [`${ejeNombrePorId.get(t.eje_id)}|${t.nombre}`, t.id]));
  const napTemaIdDe = (nodo) => {
    const id = temaIdPor.get(`${nodo.eje}|${nodo.tema}`);
    if (!id) throw new Error(`No encontré el tema NAP "${nodo.tema}" (eje "${nodo.eje}") en 4° grado: revisá scripts/seed-nap.mjs`);
    return id;
  };

  await upsert('materia', [{ id: ID.materiaMate, nombre: 'Matemática' }]);
  await upsert('programa', [{
    id: ID.programaG4Mate, materia_id: ID.materiaMate, grado: 4,
    contenido: 'Sistema decimal, fracciones y decimales de uso social, operaciones, relaciones espaciales, figuras y cuerpos, medición y estimación.',
  }]);
  await upsert('sol_materia', [{
    id: ID.solG4Mate, programa_id: ID.programaG4Mate, docente_id: ana.id, escuela_id: ID.escuela, estado: 'publicado',
    perfil: {
      system_prompt: 'Sos SOL, copiloto de Matemática para 4° grado de una escuela rural de la Patagonia.',
      tono: 'cálido, alentador, rioplatense',
      criterios_eval: 'claridad, un solo procedimiento correcto, sin ambigüedades',
      ejemplos_zona: 'campo, animales, cerros de Neuquén, el almacén, el tambo',
    },
  }]);
  await upsert('nodo', ID.nodosG4Mate.map((id, i) => ({
    id, programa_id: ID.programaG4Mate, orden: i,
    nombre: NODOS_G4_MATE[i].nombre, descripcion: NODOS_G4_MATE[i].descripcion,
    nap_tema_id: napTemaIdDe(NODOS_G4_MATE[i]), nap_confianza: 1, nap_revisado: true,
  })));
  for (let i = 0; i < ID.nodosG4Mate.length; i++) {
    const ya = await get(`ejercicio?nodo_id=eq.${ID.nodosG4Mate[i]}&select=id&limit=1`);
    if (ya.length) continue; // idempotencia: no duplicar el pool
    await insert('ejercicio', POOL_G4_MATE[i].map((x) => ({
      nodo_id: ID.nodosG4Mate[i], enunciado: x.e, opciones: x.o, correcta: x.c, dificultad: x.d, tipo: x.t,
    })));
  }
  console.log('✓ Matemática 4° publicada (8 nodos = 8 temas NAP, clasificados en el seed)');

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

  // Matemática 4° (Task 9): reparto de práctica para mostrar las dos caras
  // del observatorio en la misma pantalla. Fechas dentro de los últimos 20
  // días (el rango por defecto del observatorio es 30) para que se vean sin
  // tocar el selector de rango.
  //   · G4_NODOS_FULL: los 8 alumnos practicaron → celda publicable (≥k=5).
  //   · G4_NODO_PARCIAL: solo 3 → `muestra insuficiente` con datos REALES,
  //     no un cero (la prueba visible de que el k-anonimato sigue vivo).
  //   · el resto de los nodos queda sin una sola sesión → fila en cero (un
  //     tema del marco que todavía no se enseñó también es información).
  const nodosFullMate = G4_NODOS_FULL.map((i) => ID.nodosG4Mate[i]);
  const ejsFullMate = await Promise.all(nodosFullMate.map((n) => ejsDe(n)));
  const ejsParcialMate = await ejsDe(ID.nodosG4Mate[G4_NODO_PARCIAL]);

  // Aciertos sobre 6 por alumno: mezcla de dominado/en_construcción/a_reforzar
  // (nunca un aula prolija al 100%); `rotar` cambia QUIÉN saca cada puntaje
  // en cada nodo, para que no sean siempre los mismos 3 los "dominado".
  const ACIERTOS_G4 = [6, 5, 6, 4, 5, 6, 3, 5];
  const rotar = (arr, n) => arr.map((_, i) => arr[(i + n) % arr.length]);
  const diasFull = (alumnoIdx, nodoIdx) => 2 + ((alumnoIdx * 5 + nodoIdx * 3) % 18);
  // estado derivado del % de aciertos — solo para pintar un alumno_nodo
  // realista (la regla real de dominio vive en web/lib/dominio.ts; acá es
  // dato de demostración, no el motor).
  const estadoDeAciertos = (aciertos, total = 6) => {
    const puntaje = Math.round((aciertos / total) * 100);
    const estado = puntaje >= 90 ? 'dominado' : puntaje >= 60 ? 'en_construccion' : 'a_reforzar';
    return { estado, puntaje };
  };

  const alumnoNodoG4 = [];
  G4_NODOS_FULL.forEach((_, nodoIdx) => {
    const aciertos = rotar(ACIERTOS_G4, nodoIdx);
    ALUMNOS_G4.forEach((alumno, alumnoIdx) => {
      const alumnoId = porNombreG4[alumno.name];
      armarSesion(alumnoId, nodosFullMate[nodoIdx], diasFull(alumnoIdx, nodoIdx), ejsFullMate[nodoIdx], aciertos[alumnoIdx], 6);
      alumnoNodoG4.push({ alumno_id: alumnoId, nodo_id: nodosFullMate[nodoIdx], ...estadoDeAciertos(aciertos[alumnoIdx]) });
    });
  });
  // Solo 3 de los 8 practicaron fracciones: la celda queda bajo k=5 a propósito.
  const ACIERTOS_PARCIAL = [4, 5, 3];
  const DIAS_PARCIAL = [6, 10, 14];
  ALUMNOS_G4.slice(0, 3).forEach((alumno, i) => {
    const alumnoId = porNombreG4[alumno.name];
    armarSesion(alumnoId, ID.nodosG4Mate[G4_NODO_PARCIAL], DIAS_PARCIAL[i], ejsParcialMate, ACIERTOS_PARCIAL[i], 6);
    alumnoNodoG4.push({ alumno_id: alumnoId, nodo_id: ID.nodosG4Mate[G4_NODO_PARCIAL], ...estadoDeAciertos(ACIERTOS_PARCIAL[i]) });
  });

  await insert('sesion', sesiones);
  await insert('respuesta', respuestas);
  console.log(`✓ ${sesiones.length} sesiones + ${respuestas.length} respuestas simuladas`);

  // 4) estados de nodos coherentes con las personas (+ los 35 pares de
  // Matemática 4° armados arriba, mismo puntaje que la sesión que los generó)
  await upsert('alumno_nodo', [
    { alumno_id: porNombre['Lucía'], nodo_id: ID.nodosG5[0], estado: 'dominado', puntaje: 92 },
    { alumno_id: porNombre['Lucía'], nodo_id: ID.nodosG5[1], estado: 'dominado', puntaje: 88 },
    { alumno_id: porNombre['Lucía'], nodo_id: ID.nodosG5[2], estado: 'en_construccion', puntaje: 45 },
    { alumno_id: porNombre['Mateo'], nodo_id: ID.nodosG5[0], estado: 'en_construccion', puntaje: 55 },
    { alumno_id: porNombre['Benja'], nodo_id: ID.nodosG1[0], estado: 'a_reforzar', puntaje: 25 },
    { alumno_id: porNombre['Sofía'], nodo_id: ID.nodoVocales, estado: 'en_construccion', puntaje: 50 },
    { alumno_id: porNombre['Tomás'], nodo_id: ID.nodoVocales, estado: 'en_construccion', puntaje: 30 },
    ...alumnoNodoG4,
  ].map((r) => ({ ...r, actualizado_at: hace(1) })), 'alumno_id,nodo_id');
  console.log(`✓ alumno_nodo acorde a cada persona (+ ${alumnoNodoG4.length} de Matemática 4°)`);

  console.log('\nSeed de actividad OK. Entrá como ana@edutia.ar y abrí LUNA.');
}

main().catch((e) => { console.error('SEED ERROR:', e.message); process.exit(1); });
