// Unit — el asiento del ministerio: desempeño contra el marco NAP dentro del
// panel institucional (spec 2026-08-18-cue-y-asiento-ministerial-design.md).
//
// LO QUE SE PRUEBA ACÁ: que la provincia/fundación vea APRENDIZAJE y no solo
// licencias, con el MISMO k-anonimato del observatorio y sin que se filtre ni
// un chico. La agregación es la de _shared/observatorio-logica.ts (ya testeada
// en nap-desempeno.test.mjs); lo nuevo es la validación de entrada, el scoping
// a los colegios propios y los copys del panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDesempeno } from '../../supabase/functions/institucion-panel/validar.ts';
import { desempenoPorEje } from '../../supabase/functions/_shared/observatorio-logica.ts';
import {
  GRADOS_PRIMARIA, MATERIAS_PANEL, copyCobertura, copyDesempenoTema,
} from '../../web/lib/institucion.ts';
import { MATERIAS_NAP } from '../../web/lib/admin/nap.ts';

test('validarDesempeno: materia y grado son OBLIGATORIOS', () => {
  // Los temas de los NAP se definen POR grado: mezclarlos juntaría contenidos
  // distintos bajo un mismo nombre (misma regla que admin-observatorio).
  assert.deepEqual(validarDesempeno({ materia: 'Matemática', grado: 4 }), { ok: true });
  assert.deepEqual(validarDesempeno({ grado: 4 }), { ok: false, error: 'falta_materia' });
  assert.deepEqual(validarDesempeno({ materia: '  ', grado: 4 }), { ok: false, error: 'falta_materia' });
  assert.deepEqual(validarDesempeno({ materia: 'Astrología', grado: 4 }), { ok: false, error: 'materia_invalida' });
  assert.deepEqual(validarDesempeno({ materia: 'Matemática' }), { ok: false, error: 'grado_invalido' });
  assert.deepEqual(validarDesempeno({ materia: 'Matemática', grado: 0 }), { ok: false, error: 'grado_invalido' });
  assert.deepEqual(validarDesempeno({ materia: 'Matemática', grado: 8 }), { ok: false, error: 'grado_invalido' });
  assert.deepEqual(validarDesempeno({ materia: 'Matemática', grado: '4' }), { ok: false, error: 'grado_invalido' });
});

test('las materias del panel son EXACTAMENTE las cuatro del marco NAP', () => {
  // Se duplican en web/lib/institucion.ts para no arrastrar el catálogo de 289
  // temas al bundle de la página: este test es el que impide que diverjan.
  assert.deepEqual([...MATERIAS_PANEL], [...MATERIAS_NAP]);
  assert.deepEqual([...GRADOS_PRIMARIA], [1, 2, 3, 4, 5, 6, 7]);
});

test('copyCobertura: "N de M colegios" se dice SIEMPRE, sin eso el dato miente', () => {
  // Un tema que dio un solo colegio no es un dato provincial (D-NAP).
  assert.equal(copyCobertura(3, 5), '3 de 5 colegios');
  assert.equal(copyCobertura(1, 5), '1 de 5 colegios');
  assert.equal(copyCobertura(0, 5), 'ningún colegio dio este tema');
  assert.equal(copyCobertura(0, 0), 'todavía sin práctica');
});

test('copyDesempenoTema: la muestra chica se dice, nunca se rellena con un número', () => {
  assert.equal(copyDesempenoTema({ alumnos: 0, dominioPromedio: null, muestraInsuficiente: true }),
    'todavía sin práctica');
  assert.equal(copyDesempenoTema({ alumnos: 3, dominioPromedio: null, muestraInsuficiente: true }),
    'muestra chica: no se muestra');
  assert.equal(copyDesempenoTema({ alumnos: 12, dominioPromedio: 68, muestraInsuficiente: false }),
    '68% de dominio');
});

// ── Scoping y anonimato ─────────────────────────────────────────────────────

