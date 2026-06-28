// Unit del panel docente (Etapa 4): lógica pura de actividad, etiqueta e histórico.
// node --test, sin deps. Importa el .ts directo (Node 24 strip-types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_LABEL,
  rangoHoy,
  etiquetaEstado,
  prioridadAlumno,
  resumenHoy,
  ultimaSesion,
  haceCuanto,
  nombreMes,
  agruparPorMes,
} from '../../web/lib/panel.ts';

// 28 jun 2026, mediodía local.
const NOW = new Date(2026, 5, 28, 12, 0, 0);
// helper: ISO de un día local a las 10am
const dia = (y, m, d, h = 10) => new Date(y, m, d, h, 0, 0).toISOString();

test('rangoHoy: desde 00:00 local, hasta 00:00 del día siguiente', () => {
  const { desde, hasta } = rangoHoy(NOW);
  assert.equal(new Date(desde).getTime(), new Date(2026, 5, 28).getTime());
  assert.equal(new Date(hasta).getTime(), new Date(2026, 5, 29).getTime());
});

test('etiquetaEstado: a_reforzar gana a todo lo demás', () => {
  const r = etiquetaEstado([{ estado: 'dominado' }, { estado: 'a_reforzar' }, { estado: 'en_construccion' }]);
  assert.equal(r.estado, 'a_reforzar');
  assert.equal(r.label, 'A reforzar');
});

test('etiquetaEstado: no_empezado pesa más que dominado', () => {
  assert.equal(etiquetaEstado([{ estado: 'dominado' }, { estado: 'no_empezado' }]).estado, 'no_empezado');
});

test('etiquetaEstado: todo dominado → Lo domina', () => {
  assert.equal(etiquetaEstado([{ estado: 'dominado' }, { estado: 'dominado' }]).estado, 'dominado');
});

test('etiquetaEstado: lista vacía → no_empezado', () => {
  assert.equal(etiquetaEstado([]).estado, 'no_empezado');
});

test('prioridadAlumno: a_reforzar antes que dominado; sin práctica antes que con práctica', () => {
  const aRefSin = prioridadAlumno({ estado: 'a_reforzar', practicoHoy: false });
  const aRefCon = prioridadAlumno({ estado: 'a_reforzar', practicoHoy: true });
  const domSin = prioridadAlumno({ estado: 'dominado', practicoHoy: false });
  assert.ok(aRefSin < aRefCon, 'sin práctica va primero dentro del mismo estado');
  assert.ok(aRefCon < domSin, 'a_reforzar va antes que dominado');
});

test('prioridadAlumno: ordena una lista a quién atender primero', () => {
  const items = [
    { id: 'dom', estado: 'dominado', practicoHoy: true },
    { id: 'ref', estado: 'a_reforzar', practicoHoy: false },
    { id: 'cam', estado: 'en_construccion', practicoHoy: true },
  ];
  const orden = [...items].sort((a, b) => prioridadAlumno(a) - prioridadAlumno(b)).map((x) => x.id);
  assert.deepEqual(orden, ['ref', 'cam', 'dom']);
});

test('resumenHoy: cuenta solo las de hoy y suma aciertos/total', () => {
  const sesiones = [
    { fecha: dia(2026, 5, 28), aciertos: 7, total: 10 },
    { fecha: dia(2026, 5, 28, 16), aciertos: 5, total: 8 },
    { fecha: dia(2026, 5, 27), aciertos: 9, total: 10 }, // ayer, no cuenta
  ];
  const r = resumenHoy(sesiones, NOW);
  assert.equal(r.cantidad, 2);
  assert.equal(r.aciertos, 12);
  assert.equal(r.total, 18);
});

test('resumenHoy: aciertos/total nulos no rompen', () => {
  const r = resumenHoy([{ fecha: dia(2026, 5, 28), aciertos: null, total: null }], NOW);
  assert.deepEqual(r, { cantidad: 1, aciertos: 0, total: 0 });
});

test('ultimaSesion: devuelve la más reciente, null si vacío', () => {
  assert.equal(ultimaSesion([]), null);
  const u = ultimaSesion([
    { fecha: dia(2026, 5, 20) },
    { fecha: dia(2026, 5, 25) },
    { fecha: dia(2026, 5, 22) },
  ]);
  assert.equal(u.getTime(), new Date(dia(2026, 5, 25)).getTime());
});

test('haceCuanto: hoy / ayer / días / meses', () => {
  assert.equal(haceCuanto(dia(2026, 5, 28), NOW), 'hoy');
  assert.equal(haceCuanto(dia(2026, 5, 27), NOW), 'ayer');
  assert.equal(haceCuanto(dia(2026, 5, 25), NOW), 'hace 3 días');
  assert.equal(haceCuanto(dia(2026, 3, 28), NOW), 'hace 2 meses');
});

test('nombreMes: YYYY-MM → label español', () => {
  assert.equal(nombreMes('2026-06'), 'Junio 2026');
  assert.equal(nombreMes('2026-01'), 'Enero 2026');
});

test('agruparPorMes: agrupa y ordena más reciente primero', () => {
  const sesiones = [
    { fecha: dia(2026, 5, 10), aciertos: 4, total: 5 }, // jun
    { fecha: dia(2026, 5, 20), aciertos: 3, total: 5 }, // jun
    { fecha: dia(2026, 4, 15), aciertos: 2, total: 4 }, // may
  ];
  const g = agruparPorMes(sesiones);
  assert.equal(g.length, 2);
  assert.equal(g[0].mes, '2026-06');
  assert.equal(g[0].label, 'Junio 2026');
  assert.equal(g[0].cantidad, 2);
  assert.equal(g[0].aciertos, 7);
  assert.equal(g[0].total, 10);
  assert.equal(g[1].mes, '2026-05');
});

test('ESTADO_LABEL: cubre los 4 estados', () => {
  assert.deepEqual(Object.keys(ESTADO_LABEL).sort(), ['a_reforzar', 'dominado', 'en_construccion', 'no_empezado']);
});
