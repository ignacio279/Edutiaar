import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO_NAP, MATERIAS_NAP } from '../../supabase/functions/_shared/nap.ts';
import { CATALOGO_NAP as ESPEJO, MATERIAS_NAP as ESPEJO_MATERIAS } from '../../web/lib/admin/nap.ts';

test('las materias son exactamente las cuatro del marco', () => {
  assert.deepEqual([...MATERIAS_NAP].sort(),
    ['Ciencias Naturales', 'Ciencias Sociales', 'Lengua', 'Matemática'].sort());
});

test('todo eje declara una materia del marco y al menos un tema', () => {
  // El catálogo arranca vacío (Task 2b lo llena desde las fuentes oficiales).
  // Este test NO exige que tenga contenido: valida la forma de lo que haya.
  for (const eje of CATALOGO_NAP) {
    assert.ok(MATERIAS_NAP.includes(eje.materia), `materia fuera del marco: ${eje.materia}`);
    assert.ok(eje.temas.length > 0, `eje sin temas: ${eje.nombre}`);
    assert.ok(typeof eje.orden === 'number', `eje sin orden: ${eje.nombre}`);
    for (const t of eje.temas) {
      assert.ok(t.grado >= 1 && t.grado <= 7, `grado inválido en ${t.nombre}`);
      assert.ok(t.nombre.trim().length > 0, 'tema sin nombre');
      assert.ok(typeof t.orden === 'number', `tema sin orden: ${t.nombre}`);
    }
  }
});

test('no hay ejes duplicados por materia+nombre', () => {
  const claves = CATALOGO_NAP.map((e) => `${e.materia}|${e.nombre}`);
  assert.equal(new Set(claves).size, claves.length, 'eje duplicado');
});

test('no hay temas duplicados dentro de un eje y grado', () => {
  for (const eje of CATALOGO_NAP) {
    const claves = eje.temas.map((t) => `${t.nombre}|${t.grado}`);
    assert.equal(new Set(claves).size, claves.length, `tema duplicado en ${eje.nombre}`);
  }
});

test('el espejo del front es idéntico al del server', () => {
  assert.deepEqual(ESPEJO, CATALOGO_NAP);
  assert.deepEqual([...ESPEJO_MATERIAS], [...MATERIAS_NAP]);
});

test('todo tema tiene texto oficial, fuente y etiqueta corta', () => {
  for (const eje of CATALOGO_NAP) {
    for (const t of eje.temas) {
      assert.ok(t.textoOficial.trim().length > 20, `texto oficial vacío o muy corto: ${t.nombre}`);
      assert.ok(/^https?:\/\//.test(t.fuente), `fuente sin URL: ${t.nombre}`);
      assert.ok(t.nombre.split(/\s+/).length <= 6, `etiqueta demasiado larga: ${t.nombre}`);
      assert.ok(t.nombre !== t.textoOficial, `la etiqueta no puede ser el texto oficial: ${t.nombre}`);
    }
  }
});

test('ningún texto oficial quedó con guiones de corte del PDF', () => {
  for (const eje of CATALOGO_NAP) {
    for (const t of eje.temas) {
      assert.equal(/[a-záéíóúñ]-\s/.test(t.textoOficial), false,
        `guion de corte sin unir en: ${t.nombre} → ${t.textoOficial.slice(0, 80)}`);
      assert.equal(/\n/.test(t.textoOficial), false, `salto de línea sin colapsar en: ${t.nombre}`);
    }
  }
});

test('el catálogo cubre los grados 1 a 7 en las cuatro materias', () => {
  for (const materia of MATERIAS_NAP) {
    for (let grado = 1; grado <= 7; grado++) {
      const hay = CATALOGO_NAP.some((e) => e.materia === materia && e.temas.some((t) => t.grado === grado));
      assert.ok(hay, `falta ${materia} en ${grado}°`);
    }
  }
});

// Normalización para comparar el catálogo contra el PDF extraído. Empareja las
// diferencias de MAQUETACIÓN sin tocar el contenido:
//  - une los guiones de corte de fin de renglón ("designa-\nción")
//  - colapsa saltos de línea y espacios múltiples
//  - saca el espacio antes de puntuación que mete el PDF ("transporte , y")
//  - saca los dígitos de nota al pie PEGADOS a una palabra ("taller11" -> "taller"),
//    que es lo que el Segundo Ciclo usa como marcador. Ojo: solo los pegados;
//    los números sueltos del texto (años como "1820") se conservan, porque son
//    contenido y su pérdida SÍ tiene que hacer fallar el test.
//  - saca TODOS los guiones que queden, de los dos lados de la comparación. Es
//    la única forma de que el guión REAL de una palabra compuesta
//    ("morfo-fisiológicas") y el guión de corte de renglón que el PDF mete en
//    ese mismo lugar se vuelvan indistinguibles. No perdemos cobertura: la
//    higiene de guiones ya la cubre el test "ningún texto oficial quedó con
//    guiones de corte del PDF".
//  - baja a minúsculas y saca acentos
function normalizar(s) {
  return s
    .replace(/([a-záéíóúñ])-\s+/gi, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.:])/g, '$1')
    .replace(/([a-záéíóúñ])[0-9]{1,2}\b/gi, '$1')
    .replace(/-/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const DIR = path.join(import.meta.dirname, '../fixtures/nap');
const FUENTES = normalizar(
  fs.readFileSync(path.join(DIR, 'primer-ciclo.txt'), 'utf8') + '\n|||\n' +
  fs.readFileSync(path.join(DIR, 'segundo-ciclo.txt'), 'utf8'),
);

test('cada texto oficial existe textualmente en el documento fuente', () => {
  const huerfanos = [];
  for (const eje of CATALOGO_NAP) {
    for (const t of eje.temas) {
      // 150 caracteres identifican el bloque sin volverse frágil ante
      // diferencias de cola: cuanto más larga la aguja, más difícil que un
      // texto alterado pase de casualidad.
      const aguja = normalizar(t.textoOficial).slice(0, 150);
      if (!FUENTES.includes(aguja)) huerfanos.push(`${eje.materia} ${t.grado}° · ${t.nombre}`);
    }
  }
  assert.deepEqual(huerfanos, [],
    `estos temas no aparecen en los documentos oficiales:\n  ${huerfanos.join('\n  ')}`);
});

test('el catálogo no quedó vacío ni se encogió sin querer', () => {
  const temas = CATALOGO_NAP.reduce((n, e) => n + e.temas.length, 0);
  assert.ok(temas >= 289, `el catálogo tiene ${temas} temas; se esperaban al menos 289`);
});
