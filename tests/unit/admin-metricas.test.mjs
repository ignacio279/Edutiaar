// Tests de WP5 — Métricas y home (Dashboard admin v3): TODA la lógica pura de
// web/lib/admin/metricas.ts con datasets sintéticos y `now` FIJO (nada de
// new Date() adentro de las funciones → determinístico).
// La Edge Function admin-metricas devuelve filas crudas ya acotadas y el front
// calcula con estas funciones: por eso la lógica se testea UNA sola vez, acá.
// Correr: npm test (o node --test tests/unit/admin-metricas.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resumenAdopcion, metricasUso, funnelColegio, compararColegios,
  armarFeed, fechaRelativa, serieSemanal,
} from '../../web/lib/admin/metricas.ts';

const AHORA = new Date('2026-08-06T12:00:00Z');
const MS = AHORA.getTime();
const DIA = 86_400_000;
// Desplazamientos relativos a `now`: así los fixtures no dependen del huso
// horario de la máquina (la única función con día calendario LOCAL es
// resumenAdopcion → sesionesHoy, y ahí se usa exactamente `now`).
const hace = (ms) => new Date(MS - ms).toISOString();
const dias = (n) => hace(n * DIA);

// ── resumenAdopcion ─────────────────────────────────────────────────────────

test('resumenAdopcion: colegios activos = trial + activo (suspendido/archivado no)', () => {
  const r = resumenAdopcion({
    escuelas: [
      { id: 'e1', estado: 'activo' },
      { id: 'e2', estado: 'trial' },
      { id: 'e3', estado: 'suspendido' },
      { id: 'e4', estado: 'archivado' },
      { id: 'e5', estado: null },
    ],
    docentes: [], sesiones: [], boletines: [], mensajes: [],
  }, AHORA);
  assert.equal(r.colegiosActivos, 2);
});

test('resumenAdopcion: maestra activa por boletín tocado, por chat o por uso_api', () => {
  const r = resumenAdopcion({
    escuelas: [],
    docentes: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }],
    sesiones: [],
    // d1 tocó un boletín viejo hace 2 días (created viejo, updated fresco).
    boletines: [{ docente_id: 'd1', created_at: dias(40), updated_at: dias(2) }],
    // d2 escribió en el chat; el mensaje de LUNA (role 'luna') NO cuenta.
    mensajes: [
      { docente_id: 'd2', role: 'user', created_at: dias(1) },
      { docente_id: 'd4', role: 'luna', created_at: dias(1) },
    ],
    // d3 aparece en uso_api (Fase final); 'ajeno' no está en docentes.
    usoApi: [
      { perfil_id: 'd3', created_at: dias(3) },
      { perfil_id: 'ajeno', created_at: dias(1) },
    ],
  }, AHORA);
  assert.equal(r.maestrasActivas7d, 3, 'd1, d2 y d3 activas; d4 no');
});

test('resumenAdopcion: maestra INACTIVA si su rastro quedó fuera de los 7 días', () => {
  const r = resumenAdopcion({
    escuelas: [],
    docentes: [{ id: 'd1' }],
    sesiones: [],
    boletines: [{ docente_id: 'd1', created_at: dias(30), updated_at: dias(20), aprobado_at: dias(20) }],
    mensajes: [{ docente_id: 'd1', role: 'user', created_at: dias(9) }],
  }, AHORA);
  assert.equal(r.maestrasActivas7d, 0);
});

test('resumenAdopcion: alumnos activos 7d sin repetir y sesiones de hoy', () => {
  const r = resumenAdopcion({
    escuelas: [],
    docentes: [],
    sesiones: [
      { alumno_id: 'a1', fecha: AHORA.toISOString() }, // hoy (mismo instante que now)
      { alumno_id: 'a1', fecha: dias(3) }, // mismo chico, otra sesión
      { alumno_id: 'a2', fecha: dias(6) },
      { alumno_id: 'a3', fecha: dias(10) }, // fuera de la ventana
      { alumno_id: 'a4', fecha: 'no-es-fecha' }, // basura: se ignora
    ],
    boletines: [], mensajes: [],
  }, AHORA);
  assert.equal(r.alumnosActivos7d, 2, 'a1 y a2');
  assert.equal(r.sesionesHoy, 1);
});

// ── metricasUso ─────────────────────────────────────────────────────────────

