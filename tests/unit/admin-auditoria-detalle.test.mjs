// Unit — detalle EN PALABRAS de la auditoría (2026-08-18).
// Lógica pura de web/lib/admin/auditoria-detalle.ts: el jsonb crudo de cada
// evento convertido en un párrafo + filas "campo: valor" en castellano.
//
// Invariantes que este archivo congela:
//   · el detalle NUNCA muestra una llave cruda con guión bajo ni un uuid entero
//   · un alumno se nombra siempre por id corto (D2), nunca por nombre
//   · una acción o una clave desconocida no rompe ni esconde nada
//   · las fechas no se corren de día (se formatean sin Date)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describir,
  fechaEnPalabras,
  sobreQue,
} from '../../web/lib/admin/auditoria-detalle.ts';

const ALUMNO = 'a3f24c9b-1111-2222-3333-444455559c4c';
const ESC_1 = 'e1111111-2222-3333-4444-555566667777';
const ESC_2 = 'e2222222-3333-4444-5555-666677778888';

const NOMBRES = {
  escuelas: { [ESC_1]: 'Cerro Azul', [ESC_2]: 'San Martín' },
  perfiles: { d1: 'Marta Suárez' },
  instituciones: { i1: 'Fundación Norte' },
};

let n = 0;
const ev = (accion, extra = {}) => ({
  id: `ev${++n}`,
  actor_id: 'admin-1',
  actor_email: 'jorge@edutia.ar',
  nivel: 'super',
  accion,
  entidad: null,
  entidad_id: null,
  detalle: null,
  created_at: '2026-08-14T09:05:00Z',
  ...extra,
});

const valorDe = (datos, etiqueta) => datos.find((d) => d.etiqueta === etiqueta)?.valor;
const textoEntero = (r) => [r.relato, r.sobre, ...r.datos.flatMap((d) => [d.etiqueta, d.valor])].join(' | ');

// ── Lo que NO puede aparecer nunca ─────────────────────────────────────────

test('ningún detalle escupe una llave cruda, un slug ni un uuid entero', () => {
  const casos = [
    ev('cambiar_estado_colegio', { entidad: 'escuela', entidad_id: ESC_1, detalle: { de: 'trial', a: 'activo' } }),
    ev('set_features', { entidad: 'escuela', entidad_id: ESC_1, detalle: { plan: 'docente', flags: { sol: true, luna: { activa: true, alertas: true, boletines: false, chat: true }, terra: false } } }),
    ev('set_limites', { entidad: 'escuela', entidad_id: ESC_1, detalle: { limites: { sol_mes: 900, chats_mes: 200 } } }),
    ev('alumno_transicion', { entidad: 'perfil', entidad_id: ALUMNO, detalle: { de: 'activo', a: 'en_transito', motivo: 'migracion', escuela_id: ESC_1, matricula_id: ESC_2 } }),
    ev('matricula_abierta', { entidad: 'matricula', entidad_id: ESC_2, detalle: { alumno_id: ALUMNO, escuela_id: ESC_1, consentimiento_id: null } }),
    ev('atender_alerta', { entidad: 'admin_alerta_atendida', detalle: { clave: `trial:${ESC_1}:2026-08-18` } }),
    ev('arco_cancelacion_ejecutada', { entidad: 'arco_caso', entidad_id: ESC_2, detalle: { agregado: { sesiones: 12, respuestas: 548, nodos_dominados: 3, grado: 3, provincia: 'Chaco', rango_fechas: { desde: '2026-05-02', hasta: '2026-08-01' } } } }),
    ev('crear_admin', { entidad: 'plataforma_admin', entidad_id: 'd1', detalle: { email: 'ana@edutia.ar', nivel: 'operativo' } }),
  ];

  for (const e of casos) {
    const t = textoEntero(describir(e, NOMBRES));
    assert.ok(!/[a-z]+_[a-z]+/.test(t.replace(/[a-z]+@[^\s|]+/g, '')), `llave cruda en ${e.accion}: ${t}`);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t), `uuid entero en ${e.accion}: ${t}`);
  }
});

test('un alumno se nombra por id corto, aunque el diccionario lo tuviera', () => {
  const nombres = { ...NOMBRES, perfiles: { ...NOMBRES.perfiles, [ALUMNO]: 'Ludmila Paz' } };
  const r = describir(
    ev('transferencia_solicitada', { entidad: 'transferencia', entidad_id: ESC_2, detalle: { alumno_id: ALUMNO, escuela_destino_id: ESC_2 } }),
    nombres,
  );
  assert.ok(!textoEntero(r).includes('Ludmila'));
  assert.equal(valorDe(r.datos, 'Chico'), 'alumno a3f2…9c4c');
});