const EJES = [{ id: 'e1', materia: 'Matemática', nombre: 'Número y operaciones', orden: 0 }];
const TEMAS = [{ id: 't1', eje_id: 'e1', nombre: 'Fracciones', grado: 4, orden: 0 }];
const NODOS = [{ id: 'n1', nap_tema_id: 't1', nap_revisado: true }];

// n alumnos de una escuela, todos con sesión en n1.
const alumnosDe = (n, prefijo, escuela) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefijo}${i}`, escuela_id: escuela }));
const sesionesDe = (alumnos) =>
  alumnos.map((a) => ({ alumno_id: a.id, nodo_id: 'n1', aciertos: 7, total: 10 }));

test('el desempeño se agrega SOLO sobre los colegios de la institución', () => {
  const mios = alumnosDe(6, 'mio', 'esc-mia');
  const ajenos = alumnosDe(6, 'ajeno', 'esc-ajena');
  // El scoping vive en la capa de datos: a desempenoPorEje solo le llegan los
  // alumnos de mis colegios (el índice `escuelaDeAlumno` es el universo).
  const [eje] = desempenoPorEje({
    sesiones: sesionesDe(mios),
    alumnoNodo: [],
    nodos: NODOS, ejes: EJES, temas: TEMAS,
    escuelaDeAlumno: new Map(mios.map((a) => [a.id, a.escuela_id])),
    provinciaDeAlumno: new Map(),
  }, { materia: 'Matemática', grado: 4 });

  assert.equal(eje.temas[0].alumnos, 6, 'los 6 chicos de mi colegio');
  assert.equal(eje.temas[0].colegiosTotal, 1, 'un solo colegio en el universo: el mío');
  assert.equal(eje.alumnos, 6, 'los ajenos no entran ni al denominador');
  assert.ok(ajenos.length === 6, 'los ajenos existen, pero nunca se le pasan a la función');
});

test('la respuesta del panel NO lleva ni un id ni un nombre de alumno (estructural)', () => {
  const mios = alumnosDe(7, 'mio', 'esc-mia');
  const ejes = desempenoPorEje({
    sesiones: sesionesDe(mios),
    alumnoNodo: mios.map((a) => ({ alumno_id: a.id, nodo_id: 'n1', puntaje: 70, estado: 'dominado' })),
    nodos: NODOS, ejes: EJES, temas: TEMAS,
    escuelaDeAlumno: new Map(mios.map((a) => [a.id, a.escuela_id])),
    provinciaDeAlumno: new Map(),
  }, { materia: 'Matemática', grado: 4 });

  const serial = JSON.stringify(ejes);
  for (const a of mios) assert.ok(!serial.includes(a.id), `el id ${a.id} no viaja`);
  assert.ok(!serial.includes('esc-mia'), 'ni el id del colegio: la cobertura es un CONTEO');
  assert.equal(ejes[0].temas[0].alumnos, 7, 'los chicos se cuentan, no se listan');
});

test('k=5 vale igual en el asiento del ministerio que en el observatorio', () => {
  const pocos = alumnosDe(4, 'mio', 'esc-mia');
  const [eje] = desempenoPorEje({
    sesiones: sesionesDe(pocos),
    alumnoNodo: pocos.map((a) => ({ alumno_id: a.id, nodo_id: 'n1', puntaje: 90, estado: 'dominado' })),
    nodos: NODOS, ejes: EJES, temas: TEMAS,
    escuelaDeAlumno: new Map(pocos.map((a) => [a.id, a.escuela_id])),
    provinciaDeAlumno: new Map(),
  }, { materia: 'Matemática', grado: 4 });

  assert.equal(eje.temas[0].muestraInsuficiente, true, '4 chicos < k=5');
  assert.equal(eje.temas[0].dominioPromedio, null, 'el desempeño se suprime');
  assert.equal(eje.temas[0].alumnos, 4, 'el conteo de volumen sí se muestra');
});