const RANGO = { desde: new Date(MS - 30 * DIA), hasta: AHORA };

test('metricasUso: cuenta respuestas, ejercicios generados y chats del rango', () => {
  const m = metricasUso({
    respuestas: [{ created_at: dias(1) }, { created_at: dias(10) }, { created_at: dias(40) }],
    ejerciciosCreados: [{ created_at: dias(2) }, { created_at: dias(31) }],
    boletines: [],
    mensajes: [
      { role: 'user', created_at: dias(3) },
      { role: 'luna', created_at: dias(3) }, // la respuesta de LUNA no es un chat
      { role: 'user', created_at: dias(45) },
    ],
  }, RANGO);
  assert.equal(m.ejerciciosRespondidos, 2);
  assert.equal(m.ejerciciosGenerados, 1);
  assert.equal(m.chats, 1);
});

test('metricasUso: boletín aprobado SIN editar (version 1) vs editado (version 2)', () => {
  const m = metricasUso({
    respuestas: [], ejerciciosCreados: [], mensajes: [],
    boletines: [
      { estado: 'aprobado', version: 1, created_at: dias(2) }, // salió perfecto
      { estado: 'aprobado', version: 2, created_at: dias(3) }, // lo corrigieron
      { estado: 'borrador', version: 1, created_at: dias(4) }, // todavía no aprobado
      { estado: 'aprobado', version: 1, created_at: dias(60) }, // fuera del rango
    ],
  }, RANGO);
  assert.equal(m.boletinesGenerados, 3);
  assert.equal(m.boletinesAprobadosSinEditar, 1);
});

test('metricasUso: el rango es semiabierto [desde, hasta)', () => {
  const m = metricasUso({
    respuestas: [
      { created_at: RANGO.desde.toISOString() }, // borde inferior: entra
      { created_at: RANGO.hasta.toISOString() }, // borde superior: NO entra
    ],
    ejerciciosCreados: [], boletines: [], mensajes: [],
  }, RANGO);
  assert.equal(m.ejerciciosRespondidos, 1);
});

// ── funnelColegio ───────────────────────────────────────────────────────────

test('funnelColegio: colegio completo → las 4 etapas hechas, en orden y con fechas', () => {
  const etapas = funnelColegio({
    escuela: { id: 'e1', nombre: 'Escuelita', created_at: dias(60) },
    docentes: 2,
    primeraSesion: dias(50),
    primerBoletinAprobado: dias(20),
  });
  assert.deepEqual(
    etapas.map((e) => e.clave),
    ['creado', 'maestras_invitadas', 'primera_actividad', 'primer_boletin_aprobado'],
  );
  assert.ok(etapas.every((e) => e.hecho));
  assert.equal(etapas[0].fecha, dias(60));
  assert.equal(etapas[2].fecha, dias(50));
  assert.equal(etapas[3].fecha, dias(20));
});

test('funnelColegio: colegio recién creado → solo la primera etapa hecha', () => {
  const etapas = funnelColegio({
    escuela: { id: 'e2', nombre: 'Nuevo', created_at: dias(1) },
    docentes: 0,
  });
  assert.deepEqual(etapas.map((e) => e.hecho), [true, false, false, false]);
  assert.deepEqual(etapas.map((e) => e.fecha), [dias(1), null, null, null]);
  assert.ok(etapas.every((e) => e.label.length > 0));
});

test('funnelColegio: docentes como LISTA sin created_at → etapa hecha pero sin fecha', () => {
  const etapas = funnelColegio({
    escuela: { id: 'e3', created_at: dias(5) },
    docentes: [{ id: 'd1' }, { id: 'd2' }],
  });
  assert.equal(etapas[1].hecho, true);
  assert.equal(etapas[1].fecha, null, 'perfil no tiene created_at: no se inventa fecha');
});

test('funnelColegio: con created_at en la lista, toma la fecha de la PRIMERA maestra', () => {
  const etapas = funnelColegio({
    escuela: { id: 'e4', created_at: dias(9) },
    docentes: [{ id: 'd1', created_at: dias(4) }, { id: 'd2', created_at: dias(8) }],
  });
  assert.equal(etapas[1].fecha, dias(8));
});

// ── compararColegios ────────────────────────────────────────────────────────

