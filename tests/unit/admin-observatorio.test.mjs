// Tests de WP-A — Observatorio educativo (fase "Observatorio y avisos"): TODA
// la lógica pura de supabase/functions/admin-observatorio/observatorio-logica.ts
// con datasets sintéticos (sin new Date() adentro de las funciones →
// determinístico). La Edge Function admin-observatorio agrega SERVER-SIDE con
// estas mismas funciones (D-OA3: las filas crudas llevan alumno_id y no pueden
// viajar al browser), por eso la lógica se testea UNA sola vez, acá.
// Correr: npm test (o node --test tests/unit/admin-observatorio.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  K_ANONIMATO, MIN_RESPUESTAS_TEMA, TOP_TEMAS,
  normalizarTema, indexarCurriculo, agregarPorProvincia, agregarPorMateria,
  topTemasQueCuestan,
} from '../../supabase/functions/admin-observatorio/observatorio-logica.ts';

// ── Fixtures chicos y reutilizables ─────────────────────────────────────────

// n sesiones de n alumnos DISTINTOS en la misma escuela, aciertos/total fijos.
const sesionesDe = (n, prefijo, nodo = null, aciertos = 8, total = 10) =>
  Array.from({ length: n }, (_, i) => ({
    alumno_id: `${prefijo}${i}`, nodo_id: nodo, aciertos, total,
  }));

