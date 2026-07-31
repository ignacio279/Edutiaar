// Unit de luna-chat: system fijo (spec de prompts 2026-07-31) + bloque
// <contexto_del_aula>, historial, roles y limpieza de párrafos.
// node --test, sin deps. Importa el .ts directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYSTEM_CHAT, recortarHistorial, aMensajesClaude, construirSystemLuna,
  construirContextoAula, aParrafos, momentoDelAnio, fechaLarga, haceCuanto,
  sanearAlertas, sanearAulaId,
} from '../../supabase/functions/luna-chat/chat.ts';

const CTX = {
  docenteNombre: 'Ana',
  fecha: '28 de julio de 2026',
  tipoEscuela: 'rural, zona Neuquén, Patagonia',
  gradosConCantidad: [{ grado: 1, cantidad: 1 }, { grado: 3, cantidad: 2 }, { grado: 5, cantidad: 2 }],
  materias: [{ nombre: 'Lengua (5°)', avancePct: 33, contenidos: ['Verbos', 'Tildes'] }],
  hitos: 'Cierre de boletines de julio de 2026 (4 sin aprobar)',
  alumnos: [
    { nombre: 'Lucía', grado: 5, estado: 'va muy bien', ultimaPractica: 'ayer', precisionReciente: 92, fortalezas: ['Verbos', 'Textos informativos'], dificultades: [] },
    { nombre: 'Benja', grado: 1, estado: 'a reforzar', ultimaPractica: 'hoy', precisionReciente: 35, fortalezas: [], dificultades: ['Las vocales'] },
  ],
  alertas: [{ alumno: 'Benja', prioridad: 'alta', detalle: 'Bajó la precisión en Las vocales' }],
  momento: 'julio, último tramo del 1er cuatrimestre (receso invernal cerca)',
};

// --- SYSTEM_CHAT (parte fija, verbatim del spec) ---

test('SYSTEM_CHAT: persona y reglas clave del spec', () => {
  assert.match(SYSTEM_CHAT, /Sos LUNA, la copiloto pedagógica/);
  assert.match(SYSTEM_CHAT, /plurigrado/);
  assert.match(SYSTEM_CHAT, /no inventes/);                       // regla 1
  assert.match(SYSTEM_CHAT, /Vos proponés, la maestra decide/);   // regla 2
  assert.match(SYSTEM_CHAT, /UN eje temático común/);             // regla 3
  assert.match(SYSTEM_CHAT, /sin depender de conectividad/);      // regla 4
  assert.match(SYSTEM_CHAT, /WhatsApp/);                          // regla 5
  assert.match(SYSTEM_CHAT, /No hagas diagnósticos médicos ni psicológicos/); // regla 7
  assert.match(SYSTEM_CHAT, /equipo de orientación/);
  assert.match(SYSTEM_CHAT, /Nunca hables mal de un alumno/);     // regla 8
  assert.match(SYSTEM_CHAT, /No compartas ni compares datos/);    // regla 9
});

// --- construirContextoAula / construirSystemLuna ---

test('contexto: bloque <contexto_del_aula> con todas las líneas del spec', () => {
  const c = construirContextoAula(CTX);
  assert.match(c, /^<contexto_del_aula>/);
  assert.match(c, /<\/contexto_del_aula>$/);
  assert.match(c, /Fecha: 28 de julio de 2026 — julio, último tramo del 1er cuatrimestre/);
  assert.match(c, /Escuela: rural, zona Neuquén, Patagonia/);
  assert.match(c, /Grados presentes: 1° \(1\), 3° \(2\), 5° \(2\)/);
  assert.match(c, /Materia y programa: Lengua \(5°\) — avance 33%\. Contenidos en curso: Verbos, Tildes/);
  assert.match(c, /Próximos hitos: Cierre de boletines de julio de 2026 \(4 sin aprobar\)/);
  assert.match(c, /Últimas planificaciones trabajadas con LUNA:\nTodavía no hay planificaciones registradas/);
});