test('compararColegios: ordena por sesiones desc y calcula precisión', () => {
  const filas = compararColegios([
    { escuelaId: 'e1', nombre: 'Bajo uso', estado: 'trial', alumnosActivos: 1, sesiones: 3, aciertos: 5, total: 20, boletinesAprobados: 0 },
    { escuelaId: 'e2', nombre: 'Alto uso', estado: 'activo', alumnosActivos: 9, sesiones: 40, aciertos: 75, total: 100, boletinesAprobados: 4 },
  ]);
  assert.deepEqual(filas.map((f) => f.escuelaId), ['e2', 'e1']);
  assert.equal(filas[0].precision, 75);
  assert.equal(filas[1].precision, 25);
  assert.equal(filas[0].boletinesAprobados, 4);
});

test('compararColegios: empate en sesiones → desempata por alumnos activos y después por nombre', () => {
  const filas = compararColegios([
    { escuelaId: 'c', nombre: 'Zorzal', sesiones: 10, alumnosActivos: 2 },
    { escuelaId: 'a', nombre: 'Aromo', sesiones: 10, alumnosActivos: 2 },
    { escuelaId: 'b', nombre: 'Barranca', sesiones: 10, alumnosActivos: 5 },
  ]);
  assert.deepEqual(filas.map((f) => f.escuelaId), ['b', 'a', 'c']);
});

test('compararColegios: sin respuestas → precisión null (nunca NaN) y ceros', () => {
  const filas = compararColegios([{ escuelaId: 'e1', nombre: null, estado: null }]);
  assert.equal(filas[0].precision, null);
  assert.equal(filas[0].nombre, '');
  assert.equal(filas[0].sesiones, 0);
  assert.equal(filas[0].alumnosActivos, 0);
  assert.equal(filas[0].boletinesAprobados, 0);
});

// ── armarFeed ───────────────────────────────────────────────────────────────

test('armarFeed: mergea eventos heterogéneos, ordena desc y arma el texto', () => {
  const items = armarFeed([
    { tipo: 'alta_colegio', fecha: dias(3), nombre: 'Escuela 12' },
    { tipo: 'sesion', fecha: dias(1), alumno: 'Milagros Paz', nodo: 'Sustantivos', escuela: 'Escuela 12' },
    { tipo: 'boletin_aprobado', fecha: dias(2), alumno: 'Juan Cruz Díaz', escuela: 'Escuela 12' },
  ]);
  assert.deepEqual(items.map((i) => i.tipo), ['sesion', 'boletin_aprobado', 'alta_colegio']);
  assert.equal(items[0].texto, 'Milagros practicó Sustantivos en Escuela 12');
  assert.equal(items[1].texto, 'Boletín de Juan aprobado en Escuela 12');
  assert.equal(items[2].texto, 'Se sumó el colegio Escuela 12');
});

test('armarFeed: trunca al límite y descarta fechas inválidas', () => {
  const eventos = [];
  // Nombres de una sola palabra: al feed va solo el nombre de pila (Regla 5).
  for (let i = 0; i < 10; i++) eventos.push({ tipo: 'sesion', fecha: hace(i * 60_000), alumno: `Chico${i}` });
  eventos.push({ tipo: 'sesion', fecha: 'ayer nomás', alumno: 'Fantasma' });

  const items = armarFeed(eventos, 4);
  assert.equal(items.length, 4);
  assert.equal(items[0].texto, 'Chico0 practicó', 'el más reciente primero');
  assert.ok(!armarFeed(eventos).some((i) => i.texto.includes('Fantasma')));
  assert.equal(armarFeed(eventos, 0).length, 0);
});

test('armarFeed: sin nombre de alumno no rompe (queda "Alguien")', () => {
  const [item] = armarFeed([{ tipo: 'sesion', fecha: dias(1), alumno: null, nodo: null, escuela: null }]);
  assert.equal(item.texto, 'Alguien practicó');
});

// ── fechaRelativa ───────────────────────────────────────────────────────────

test('fechaRelativa: recién, minutos, horas, ayer y días', () => {
  assert.equal(fechaRelativa(hace(10_000), AHORA), 'recién');
  assert.equal(fechaRelativa(hace(30 * 60_000), AHORA), 'hace 30 min');
  assert.equal(fechaRelativa(hace(2 * 3_600_000), AHORA), 'hace 2 h');
  assert.equal(fechaRelativa(hace(DIA), AHORA), 'ayer');
  assert.equal(fechaRelativa(dias(12), AHORA), 'hace 12 días');
  assert.equal(fechaRelativa('cualquier cosa', AHORA), '');
});