const alumnosDe = (n, prefijo, escuela) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefijo}${i}`, grado: 3, escuela_id: escuela }));

// Currículo mínimo: 1 materia, 1 programa de 3°, 2 nodos.
const CURRICULO = indexarCurriculo(
  [
    { id: 'n1', nombre: 'Sustantivos comunes', programa_id: 'p1' },
    { id: 'n2', nombre: 'Verbos', programa_id: 'p1' },
  ],
  [{ id: 'p1', materia_id: 'm1', grado: 3 }],
  [{ id: 'm1', nombre: 'Lengua' }],
);

const SIN_PROVINCIAS = new Map(); // provinciaDeAlumno vacío (sin filtro no molesta)

// ── normalizarTema ──────────────────────────────────────────────────────────

test('normalizarTema: trim + lowercase + colapsa espacios múltiples', () => {
  assert.equal(normalizarTema('  Sustantivos   Comunes '), 'sustantivos comunes');
  assert.equal(normalizarTema('VERBOS'), 'verbos');
  assert.equal(normalizarTema('un\ttema  con\n espacios'), 'un tema con espacios');
});

test('normalizarTema: los acentos quedan intactos', () => {
  assert.equal(normalizarTema('  Ortografía: tilde en AGUDAS  '), 'ortografía: tilde en agudas');
  assert.notEqual(normalizarTema('Ortografía'), 'ortografia');
});

// ── indexarCurriculo ────────────────────────────────────────────────────────

test('indexarCurriculo: arma la cadena nodo→programa→materia', () => {
  assert.deepEqual(CURRICULO.get('n1'), { materia: 'Lengua', grado: 3 });
  assert.deepEqual(CURRICULO.get('n2'), { materia: 'Lengua', grado: 3 });
});

test('indexarCurriculo: nodo con cadena rota queda excluido', () => {
  const idx = indexarCurriculo(
    [
      { id: 'ok', nombre: 'Bien', programa_id: 'p1' },
      { id: 'sinProg', nombre: 'Huérfano', programa_id: 'pX' }, // programa inexistente
      { id: 'sinMat', nombre: 'Colgado', programa_id: 'p2' }, // programa sin materia
    ],
    [
      { id: 'p1', materia_id: 'm1', grado: 3 },
      { id: 'p2', materia_id: 'mX', grado: 5 }, // materia inexistente
    ],
    [{ id: 'm1', nombre: 'Lengua' }],
  );
  assert.ok(idx.has('ok'));
  assert.equal(idx.has('sinProg'), false, 'sin programa → excluido');
  assert.equal(idx.has('sinMat'), false, 'sin materia → excluido');
});

test('indexarCurriculo: dedup case-insensitive de materia con la capitalización más frecuente', () => {
  const idx = indexarCurriculo(
    [
      { id: 'n1', nombre: 'A', programa_id: 'p1' },
      { id: 'n2', nombre: 'B', programa_id: 'p2' },
      { id: 'n3', nombre: 'C', programa_id: 'p3' },
    ],
    [
      { id: 'p1', materia_id: 'm1', grado: 3 },
      { id: 'p2', materia_id: 'm2', grado: 5 },
      { id: 'p3', materia_id: 'm3', grado: 1 },
    ],
    // "matemática" aparece 2 veces en minúscula y 1 capitalizada → gana la minúscula.
    [
      { id: 'm1', nombre: 'matemática' },
      { id: 'm2', nombre: 'Matemática' },
      { id: 'm3', nombre: 'matemática' },
    ],
  );
  assert.equal(idx.get('n1').materia, 'matemática');
  assert.equal(idx.get('n2').materia, 'matemática', 'las tres variantes agrupan al mismo display');
  assert.equal(idx.get('n3').materia, 'matemática');
});

test('indexarCurriculo: en empate de capitalizaciones gana la primera vista', () => {
  const idx = indexarCurriculo(
    [{ id: 'n1', nombre: 'A', programa_id: 'p1' }, { id: 'n2', nombre: 'B', programa_id: 'p2' }],
    [{ id: 'p1', materia_id: 'm1', grado: 3 }, { id: 'p2', materia_id: 'm2', grado: 3 }],
    [{ id: 'm1', nombre: 'Lengua' }, { id: 'm2', nombre: 'LENGUA' }],
  );
  assert.equal(idx.get('n2').materia, 'Lengua', '1-1: gana "Lengua" (primera vista)');
});

// ── agregarPorProvincia ─────────────────────────────────────────────────────

const escuelaEn = (id, provincia) => ({ id, provincia });

test('k-anonimato de borde: 4 alumnos → precision null + muestraInsuficiente', () => {
  const { filas } = agregarPorProvincia({
    escuelas: [escuelaEn('e1', 'Salta')],
    alumnos: alumnosDe(4, 'a', 'e1'),
    sesiones: sesionesDe(4, 'a'),
  }, K_ANONIMATO);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].alumnosActivos, 4);
  assert.equal(filas[0].precision, null);
  assert.equal(filas[0].muestraInsuficiente, true);
});

test('k-anonimato de borde: 5 alumnos → precisión numérica + flag en false', () => {
  const { filas } = agregarPorProvincia({
    escuelas: [escuelaEn('e1', 'Salta')],
    alumnos: alumnosDe(5, 'a', 'e1'),
    sesiones: sesionesDe(5, 'a'), // 8/10 cada una
  }, K_ANONIMATO);
  assert.equal(filas[0].alumnosActivos, 5);
  assert.equal(filas[0].precision, 80);
  assert.equal(filas[0].muestraInsuficiente, false);
});

test('precisión con total 0 → null, nunca NaN', () => {
  const { filas } = agregarPorProvincia({
    escuelas: [escuelaEn('e1', 'Chaco')],
    alumnos: alumnosDe(5, 'a', 'e1'),
    sesiones: sesionesDe(5, 'a', null, 0, 0), // sesiones sin respuestas
  }, K_ANONIMATO);
  assert.equal(filas[0].precision, null);
  assert.equal(filas[0].muestraInsuficiente, false, 'hay 5 alumnos: no es problema de muestra');
  assert.ok(!JSON.stringify(filas).includes('NaN'));
});

test('agregarPorProvincia: bucket sinProvincia cuenta colegios y sus sesiones no ensucian filas', () => {
  const { filas, sinProvincia } = agregarPorProvincia({
    escuelas: [escuelaEn('e1', 'Jujuy'), escuelaEn('e2', null), escuelaEn('e3', null)],
    alumnos: [...alumnosDe(5, 'a', 'e1'), ...alumnosDe(3, 'b', 'e2')],
    sesiones: [...sesionesDe(5, 'a'), ...sesionesDe(3, 'b')],
  }, K_ANONIMATO);
  assert.equal(sinProvincia.colegios, 2);
  assert.equal(filas.length, 1, 'solo Jujuy tiene fila');
  assert.equal(filas[0].sesiones, 5, 'las sesiones de e2 (sin provincia) quedaron afuera');
});

test('agregarPorProvincia: alumnos activos DISTINTOS (repetir sesión no suma alumnos)', () => {
  const { filas } = agregarPorProvincia({
    escuelas: [escuelaEn('e1', 'Formosa')],
    alumnos: alumnosDe(2, 'a', 'e1'),
    sesiones: [
      { alumno_id: 'a0', aciertos: 1, total: 2 },
      { alumno_id: 'a0', aciertos: 2, total: 2 },
      { alumno_id: 'a1', aciertos: 1, total: 1 },
    ],
  }, K_ANONIMATO);
  assert.equal(filas[0].alumnosActivos, 2, 'a0 con 2 sesiones cuenta una vez');
  assert.equal(filas[0].sesiones, 3);
});

test('agregarPorProvincia: todo vacío → filas [] y sinProvincia 0', () => {
  const r = agregarPorProvincia({ escuelas: [], alumnos: [], sesiones: [] }, K_ANONIMATO);
  assert.deepEqual(r, { filas: [], sinProvincia: { colegios: 0 } });
});

// ── agregarPorMateria ───────────────────────────────────────────────────────

test('agregarPorMateria: celda materia×grado con precisión y dominio promedio redondeado', () => {
  const filas = agregarPorMateria({
    sesiones: sesionesDe(5, 'a', 'n1'), // 8/10 × 5 en Lengua 3°
    curriculo: CURRICULO,
    alumnoNodo: [
      { alumno_id: 'a0', nodo_id: 'n1', puntaje: 70 },
      { alumno_id: 'a1', nodo_id: 'n1', puntaje: 55 },
      { alumno_id: 'zz', nodo_id: 'nX', puntaje: 99 }, // nodo fuera del currículo: no cuenta
    ],
    provinciaDeAlumno: SIN_PROVINCIAS,
  }, K_ANONIMATO);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].materia, 'Lengua');
  assert.equal(filas[0].grado, 3);
  assert.equal(filas[0].alumnos, 5);
  assert.equal(filas[0].precision, 80);
  assert.equal(filas[0].dominioPromedio, 63, '(70+55)/2 = 62.5 → 63');
  assert.equal(filas[0].muestraInsuficiente, false);
});

test('agregarPorMateria: filtroProvincia acota por la provincia del alumno', () => {
  const provinciaDeAlumno = new Map([
    ['a0', 'Salta'], ['a1', 'Salta'], ['a2', 'Chaco'],
  ]);
  const filas = agregarPorMateria({
    sesiones: [
      { alumno_id: 'a0', nodo_id: 'n1', aciertos: 5, total: 10 },
      { alumno_id: 'a1', nodo_id: 'n1', aciertos: 5, total: 10 },
      { alumno_id: 'a2', nodo_id: 'n1', aciertos: 10, total: 10 },
    ],
    curriculo: CURRICULO,
    alumnoNodo: [],
    provinciaDeAlumno,
  }, 1, 'Salta'); // k=1 para mirar la precisión de la celda filtrada
  assert.equal(filas.length, 1);
  assert.equal(filas[0].alumnos, 2, 'a2 (Chaco) quedó afuera');
  assert.equal(filas[0].precision, 50, 'sin el 100% de a2');
});

test('agregarPorMateria: menos de k alumnos → precisión Y dominio null + flag', () => {
  const filas = agregarPorMateria({
    sesiones: sesionesDe(4, 'a', 'n1'),
    curriculo: CURRICULO,
    alumnoNodo: [{ alumno_id: 'a0', nodo_id: 'n1', puntaje: 90 }],
    provinciaDeAlumno: SIN_PROVINCIAS,
  }, K_ANONIMATO);
  assert.equal(filas[0].precision, null);
  assert.equal(filas[0].dominioPromedio, null, 'el dominio también respeta el k');
  assert.equal(filas[0].muestraInsuficiente, true);
});

test('agregarPorMateria: sin sesiones → [] (celda vacía no existe, nunca NaN)', () => {
  const filas = agregarPorMateria({
    sesiones: [],
    curriculo: CURRICULO,
    alumnoNodo: [{ alumno_id: 'a0', nodo_id: 'n1', puntaje: 90 }],
    provinciaDeAlumno: SIN_PROVINCIAS,
  }, K_ANONIMATO);
  assert.deepEqual(filas, []);
});

// ── topTemasQueCuestan ──────────────────────────────────────────────────────

const NODOS = [
  { id: 'n1', nombre: 'Sustantivos comunes', programa_id: 'p1' },
  { id: 'n2', nombre: 'Verbos', programa_id: 'p1' },
];
const FILTRO = { materia: 'Lengua', grado: 3 };

test('topTemasQueCuestan: piso de respuestas (< MIN_RESPUESTAS_TEMA queda afuera)', () => {
  const r = topTemasQueCuestan({
    // n1: 5 alumnos × 4 respuestas = 20 (entra justo); n2: 5 × 3 = 15 (afuera).
    sesiones: [...sesionesDe(5, 'a', 'n1', 2, 4), ...sesionesDe(5, 'a', 'n2', 2, 3)],
    nodos: NODOS,
    curriculo: CURRICULO,
    provinciaDeAlumno: SIN_PROVINCIAS,
  }, FILTRO, K_ANONIMATO);
  assert.equal(r.temas.length, 1);
  assert.equal(r.temas[0].tema, 'sustantivos comunes');
  assert.equal(r.temas[0].respuestas, MIN_RESPUESTAS_TEMA);
});

test('topTemasQueCuestan: piso de k alumnos distintos', () => {
  const r = topTemasQueCuestan({
    // 4 alumnos con muchas respuestas: pasa el piso de respuestas pero no el k.
    sesiones: sesionesDe(4, 'a', 'n1', 5, 10),
    nodos: NODOS,
    curriculo: CURRICULO,
    provinciaDeAlumno: SIN_PROVINCIAS,
  }, FILTRO, K_ANONIMATO);
  assert.deepEqual(r.temas, []);
});

test('topTemasQueCuestan: ordena por precisión ASCENDENTE y marca aproximado', () => {
  const r = topTemasQueCuestan({
    sesiones: [
      ...sesionesDe(5, 'a', 'n1', 9, 10), // 90%: cuesta poco
      ...sesionesDe(5, 'a', 'n2', 3, 10), // 30%: cuesta mucho → primero
    ],
    nodos: NODOS,
    curriculo: CURRICULO,
    provinciaDeAlumno: SIN_PROVINCIAS,
  }, FILTRO, K_ANONIMATO);
  assert.equal(r.aproximado, true);
  assert.deepEqual(r.temas.map((t) => t.tema), ['verbos', 'sustantivos comunes']);
  assert.equal(r.temas[0].precision, 30);
  assert.equal(r.temas[0].alumnos, 5);
});

test('topTemasQueCuestan: corta en TOP_TEMAS', () => {
  const cantidad = TOP_TEMAS + 3;
  const nodos = Array.from({ length: cantidad }, (_, i) => ({ id: `t${i}`, nombre: `Tema ${i}`, programa_id: 'p1' }));
  const curriculo = indexarCurriculo(nodos, [{ id: 'p1', materia_id: 'm1', grado: 3 }], [{ id: 'm1', nombre: 'Lengua' }]);
  const sesiones = nodos.flatMap((n, i) => sesionesDe(5, 'a', n.id, i, 20)); // precisiones distintas
  const r = topTemasQueCuestan({ sesiones, nodos, curriculo, provinciaDeAlumno: SIN_PROVINCIAS }, FILTRO, K_ANONIMATO);
  assert.equal(r.temas.length, TOP_TEMAS);
  assert.equal(r.temas[0].tema, 'tema 0', 'el de menor precisión primero');
});

test('topTemasQueCuestan: agrupa por nombre normalizado entre colegios', () => {
  const nodos = [
    { id: 'x1', nombre: '  Sustantivos   comunes ', programa_id: 'p1' },
    { id: 'x2', nombre: 'SUSTANTIVOS COMUNES', programa_id: 'p1' },
  ];
  const curriculo = indexarCurriculo(nodos, [{ id: 'p1', materia_id: 'm1', grado: 3 }], [{ id: 'm1', nombre: 'Lengua' }]);
  const r = topTemasQueCuestan({
    sesiones: [...sesionesDe(3, 'a', 'x1', 2, 10), ...sesionesDe(3, 'b', 'x2', 2, 10)],
    nodos, curriculo, provinciaDeAlumno: SIN_PROVINCIAS,
  }, FILTRO, K_ANONIMATO);
  assert.equal(r.temas.length, 1, 'las dos escrituras son el mismo tema');
  assert.equal(r.temas[0].tema, 'sustantivos comunes');
  assert.equal(r.temas[0].alumnos, 6);
  assert.equal(r.temas[0].respuestas, 60);
});

// ── Anonimato estructural (D-OA3) ───────────────────────────────────────────

test('anonimato estructural: ningún agregador devuelve claves nombre / alumno_id / perfil_id', () => {
  const alumnos = alumnosDe(6, 'a', 'e1');
  const sesiones = sesionesDe(6, 'a', 'n1');
  const salidas = [
    agregarPorProvincia({ escuelas: [escuelaEn('e1', 'Salta')], alumnos, sesiones }, K_ANONIMATO),
    agregarPorMateria({
      sesiones, curriculo: CURRICULO,
      alumnoNodo: [{ alumno_id: 'a0', nodo_id: 'n1', puntaje: 50 }],
      provinciaDeAlumno: SIN_PROVINCIAS,
    }, K_ANONIMATO),
    topTemasQueCuestan(
      { sesiones: sesionesDe(6, 'a', 'n1', 5, 10), nodos: NODOS, curriculo: CURRICULO, provinciaDeAlumno: SIN_PROVINCIAS },
      FILTRO, K_ANONIMATO,
    ),
  ];
  const texto = JSON.stringify(salidas);
  for (const prohibida of ['"nombre"', '"alumno_id"', '"perfil_id"']) {
    assert.ok(!texto.includes(prohibida), `la salida no lleva la clave ${prohibida}`);
  }
});