test('la entidad "perfil" de un evento de trigger se lee como chico, no como maestra', () => {
  assert.match(sobreQue(ev('alumno_transicion', { entidad: 'perfil', entidad_id: ALUMNO }), NOMBRES), /^Un chico — alumno a3f2…9c4c$/);
  assert.match(sobreQue(ev('arco_oposicion', { entidad: 'perfil', entidad_id: ALUMNO }), NOMBRES), /^Un chico/);
  // Una maestra de verdad sí sale con nombre.
  assert.equal(sobreQue(ev('suspender_maestra', { entidad: 'perfil', entidad_id: 'd1' }), NOMBRES), 'Maestra — Marta Suárez');
});

// ── Que se entienda ────────────────────────────────────────────────────────

test('el párrafo explica la consecuencia, no solo el hecho', () => {
  const r = describir(ev('set_trial', { entidad: 'escuela', entidad_id: ESC_1, detalle: { inicio: '2026-08-01', fin: '2026-09-30' } }), NOMBRES);
  assert.match(r.relato, /no se borra nada/i);
  assert.equal(valorDe(r.datos, 'Empieza'), '1 de agosto de 2026');
  assert.equal(valorDe(r.datos, 'Vence'), '30 de septiembre de 2026');
});

test('"de" y "a" se leen distinto según la acción', () => {
  const colegio = describir(ev('cambiar_estado_colegio', { entidad: 'escuela', entidad_id: ESC_1, detalle: { de: 'trial', a: 'suspendido' } }), NOMBRES);
  assert.equal(valorDe(colegio.datos, 'Antes estaba'), 'probando la plataforma');
  assert.equal(valorDe(colegio.datos, 'Ahora está'), 'suspendido');

  const maestra = describir(ev('reasignar_maestra', { entidad: 'perfil', entidad_id: 'd1', detalle: { de: ESC_1, a: ESC_2 } }), NOMBRES);
  assert.equal(valorDe(maestra.datos, 'Estaba en el colegio'), 'Cerro Azul');
  assert.equal(valorDe(maestra.datos, 'Pasa al colegio'), 'San Martín');
});

test('los interruptores de funciones se leen prendida/apagada, y LUNA apagada no lista sus partes', () => {
  const prendida = describir(ev('set_features', { detalle: { flags: { sol: true, luna: { activa: true, alertas: true, boletines: false, chat: true }, terra: false } } }));
  const v = valorDe(prendida.datos, 'Funciones');
  assert.match(v, /SOL, el copiloto de los chicos: prendida/);
  assert.match(v, /boletines mensuales: apagada/);

  const apagada = describir(ev('set_features', { detalle: { flags: { sol: true, luna: { activa: false, alertas: true, boletines: true, chat: true }, terra: false } } }));
  const v2 = valorDe(apagada.datos, 'Funciones');
  assert.match(v2, /LUNA, la copiloto de la maestra: apagada/);
  assert.ok(!v2.includes('boletines mensuales'), 'con LUNA apagada no se enumeran sus partes');
});

test('los topes se leen con unidad, y sin topes custom se dice que vuelve al default', () => {
  assert.equal(
    valorDe(describir(ev('set_limites', { detalle: { limites: { sol_mes: 900 } } })).datos, 'Topes por mes'),
    'hasta 900 ejercicios y correcciones de SOL por mes',
  );
  assert.equal(
    valorDe(describir(ev('set_limites', { detalle: { limites: null } })).datos, 'Topes por mes'),
    'Vuelve a los topes de siempre',
  );
});

test('la primera inscripción se explica en vez de mostrar un identificador vacío', () => {
  const primera = describir(ev('matricula_abierta', { detalle: { alumno_id: ALUMNO, escuela_id: ESC_1, consentimiento_id: null } }), NOMBRES);
  assert.match(valorDe(primera.datos, 'Autorización de la familia'), /primera vez/);

  const reapertura = describir(ev('matricula_abierta', { detalle: { alumno_id: ALUMNO, escuela_id: ESC_1, consentimiento_id: ESC_2 } }), NOMBRES);
  assert.equal(valorDe(reapertura.datos, 'Autorización de la familia'), 'Sí, quedó registrada');
});

