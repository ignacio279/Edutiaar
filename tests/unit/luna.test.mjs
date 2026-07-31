// Unit de LUNA (copiloto docente): detectores de alertas, métricas, período
// mensual y resumen del aula. node --test, sin deps. Importa el .ts directo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodoActual, detectarInactividad, detectarCaidaPrecision, detectarEvitaTipo,
  detectarAdelantado, alertasAula, metricasAula, resumenAula, mensajeErrorLuna,
  claveAlerta, filtrarAtendidas,
} from '../../web/lib/luna.ts';

// 28 jul 2026, mediodía local.
const NOW = new Date(2026, 6, 28, 12, 0, 0);
const dia = (haceDias, h = 10) => new Date(2026, 6, 28 - haceDias, h, 0, 0).toISOString();

const ANA = { id: 'a1', nombre: 'Lucía', avatar: 'owl', grado: 5 };

const ses = (alumno_id, nodo_id, haceDias, total = 6, aciertos = 4) =>
  ({ alumno_id, nodo_id, fecha: dia(haceDias), aciertos, total });
const resp = (alumnoId, nodoId, haceDias, correcta, tipo = 'reconocer') =>
  ({ alumnoId, nodoId, tipo, correcta, createdAt: dia(haceDias) });

// --- periodoActual (mensual) ---

test('periodoActual: clave YYYY-MM, label en castellano y bordes del mes', () => {
  const p = periodoActual(NOW);
  assert.equal(p.clave, '2026-07');
  assert.equal(p.label, 'julio 2026');
  assert.equal(new Date(p.desde).getTime(), new Date(2026, 6, 1).getTime());
  assert.equal(new Date(p.hasta).getTime(), new Date(2026, 7, 1).getTime());
});

test('periodoActual: enero y diciembre no se pisan de año', () => {
  assert.equal(periodoActual(new Date(2026, 0, 15)).clave, '2026-01');
  const dic = periodoActual(new Date(2026, 11, 15));
  assert.equal(dic.clave, '2026-12');
  assert.equal(new Date(dic.hasta).getTime(), new Date(2027, 0, 1).getTime());
});

// --- detectarInactividad ---

test('inactividad: 4 días no dispara, 5 es media, 10 es alta', () => {
  assert.equal(detectarInactividad(ANA, [ses('a1', 'n1', 4)], NOW), null);
  const media = detectarInactividad(ANA, [ses('a1', 'n1', 5)], NOW);
  assert.equal(media?.tipo, 'inactividad');
  assert.equal(media?.prioridad, 'media');
  const alta = detectarInactividad(ANA, [ses('a1', 'n1', 10)], NOW);
  assert.equal(alta?.prioridad, 'alta');
  assert.match(alta?.detalle ?? '', /10 días/);
});

test('inactividad: cuenta desde la sesión MÁS reciente', () => {
  const a = detectarInactividad(ANA, [ses('a1', 'n1', 20), ses('a1', 'n1', 2)], NOW);
  assert.equal(a, null);
});

test('sin_arrancar: nunca practicó → info honesta, no alarma', () => {
  const a = detectarInactividad(ANA, [], NOW);
  assert.equal(a?.tipo, 'sin_arrancar');
  assert.equal(a?.prioridad, 'info');
  assert.equal(a?.positiva, false);
});

// --- detectarCaidaPrecision ---

// 6 respuestas viejas (día 10) casi todas bien + 6 recientes (día 2) casi todas mal.
const caidaRs = [
  ...Array.from({ length: 6 }, (_, i) => resp('a1', 'n1', 10, i < 5)), // 83%
  ...Array.from({ length: 6 }, (_, i) => resp('a1', 'n1', 2, i < 2)),  // 33%
];
const NODOS = [{ id: 'n1', nombre: 'Sílabas' }, { id: 'n2', nombre: 'Vocales' }];

test('caida_precision: caída grande con muestra suficiente → alta, nombra el tema', () => {
  const a = detectarCaidaPrecision(ANA, caidaRs, NODOS, NOW);
  assert.equal(a?.tipo, 'caida_precision');
  assert.equal(a?.prioridad, 'alta');
  assert.match(a?.detalle ?? '', /Sílabas/);
  assert.match(a?.detalle ?? '', /83% → 33%/);
});

test('caida_precision: sin muestra mínima en una ventana no dispara', () => {
  const pocas = caidaRs.slice(0, 6 + 5); // solo 5 recientes
  assert.equal(detectarCaidaPrecision(ANA, pocas, NODOS, NOW), null);
});

test('caida_precision: caída chica (<25 pts) no dispara', () => {
  const rs = [
    ...Array.from({ length: 6 }, (_, i) => resp('a1', 'n1', 10, i < 5)), // 83%
    ...Array.from({ length: 6 }, (_, i) => resp('a1', 'n1', 2, i < 4)),  // 67%
  ];
  assert.equal(detectarCaidaPrecision(ANA, rs, NODOS, NOW), null);
});

