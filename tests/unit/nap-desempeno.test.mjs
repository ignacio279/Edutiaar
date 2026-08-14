import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desempenoPorEje, K_ANONIMATO } from '../../supabase/functions/admin-observatorio/observatorio-logica.ts';

// Catálogo mínimo: 1 eje de Matemática 4° con 2 temas.
const EJES = [{ id: 'e1', materia: 'Matemática', nombre: 'Número y operaciones', orden: 0 }];
const TEMAS = [
  { id: 't1', eje_id: 'e1', nombre: 'Fracciones', grado: 4, orden: 0 },
  { id: 't2', eje_id: 'e1', nombre: 'Suma y resta', grado: 4, orden: 1 },
];
// n1 → t1, n2 → t2, n3 fuera del marco.
const NODOS = [
  { id: 'n1', nap_tema_id: 't1' },
  { id: 'n2', nap_tema_id: 't2' },
  { id: 'n3', nap_tema_id: null },
];

// k alumnos de una escuela, todos con sesión en el nodo dado.
const sesiones = (n, prefijo, nodo, escuela, aciertos = 7, total = 10) =>
  Array.from({ length: n }, (_, i) => ({
    alumno_id: `${prefijo}${i}`, nodo_id: nodo, aciertos, total, escuela_id: escuela,
  }));
const mapaEscuela = (...grupos) => {
  const m = new Map();
  for (const [n, prefijo, escuela] of grupos) {
    for (let i = 0; i < n; i++) m.set(`${prefijo}${i}`, escuela);
  }
  return m;
};
const base = (extra = {}) => ({
  sesiones: [], alumnoNodo: [], nodos: NODOS, ejes: EJES, temas: TEMAS,
  escuelaDeAlumno: new Map(), provinciaDeAlumno: new Map(), ...extra,
});

test('un tema del catálogo sin práctica aparece igual, con 0 alumnos', () => {
  const [eje] = desempenoPorEje(base(), { materia: 'Matemática', grado: 4 });
  assert.equal(eje.temas.length, 2);
  assert.deepEqual(eje.temas.map((t) => t.tema), ['Fracciones', 'Suma y resta']);
  assert.equal(eje.temas[0].alumnos, 0);
  assert.equal(eje.temas[0].precision, null);
});