// ── serieSemanal ────────────────────────────────────────────────────────────

test('serieSemanal: 30 días → 5 baldes de la más vieja a la más nueva', () => {
  const serie = serieSemanal([], 30, AHORA);
  assert.equal(serie.length, 5);
  assert.equal(serie[serie.length - 1].hasta, AHORA.toISOString(), 'el último balde termina en now');
  for (let i = 1; i < serie.length; i++) {
    assert.ok(serie[i - 1].hasta <= serie[i].desde || serie[i - 1].hasta === serie[i].desde);
    assert.equal(serie[i - 1].hasta, serie[i].desde, 'baldes contiguos');
  }
  assert.ok(serie.every((s) => s.sesiones === 0 && s.alumnosActivos === 0));
});

test('serieSemanal: cuenta sesiones y alumnos únicos por balde, con bordes (desde, hasta]', () => {
  const serie = serieSemanal([
    { alumno_id: 'a1', fecha: AHORA.toISOString() }, // borde superior del último balde: entra
    { alumno_id: 'a1', fecha: dias(1) },
    { alumno_id: 'a2', fecha: dias(2) },
    { alumno_id: 'a3', fecha: dias(7) }, // borde: cae en el balde ANTERIOR
    { alumno_id: 'a9', fecha: dias(30) }, // fuera de los baldes
  ], 14, AHORA);

  assert.equal(serie.length, 2);
  const [vieja, ultima] = serie;
  assert.equal(ultima.sesiones, 3);
  assert.equal(ultima.alumnosActivos, 2, 'a1 y a2');
  assert.equal(vieja.sesiones, 1, 'la sesión de hace exactamente 7 días cae acá');
  assert.equal(vieja.alumnosActivos, 1);
});

test('serieSemanal: rango raro (0, negativo o basura) → un solo balde en cero', () => {
  for (const r of [0, -5, NaN, undefined]) {
    const serie = serieSemanal([], r, AHORA);
    assert.equal(serie.length, 1, `rango ${r}`);
    assert.equal(serie[0].sesiones, 0);
  }
});

// ── Todo vacío: ceros sin NaN ───────────────────────────────────────────────

test('TODO VACÍO: ceros y listas vacías, nunca NaN ni undefined', () => {
  const r = resumenAdopcion({ escuelas: [], docentes: [], sesiones: [], boletines: [], mensajes: [] }, AHORA);
  for (const v of Object.values(r)) assert.equal(Number.isFinite(v) && v === 0, true);

  const m = metricasUso({ respuestas: [], boletines: [], mensajes: [], ejerciciosCreados: [] }, RANGO);
  for (const v of Object.values(m)) assert.equal(v, 0);

  assert.deepEqual(compararColegios([]), []);
  assert.deepEqual(armarFeed([]), []);

  const etapas = funnelColegio({ escuela: { id: 'e0' }, docentes: 0 });
  assert.equal(etapas.length, 4);
  assert.deepEqual(etapas.map((e) => e.fecha), [null, null, null, null]);

  const serie = serieSemanal([], 7, AHORA);
  assert.equal(serie.length, 1);
  assert.equal(serie[0].alumnosActivos, 0);
});

test('TODO VACÍO: listas ausentes (undefined) tampoco rompen', () => {
  const r = resumenAdopcion({ escuelas: undefined, docentes: undefined, sesiones: undefined, boletines: undefined, mensajes: undefined }, AHORA);
  assert.deepEqual(r, { colegiosActivos: 0, maestrasActivas7d: 0, alumnosActivos7d: 0, sesionesHoy: 0 });

  const m = metricasUso({ respuestas: undefined, boletines: undefined, mensajes: undefined, ejerciciosCreados: undefined }, RANGO);
  assert.deepEqual(m, {
    ejerciciosRespondidos: 0, ejerciciosGenerados: 0, boletinesGenerados: 0,
    boletinesAprobadosSinEditar: 0, chats: 0,
  });

  assert.deepEqual(compararColegios(undefined), []);
  assert.deepEqual(armarFeed(undefined), []);
  assert.equal(serieSemanal(undefined, 7, AHORA)[0].sesiones, 0);
});