test('caida_precision: respuestas de otro alumno no cuentan', () => {
  const ajenas = caidaRs.map((r) => ({ ...r, alumnoId: 'otro' }));
  assert.equal(detectarCaidaPrecision(ANA, ajenas, NODOS, NOW), null);
});

// --- detectarEvitaTipo ---

test('evita_tipo: 12+ respuestas sin producir → media', () => {
  const rs = Array.from({ length: 12 }, (_, i) => resp('a1', 'n1', (i % 10) + 1, true, 'reconocer'));
  const a = detectarEvitaTipo(ANA, rs, NOW);
  assert.equal(a?.tipo, 'evita_tipo');
  assert.equal(a?.prioridad, 'media');
  assert.match(a?.detalle ?? '', /producir/);
});

test('evita_tipo: con 11 respuestas o con algún producir no dispara', () => {
  const once = Array.from({ length: 11 }, () => resp('a1', 'n1', 3, true, 'reconocer'));
  assert.equal(detectarEvitaTipo(ANA, once, NOW), null);
  const conProducir = [...once, resp('a1', 'n1', 2, true, 'producir')];
  assert.equal(detectarEvitaTipo(ANA, conProducir, NOW), null);
});

// --- detectarAdelantado ---

const nodoAl = (alumno_id, nodo_id, estado) => ({ alumno_id, nodo_id, estado });

test('adelantado: >50% dominado sin a_reforzar → info positiva', () => {
  const na = [nodoAl('a1', 'n1', 'dominado'), nodoAl('a1', 'n2', 'dominado'), nodoAl('a1', 'n3', 'en_construccion')];
  const a = detectarAdelantado(ANA, na);
  assert.equal(a?.tipo, 'adelantado');
  assert.equal(a?.positiva, true);
  assert.match(a?.detalle ?? '', /2 de 3/);
});

test('adelantado: con un a_reforzar o mitad justa no dispara', () => {
  assert.equal(detectarAdelantado(ANA, [nodoAl('a1', 'n1', 'dominado'), nodoAl('a1', 'n2', 'a_reforzar'), nodoAl('a1', 'n3', 'dominado')]), null);
  assert.equal(detectarAdelantado(ANA, [nodoAl('a1', 'n1', 'dominado'), nodoAl('a1', 'n2', 'en_construccion')]), null);
  assert.equal(detectarAdelantado(ANA, []), null);
});

// --- alertasAula ---

test('alertasAula: ordena alta → media → info, positivas al final', () => {
  const alumnos = [
    { id: 'a1', nombre: 'Lucía', avatar: 'owl', grado: 5 },   // adelantada (info positiva)
    { id: 'a2', nombre: 'Tomás', avatar: 'sheep', grado: 3 }, // inactivo 11 días (alta)
    { id: 'a3', nombre: 'Sofía', avatar: 'cat', grado: 3 },   // evita producir (media)
  ];
  const sesiones = [
    ses('a1', 'n1', 1), ses('a2', 'n1', 11),
    ...Array.from({ length: 4 }, (_, i) => ses('a3', 'n1', i + 1)),
  ];
  const respuestas = Array.from({ length: 12 }, (_, i) => resp('a3', 'n1', (i % 10) + 1, true, 'reconocer'));
  const na = [nodoAl('a1', 'n1', 'dominado'), nodoAl('a1', 'n2', 'dominado'), nodoAl('a1', 'n3', 'en_construccion')];
  const alertas = alertasAula(alumnos, sesiones, respuestas, na, NODOS, NOW);
  assert.deepEqual(alertas.map((a) => a.prioridad), ['alta', 'media', 'info']);
  assert.equal(alertas[0].alumnoNombre, 'Tomás');
  assert.equal(alertas.at(-1)?.positiva, true);
});

test('alertasAula: aula vacía → sin alertas', () => {
  assert.deepEqual(alertasAula([], [], [], [], [], NOW), []);
});

// --- metricasAula ---

test('metricasAula: activos y ejercicios de la semana, progreso y abiertas', () => {
  const alumnos = [ANA, { id: 'a2', nombre: 'Tomás', avatar: 'sheep', grado: 3 }];
  const sesiones = [ses('a1', 'n1', 1, 8, 6), ses('a1', 'n2', 3, 4, 2), ses('a2', 'n1', 20, 10, 5)];
  const na = [nodoAl('a1', 'n1', 'dominado'), nodoAl('a2', 'n1', 'en_construccion')];
  const alertas = [
    { prioridad: 'alta', positiva: false }, { prioridad: 'media', positiva: false }, { prioridad: 'info', positiva: true },
  ];
  const m = metricasAula(alumnos, sesiones, na, 4, alertas, NOW);
  assert.equal(m.activosSemana, 1);       // solo a1 practicó en 7 días
  assert.equal(m.ejerciciosSemana, 12);   // 8 + 4 (la de hace 20 días no)
  assert.equal(m.progresoPct, 25);        // 1 dominado de 4 esperados
  assert.equal(m.alertasAbiertas, 2);     // info no cuenta
});