test('la clave de un aviso se parte en qué pasó, sobre quién y cuándo', () => {
  assert.equal(
    valorDe(describir(ev('atender_alerta', { detalle: { clave: `trial:${ESC_1}:2026-08-18` } }), NOMBRES).datos, 'Aviso'),
    'colegio con la prueba por vencer — Cerro Azul — 18 de agosto de 2026',
  );
  // Un colegio que no está en el diccionario no escupe el uuid entero.
  assert.equal(
    valorDe(describir(ev('atender_alerta', { detalle: { clave: 'costo:ffffffff-1111-2222-3333-444455556666:2026-08' } })).datos, 'Aviso'),
    'colegio con el costo disparado — identificador ffff…6666 — 2026-08',
  );
});

test('el resumen anónimo del borrado ARCO se lee en una línea', () => {
  const r = describir(ev('arco_cancelacion_ejecutada', {
    detalle: { agregado: { sesiones: 12, respuestas: 548, nodos_dominados: 3, grado: 3, provincia: 'Chaco', rango_fechas: { desde: '2026-05-02', hasta: '2026-08-01' } } },
  }));
  const v = valorDe(r.datos, 'Resumen anónimo que quedó');
  assert.match(v, /Ejercicios que respondió: 548/);
  assert.match(v, /Practicó entre: 2 de mayo de 2026 y 1 de agosto de 2026/);
  assert.match(r.relato, /no se puede deshacer/i);
});

test('la lista de campos tocados se traduce', () => {
  assert.equal(
    valorDe(describir(ev('arco_rectificacion', { detalle: { alumno_id: ALUMNO, campos: ['nombre', 'avatar'] } })).datos, 'Qué se tocó'),
    'el nombre, el dibujito del perfil',
  );
});

test('la oposición dice en las dos direcciones qué implica', () => {
  const activa = describir(ev('arco_oposicion', { entidad: 'perfil', entidad_id: ALUMNO, detalle: { excluido_procesamiento: true } }));
  assert.match(activa.relato, /sigue usando la plataforma/i);
  assert.match(valorDe(activa.datos, 'Queda fuera de los promedios'), /^Sí/);

  const levantada = describir(ev('arco_oposicion', { entidad: 'perfil', entidad_id: ALUMNO, detalle: { excluido_procesamiento: false } }));
  assert.match(levantada.relato, /vuelven a contar/i);
  assert.match(valorDe(levantada.datos, 'Queda fuera de los promedios'), /^No/);
});

// ── Que nada se rompa ni se esconda ────────────────────────────────────────

test('una acción sin párrafo muestra igual sus datos', () => {
  const r = describir(ev('accion_que_no_existe_todavia', { entidad: 'escuela', entidad_id: ESC_1, detalle: { nombre: 'Escuela 12' } }), NOMBRES);
  assert.equal(r.relato, '');
  assert.equal(r.sobre, 'Colegio — Cerro Azul');
  assert.equal(valorDe(r.datos, 'Nombre'), 'Escuela 12');
});

test('una clave sin etiqueta se muestra con su nombre, no se esconde', () => {
  const r = describir(ev('crear_colegio', { detalle: { clave_nueva_del_futuro: 'algo' } }));
  assert.equal(valorDe(r.datos, 'clave_nueva_del_futuro'), 'algo');
});

test('un detalle nulo, vacío o con shape raro no rompe', () => {
  for (const detalle of [null, {}, [], 'texto', 7]) {
    const r = describir(ev('crear_colegio', { detalle }));
    assert.equal(Array.isArray(r.datos), true);
    assert.ok(typeof r.relato === 'string');
  }
});

test('un evento sin entidad lo dice con palabras', () => {
  assert.equal(describir(ev('job_nocturno')).sobre, 'No apunta a ningún registro en particular');
});

test('un colegio que no está en el diccionario cae a identificador corto, nunca a undefined', () => {
  const r = describir(ev('crear_maestra', { detalle: { email: 'ana@edutia.ar', escuela_id: 'ffffffff-1111-2222-3333-444455556666' } }), NOMBRES);
  assert.equal(valorDe(r.datos, 'Colegio'), 'identificador ffff…6666');
});

// ── Fechas ─────────────────────────────────────────────────────────────────

test('las fechas se formatean sin correrse de día', () => {
  assert.equal(fechaEnPalabras('2026-01-01'), '1 de enero de 2026');
  assert.equal(fechaEnPalabras('2026-12-31T23:59:59.999Z'), '31 de diciembre de 2026');
  assert.equal(fechaEnPalabras('2026-08-14T00:30:00-03:00'), '14 de agosto de 2026');
  assert.equal(fechaEnPalabras('no es una fecha'), null);
  assert.equal(fechaEnPalabras('2026-13-01'), null);
});