test('contexto: líneas de alumnos con fortalezas, dificultades y sus alertas', () => {
  const c = construirContextoAula(CTX);
  assert.match(c, /- Lucía \(5°\): va muy bien; última práctica ayer; precisión reciente 92%; fortalezas: Verbos, Textos informativos/);
  assert.match(c, /- Benja \(1°\): a reforzar; última práctica hoy; precisión reciente 35%; dificultades actuales: Las vocales; alertas: Bajó la precisión en Las vocales/);
  assert.match(c, /\[alta\] Benja: Bajó la precisión en Las vocales/);
});

test('contexto: aula vacía → líneas honestas, sin inventar', () => {
  const c = construirContextoAula({ ...CTX, alumnos: [], alertas: [], materias: [], gradosConCantidad: [] });
  assert.match(c, /Grados presentes: todavía no hay alumnos cargados/);
  assert.match(c, /Materia y programa: todavía no hay materias publicadas/);
  assert.match(c, /Todavía no hay alumnos cargados en el aula\./);
  assert.match(c, /Sin alertas abiertas\./);
  assert.doesNotMatch(c, /Lucía/);
});

test('contexto: alumno que nunca practicó figura como tal', () => {
  const c = construirContextoAula({
    ...CTX,
    alumnos: [{ nombre: 'Tomás', grado: 3, estado: 'sin empezar', ultimaPractica: null, precisionReciente: null, fortalezas: [], dificultades: [] }],
    alertas: [],
  });
  assert.match(c, /- Tomás \(3°\): sin empezar; todavía no practicó/);
});

test('construirSystemLuna = SYSTEM_CHAT + contexto', () => {
  const s = construirSystemLuna(CTX);
  assert.ok(s.startsWith(SYSTEM_CHAT));
  assert.ok(s.includes('<contexto_del_aula>'));
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

test('aParrafos: limpia énfasis/títulos pero CONSERVA las viñetas (regla 5 permite listas)', () => {
  const r = aParrafos('**Eje común**: la chacra.\n\n- Para 1°: vocales\n- Para 5°: verbos\n\n## Cierre\nPuesta en común.');
  assert.equal(r.length, 3);
  assert.equal(r[0], 'Eje común: la chacra.');
  assert.equal(r[1], '- Para 1°: vocales\n- Para 5°: verbos');
  assert.match(r[2], /^Cierre/);
});

test('aParrafos: texto vacío → lista vacía', () => {
  assert.deepEqual(aParrafos('   '), []);
});

// --- helpers ---

test('momentoDelAnio: cuatrimestres del ciclo lectivo argentino', () => {
  assert.match(momentoDelAnio(new Date(2026, 0, 10)), /receso de verano/);
  assert.match(momentoDelAnio(new Date(2026, 2, 10)), /primer tramo del 1er cuatrimestre/);
  assert.match(momentoDelAnio(new Date(2026, 6, 28)), /último tramo del 1er cuatrimestre/);
  assert.match(momentoDelAnio(new Date(2026, 7, 5)), /primer tramo del 2° cuatrimestre/);
  assert.match(momentoDelAnio(new Date(2026, 9, 20)), /octubre, último tramo del 2° cuatrimestre/);
});

test('fechaLarga: formato "28 de julio de 2026"', () => {
  assert.equal(fechaLarga(new Date(2026, 6, 28)), '28 de julio de 2026');
  assert.equal(fechaLarga(new Date(2026, 0, 1)), '1 de enero de 2026');
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

test('sanearAulaId: solo pasa un UUID; lo demás → null (contexto sin filtro)', () => {
  const id = '4fe9f983-0f37-4b3f-9a3b-2f2f6a1c9d10';
  assert.equal(sanearAulaId(id), id);
  assert.equal(sanearAulaId(`  ${id}  `), id); // trim
  assert.equal(sanearAulaId(id.toUpperCase()), id.toUpperCase()); // case-insensitive
  assert.equal(sanearAulaId('no-es-uuid'), null);
  assert.equal(sanearAulaId(''), null);
  assert.equal(sanearAulaId(42), null);
  assert.equal(sanearAulaId(undefined), null);
  assert.equal(sanearAulaId(null), null);
});