test('los nodos fuera del marco no entran en ningún agregado', () => {
  const datos = base({
    sesiones: [
      ...sesiones(6, 'a', 'n1', 'esc1'), // nodo CON tema NAP
      ...sesiones(6, 'b', 'n3', 'esc2'), // nodo SIN tema NAP
    ],
    escuelaDeAlumno: mapaEscuela([6, 'a', 'esc1'], [6, 'b', 'esc2']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  assert.equal(eje.alumnos, 6, 'solo los de n1 cuentan');
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.colegiosTotal, 1, 'esc2 no cuenta en el denominador de cobertura');
  assert.equal(t1.colegiosConTema, 1, 'solo esc1 practica el tema');
});

test('un tema con menos de k alumnos no publica métricas', () => {
  const datos = base({
    sesiones: sesiones(K_ANONIMATO - 1, 'a', 'n1', 'esc1'),
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO - 1, 'a', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.muestraInsuficiente, true);
  assert.equal(t1.precision, null);
  assert.equal(t1.dominioPromedio, null);
  assert.equal(t1.alumnos, K_ANONIMATO - 1, 'el conteo de volumen sí se muestra');
});

test('con k alumnos o más publica precisión y dominio', () => {
  const datos = base({
    sesiones: sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 7, 10),
    alumnoNodo: Array.from({ length: K_ANONIMATO }, (_, i) => ({
      alumno_id: `a${i}`, nodo_id: 'n1', puntaje: 60, estado: i === 0 ? 'dominado' : 'en_progreso',
    })),
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.muestraInsuficiente, false);
  assert.equal(t1.precision, 70);
  assert.equal(t1.dominioPromedio, 60);
  assert.equal(t1.dominados, 20, '1 de 5 alumnos dominó → 20%');
});

test('cobertura: solo cuentan los colegios que dan el tema, y nunca como cero', () => {
  // esc1 practica t1; esc2 solo practica t2. t1 debe decir "1 de 2 colegios"
  // y su promedio NO debe diluirse con esc2.
  const datos = base({
    sesiones: [
      ...sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 9, 10),
      ...sesiones(K_ANONIMATO, 'b', 'n2', 'esc2', 3, 10),
    ],
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1'], [K_ANONIMATO, 'b', 'esc2']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.colegiosConTema, 1);
  assert.equal(t1.colegiosTotal, 2);
  assert.equal(t1.precision, 90, 'esc2 no da el tema: no diluye');
});

test('un nodo publicado pero nunca practicado no cuenta como dar el tema', () => {
  const datos = base({
    alumnoNodo: [{ alumno_id: 'z0', nodo_id: 'n1', puntaje: 50, estado: 'en_progreso' }],
    escuelaDeAlumno: mapaEscuela([1, 'z', 'esc9']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.colegiosConTema, 0, 'sin sesiones no hay tema dado');
});

test('el eje pondera por alumnos con dato, solo sobre temas que pasan k', () => {
  // t1: 10 alumnos al 90%. t2: 4 alumnos (bajo k) al 10% → no debe mover el eje.
  const datos = base({
    sesiones: [
      ...sesiones(10, 'a', 'n1', 'esc1', 9, 10),
      ...sesiones(4, 'b', 'n2', 'esc1', 1, 10),
    ],
    escuelaDeAlumno: mapaEscuela([10, 'a', 'esc1'], [4, 'b', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  assert.equal(eje.precision, 90, 'el tema bajo k queda fuera del promedio del eje');
});

test('el filtro de provincia acota por la provincia del alumno', () => {
  const datos = base({
    sesiones: [
      ...sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 9, 10),
      ...sesiones(K_ANONIMATO, 'b', 'n1', 'esc2', 1, 10),
    ],
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1'], [K_ANONIMATO, 'b', 'esc2']),
    provinciaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'Neuquén'], [K_ANONIMATO, 'b', 'Chaco']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4, provincia: 'Neuquén' });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.precision, 90);
  assert.equal(t1.colegiosTotal, 1, 'Chaco queda fuera del universo');
});

test('otro grado o materia no devuelve filas', () => {
  const vacio = desempenoPorEje(base(), { materia: 'Lengua', grado: 4 });
  assert.deepEqual(vacio, []);
  const otroGrado = desempenoPorEje(base(), { materia: 'Matemática', grado: 7 });
  assert.deepEqual(otroGrado, []);
});

test('dominados nunca supera el 100% ni mezcla poblaciones', () => {
  // 5 alumnos con sesión en ventana: a0..a4
  // Solo a0 dominó en la ventana
  // PERO hay un sexto alumno viejo0 que dominó EN OTRO MOMENTO (sin sesión en ventana)
  const datos = base({
    sesiones: sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 7, 10),
    alumnoNodo: [
      // 5 alumnos con sesión: solo a0 dominó
      ...Array.from({ length: K_ANONIMATO }, (_, i) => ({
        alumno_id: `a${i}`, nodo_id: 'n1', puntaje: 60, estado: i === 0 ? 'dominado' : 'en_progreso',
      })),
      // 1 alumno VIEJO que dominó pero NO tiene sesiones en ventana
      { alumno_id: 'viejo0', nodo_id: 'n1', puntaje: 60, estado: 'dominado' },
    ],
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1'], [1, 'viejo', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.alumnos, K_ANONIMATO, 'solo los de sesiones cuentan en la población');
  assert.equal(t1.dominados, 20, '1 de 5 = 20%, no 2 de 6 = 33%');
  assert(t1.dominados <= 100, 'dominados nunca puede superar 100%');
});

test('ninguna respuesta lleva ids ni nombres de alumnos', () => {
  const datos = base({
    sesiones: sesiones(K_ANONIMATO, 'a', 'n1', 'esc1'),
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1']),
  });
  const salida = JSON.stringify(desempenoPorEje(datos, { materia: 'Matemática', grado: 4 }));
  assert.equal(/"a\d"/.test(salida), false, 'se filtró un alumno_id');
  assert.equal(salida.includes('esc1'), false, 'se filtró un escuela_id');
});
