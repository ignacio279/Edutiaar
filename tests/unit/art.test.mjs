// Tests unitarios de las funciones puras de arte (web/lib/art.ts).
// Sin red ni DOM → corren con `npm test` (Node strippea los tipos del .ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uri, alpha, catmull, sol, animal, nodeIcon, starBadge, lockBadge, item, materiaEmblem, materiaPattern, uiIcon, NODE_ICON_KEYS } from '../../web/lib/art.ts';

test('uri: wrappea con comillas simples y escapa las internas', () => {
  const u = uri("<svg a='b'></svg>");
  assert.ok(u.startsWith("url('data:image/svg+xml,"), 'arranca con url(\' ');
  assert.ok(u.endsWith("')"), 'cierra con \')');
  const inner = u.slice("url('".length, -2);
  assert.ok(!inner.includes("'"), 'no debe quedar ninguna comilla simple sin escapar (bug que rompía style="...")');
});

test('alpha: hex → rgba', () => {
  assert.equal(alpha('#7FB069', 0.5), 'rgba(127,176,105,0.5)');
  assert.equal(alpha('#000000', 1), 'rgba(0,0,0,1)');
  assert.equal(alpha('#FFFFFF', 0.2), 'rgba(255,255,255,0.2)');
});

test('catmull: path SVG válido y vacío con <2 puntos', () => {
  assert.equal(catmull([[1, 1]]), '');
  const d = catmull([[0, 0], [10, 10], [20, 0]]);
  assert.ok(d.startsWith('M 0 0'), 'arranca con moveto');
  assert.ok(d.includes(' C '), 'tiene curvas bezier');
});

test('animal: data-uri por cada animal conocido', () => {
  for (const k of ['fox', 'owl', 'turtle', 'cat', 'sheep']) {
    const u = animal(k);
    assert.ok(u.includes('data:image/svg+xml'), `${k} es data-uri`);
    assert.ok(u.includes('svg'), `${k} contiene svg`);
  }
});

test('animal: key desconocida cae a fox', () => {
  assert.equal(animal('no-existe'), animal('fox'));
});

test('sol: distintos por estado de ánimo, todos data-uri', () => {
  const happy = sol('happy'), cheer = sol('cheer'), soft = sol('soft');
  assert.notEqual(happy, cheer);
  assert.notEqual(happy, soft);
  for (const u of [happy, cheer, soft]) assert.ok(u.includes('data:image/svg+xml'));
});

test('nodeIcon / badges: data-uri', () => {
  for (const k of ['vocales', 'silabas', 'palabras', 'oraciones', 'lectura', 'cuento']) {
    assert.ok(nodeIcon(k).includes('data:image/svg+xml'), `nodeIcon ${k}`);
  }
  assert.ok(starBadge().includes('svg'));
  assert.ok(lockBadge().includes('svg'));
});

test('NODE_ICON_KEYS: 18 claves (lengua + mate + ciencias), nodeIcon resuelve todas', () => {
  assert.equal(NODE_ICON_KEYS.length, 18);
  for (const k of NODE_ICON_KEYS) {
    assert.ok(nodeIcon(k).includes('data:image/svg+xml'), `nodeIcon ${k}`);
  }
  // clave desconocida cae a 'vocales'
  assert.equal(nodeIcon('no-existe'), nodeIcon('vocales'));
});

test('item: ilustraciones de ejercicio, todas data-uri', () => {
  for (const k of ['apples3', 'stars4', 'solcito', 'arbol', 'oveja', 'uva']) {
    const u = item(k);
    assert.ok(u.includes('data:image/svg+xml'), `item ${k}`);
    assert.ok(u.includes('svg'), `item ${k} svg`);
  }
  // clave desconocida cae a 'arbol'
  assert.equal(item('no-existe'), item('arbol'));
});

test('materiaEmblem: lengua/mate/ciencias data-uri y default lengua', () => {
  for (const k of ['lengua', 'mate', 'ciencias']) {
    assert.ok(materiaEmblem(k).includes('data:image/svg+xml'), `emblem ${k}`);
  }
  assert.equal(materiaEmblem('zzz'), materiaEmblem('lengua'));
});

test('materiaPattern: lengua/mate/ciencias data-uri', () => {
  for (const k of ['lengua', 'mate', 'ciencias']) {
    const u = materiaPattern(k);
    assert.ok(u.includes('data:image/svg+xml'), `pattern ${k}`);
  }
  // mate y ciencias son distintos del default (lengua)
  assert.notEqual(materiaPattern('mate'), materiaPattern('lengua'));
  assert.notEqual(materiaPattern('ciencias'), materiaPattern('lengua'));
});

test('uiIcon: íconos de UI data-uri y default chevron', () => {
  for (const k of ['speaker', 'people', 'mapW', 'mapI', 'sunW', 'sunI', 'chevron']) {
    assert.ok(uiIcon(k).includes('data:image/svg+xml'), `uiIcon ${k}`);
  }
  assert.equal(uiIcon('zzz'), uiIcon('chevron'));
});
