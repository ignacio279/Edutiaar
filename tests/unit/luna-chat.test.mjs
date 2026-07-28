// Unit de luna-chat: system prompt con contexto del aula, historial, roles y
// limpieza de párrafos. node --test, sin deps. Importa el .ts directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recortarHistorial, aMensajesClaude, construirSystemLuna, aParrafos,
  momentoDelAnio, haceCuanto, sanearAlertas,
} from '../../supabase/functions/luna-chat/chat.ts';

const CTX = {
  docenteNombre: 'Ana',
  grados: [1, 3, 5],
  alumnos: [
    { nombre: 'Lucía', grado: 5, estado: 'va muy bien', ultimaPractica: 'ayer', precisionReciente: 92 },
    { nombre: 'Benja', grado: 1, estado: 'a reforzar', ultimaPractica: 'hoy', precisionReciente: 35 },
  ],
  alertas: [{ alumno: 'Benja', prioridad: 'alta', detalle: 'Bajó la precisión en Las vocales' }],
  programa: [{ materia: 'Lengua (5°)', nodos: ['Verbos', 'Tildes'] }],
  momento: 'julio de 2026, mitad del ciclo lectivo (receso invernal cerca o en curso)',
};

// --- construirSystemLuna ---

test('system: persona LUNA + cláusulas de plurigrado, no-invención y honestidad', () => {
  const s = construirSystemLuna(CTX);
  assert.match(s, /Sos LUNA/);
  assert.match(s, /docente Ana/);
  assert.match(s, /UN eje común y actividades en varios niveles/); // plurigrado
  assert.match(s, /no inventes/);
  assert.match(s, /no hay datos aún/); // aula sin actividad → honestidad
  assert.match(s, /1°, 3°, 5°/);
  assert.match(s, /La decisión final es siempre de la docente/);
});

test('system: lleva las líneas de alumnos, alertas y programa', () => {
  const s = construirSystemLuna(CTX);
  assert.match(s, /Lucía \(5°\), va muy bien, última práctica ayer, precisión reciente 92%/);
  assert.match(s, /\[alta\] Benja: Bajó la precisión en Las vocales/);
  assert.match(s, /Programa de Lengua \(5°\): Verbos, Tildes/);
});

test('system: aula vacía → lo dice, sin inventar alumnos ni alertas', () => {
  const s = construirSystemLuna({ ...CTX, alumnos: [], alertas: [], programa: [], grados: [] });
  assert.match(s, /todavía no tiene alumnos/);
  assert.match(s, /Sin alertas activas/);
  assert.doesNotMatch(s, /Lucía/);
});

test('system: alumno que nunca practicó figura como tal', () => {
  const s = construirSystemLuna({
    ...CTX,
    alumnos: [{ nombre: 'Tomás', grado: 3, estado: 'sin empezar', ultimaPractica: null, precisionReciente: null }],
  });
  assert.match(s, /Tomás \(3°\), sin empezar, todavía no practicó/);
});

// --- historial y roles ---

test('recortarHistorial: 13 → 12 (los últimos), 12 o menos quedan igual', () => {
  const msgs = Array.from({ length: 13 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  const r = recortarHistorial(msgs);
  assert.equal(r.length, 12);
  assert.equal(r[0].content, 'm1');
  assert.equal(recortarHistorial(msgs.slice(0, 5)).length, 5);
});

test('aMensajesClaude: luna → assistant, user queda user', () => {
  const r = aMensajesClaude([{ role: 'user', content: 'hola' }, { role: 'luna', content: 'buenas' }]);
  assert.deepEqual(r, [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'buenas' }]);
});

// --- aParrafos ---

test('aParrafos: limpia markdown y separa párrafos SIN capear a 2', () => {
  const r = aParrafos('**Eje común**: la chacra.\n\n- Para 1°: vocales\n\n## Cierre\nPuesta en común.\n\nÚltimo párrafo.');
  assert.equal(r.length, 4);
  assert.equal(r[0], 'Eje común: la chacra.');
  assert.equal(r[1], 'Para 1°: vocales');
  assert.match(r[2], /^Cierre/);
});

test('aParrafos: texto vacío → lista vacía', () => {
  assert.deepEqual(aParrafos('   '), []);
});

// --- helpers ---

test('momentoDelAnio: fases del ciclo lectivo argentino', () => {
  assert.match(momentoDelAnio(new Date(2026, 0, 10)), /receso de verano/);
  assert.match(momentoDelAnio(new Date(2026, 3, 10)), /primera parte/);
  assert.match(momentoDelAnio(new Date(2026, 6, 28)), /mitad del ciclo/);
  assert.match(momentoDelAnio(new Date(2026, 8, 10)), /segunda parte/);
  assert.match(momentoDelAnio(new Date(2026, 10, 20)), /cierre del ciclo/);
});

test('haceCuanto: hoy / ayer / hace N días', () => {
  const now = new Date(2026, 6, 28, 12, 0, 0);
  assert.equal(haceCuanto(new Date(2026, 6, 28, 8), now), 'hoy');
  assert.equal(haceCuanto(new Date(2026, 6, 27, 20), now), 'ayer');
  assert.equal(haceCuanto(new Date(2026, 6, 17), now), 'hace 11 días');
});

test('sanearAlertas: capea cantidad, trunca campos y descarta lo que no sirve', () => {
  const muchas = Array.from({ length: 15 }, (_, i) => ({ alumno: `A${i}`, prioridad: 'alta', detalle: 'x'.repeat(500) }));
  const r = sanearAlertas(muchas);
  assert.equal(r.length, 10);
  assert.equal(r[0].detalle.length, 200);
  assert.deepEqual(sanearAlertas('basura'), []);
  assert.deepEqual(sanearAlertas([{ alumno: 'A' }]), []); // sin detalle no entra
});