test('metricasAula: aula vacía → todo en cero (sin dividir por cero)', () => {
  const m = metricasAula([], [], [], 0, [], NOW);
  assert.deepEqual(m, { activosSemana: 0, ejerciciosSemana: 0, progresoPct: 0, alertasAbiertas: 0 });
});

// --- resumenAula ---

test('resumenAula: tema más trabajado, más difícil (con muestra), pendientes e hito', () => {
  const alumnos = [ANA, { id: 'a2', nombre: 'Tomás', avatar: 'sheep', grado: 3 }];
  const sesiones = [ses('a1', 'n1', 1), ses('a1', 'n1', 2), ses('a2', 'n2', 1)];
  // n2: 8 respuestas al 25% (difícil); n1: 8 al 100% pero más sesiones.
  const respuestas = [
    ...Array.from({ length: 8 }, (_, i) => resp('a2', 'n2', 2, i < 2)),
    ...Array.from({ length: 8 }, () => resp('a1', 'n1', 2, true)),
  ];
  const boletines = [{ alumno_id: 'a1', estado: 'aprobado' }, { alumno_id: 'a2', estado: 'borrador' }];
  const r = resumenAula(sesiones, respuestas, NODOS, boletines, alumnos, NOW);
  assert.equal(r.temaMasTrabajado, 'Sílabas'); // n1
  assert.equal(r.temaMasDificil, 'Vocales');   // n2
  assert.equal(r.boletinesPendientes, 1);      // a2 sin aprobado
  assert.match(r.hito ?? '', /julio 2026/);
});

test('resumenAula: pocas respuestas no alcanzan para señalar tema difícil', () => {
  const respuestas = Array.from({ length: 7 }, () => resp('a1', 'n1', 2, false)); // 7 < 8
  const r = resumenAula([], respuestas, NODOS, [], [ANA], NOW);
  assert.equal(r.temaMasDificil, null);
});

test('resumenAula: aula vacía → nulls y cero, sin inventar', () => {
  const r = resumenAula([], [], [], [], [], NOW);
  assert.deepEqual(r, { temaMasTrabajado: null, temaMasDificil: null, boletinesPendientes: 0, hito: null });
});

// --- mensajeErrorLuna ---

test('mensajeErrorLuna: códigos conocidos con copy propio, resto genérico', () => {
  assert.match(mensajeErrorLuna('sin_actividad'), /no hay datos/);
  assert.match(mensajeErrorLuna('tope_diario_boletin'), /Por hoy/);
  assert.match(mensajeErrorLuna('tope_diario_chat'), /Mañana/);
  assert.match(mensajeErrorLuna('timeout'), /tardó demasiado/);
  assert.match(mensajeErrorLuna('claude_500: pum'), /Probá de nuevo/);
  assert.match(mensajeErrorLuna(undefined), /Probá de nuevo/);
});

// --- claveAlerta / filtrarAtendidas (alertas atendidas, migración 0017) ---

test('claveAlerta: estable por tipo + alumno', () => {
  assert.equal(claveAlerta({ tipo: 'inactividad', alumnoId: 'a1' }), 'inactividad:a1');
  assert.equal(claveAlerta({ tipo: 'inactividad', alumnoId: 'a1' }), claveAlerta({ tipo: 'inactividad', alumnoId: 'a1' }));
  assert.notEqual(claveAlerta({ tipo: 'inactividad', alumnoId: 'a1' }), claveAlerta({ tipo: 'evita_tipo', alumnoId: 'a1' }));
  assert.notEqual(claveAlerta({ tipo: 'inactividad', alumnoId: 'a1' }), claveAlerta({ tipo: 'inactividad', alumnoId: 'a2' }));
});

test('filtrarAtendidas: saca solo las claves marcadas, conserva el resto', () => {
  const alertas = [
    { tipo: 'inactividad', alumnoId: 'a1' },
    { tipo: 'evita_tipo', alumnoId: 'a1' },
    { tipo: 'inactividad', alumnoId: 'a2' },
  ];
  const quedan = filtrarAtendidas(alertas, ['inactividad:a1']);
  assert.equal(quedan.length, 2);
  assert.ok(!quedan.some((a) => a.tipo === 'inactividad' && a.alumnoId === 'a1'));
});

test('filtrarAtendidas: sin atendidas devuelve todo; con todas atendidas, nada', () => {
  const alertas = [{ tipo: 'adelantado', alumnoId: 'a3' }];
  assert.equal(filtrarAtendidas(alertas, []).length, 1);
  assert.equal(filtrarAtendidas(alertas, ['adelantado:a3']).length, 0);
});
