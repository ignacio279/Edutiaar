// Unit — relato de la auditoría (fase "Auditoría legible", 2026-08-18).
// Lógica pura de web/lib/admin/auditoria-relato.ts: clasificar cada acción en
// clave/rutina, redactar el titular en castellano y agrupar en una sola fila
// las cadenas de pase y de caso ARCO.
//
// Spec: docs/superpowers/specs/2026-08-18-auditoria-legible-design.md
//
// Invariantes que este archivo congela:
//   · una acción DESCONOCIDA es clave (D4: fallar hacia lo visible)
//   · ningún titular lleva el nombre de un alumno (D2)
//   · la cadena se fecha por su ÚLTIMO hecho (D5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCIONES_RUTINA,
  CATEGORIAS,
  armarFeed,
  categoriaDe,
  actorDe,
  filtrarFeed,
  idCorto,
  importanciaDe,
  redactar,
} from '../../web/lib/admin/auditoria-relato.ts';
import { ACCIONES_RUTINA as ACCIONES_RUTINA_SERVER } from '../../supabase/functions/_shared/auditoria-clasificacion.ts';

const ALUMNO = 'a3f24c9b-1111-2222-3333-444455559c4c';
const OTRO_ALUMNO = '9b71e0aa-1111-2222-3333-4444555566e0';

const NOMBRES = {
  escuelas: { e1: 'Cerro Azul', e2: 'San Martín' },
  perfiles: { d1: 'Marta Suárez', p9: 'Jorge Ruiz' },
  instituciones: { i1: 'Fundación Norte' },
};

const CONSENTIMIENTOS = {
  t1: { adulto_nombre: 'María González', adulto_vinculo: 'madre', via: 'link', otorgado_at: '2026-08-14T09:05:00Z' },
};

let n = 0;
const ev = (over = {}) => ({
  id: `ev${++n}`,
  actor_id: 'admin1',
  actor_email: 'ignacio@edutia.ar',
  nivel: 'super',
  accion: 'crear_colegio',
  entidad: 'escuela',
  entidad_id: 'e1',
  detalle: null,
  created_at: '2026-08-14T09:00:00Z',
  ...over,
});

const di = (e) => redactar(e, NOMBRES, CONSENTIMIENTOS);

// ── idCorto ────────────────────────────────────────────────────────────────

test('idCorto: muestra las dos puntas del uuid', () => {
  assert.equal(idCorto(ALUMNO), 'a3f2…9c4c');
});

test('idCorto: tolera null, vacío y strings cortos', () => {
  assert.equal(idCorto(null), '—');
  assert.equal(idCorto(''), '—');
  assert.equal(idCorto('abc'), 'abc');
});

// ── Clasificación clave / rutina (D3, D4) ──────────────────────────────────

test('clasificación: las acciones sobre chicos son clave', () => {
  for (const a of [
    'transferencia_solicitada', 'transferencia_confirmada', 'transferencia_asistida',
    'transferencia_denegada', 'alumno_transferido_activado', 'arco_acceso_exportado',
    'arco_rectificacion', 'arco_cancelacion_solicitada', 'arco_cancelacion_ejecutada',
    'arco_cancelacion_rechazada',
  ]) {
    assert.equal(importanciaDe(a), 'clave', a);
    assert.equal(categoriaDe(a), 'chicos', a);
  }
});

test('clasificación: maestras, colegios, acceso, instituciones y poder son clave', () => {
  const esperado = {
    crear_maestra: 'maestras', borrar_maestra: 'maestras', reset_password_maestra: 'maestras',
    suspender_maestra: 'maestras', activar_maestra: 'maestras', reasignar_maestra: 'maestras',
    crear_colegio: 'colegios', cambiar_estado_colegio: 'colegios',
    crear_licencia: 'acceso', editar_licencia: 'acceso', asignar_cupo: 'acceso',
    quitar_cupo: 'acceso', set_trial: 'acceso', extender_trial: 'acceso',
    finalizar_trial: 'acceso', set_limites: 'acceso', set_features: 'acceso',
    aplicar_preset: 'acceso',
    crear_institucion: 'instituciones', estado_institucion: 'instituciones',
    crear_admin_institucion: 'instituciones', suspender_admin_institucion: 'instituciones',
    reactivar_admin_institucion: 'instituciones', asignar_colegio_institucion: 'instituciones',
    quitar_colegio_institucion: 'instituciones',
    crear_admin: 'poder', cambiar_nivel_admin: 'poder', desactivar_admin: 'poder',
    reactivar_admin: 'poder', ver_como: 'poder', crear_anuncio: 'poder',
  };
  for (const [accion, categoria] of Object.entries(esperado)) {
    assert.equal(importanciaDe(accion), 'clave', accion);
    assert.equal(categoriaDe(accion), categoria, accion);
  }
});

test('clasificación: lo ruidoso es rutina', () => {
  for (const a of [
    'nap_revision_fijar', 'nap_backfill', 'recalcular_alertas', 'job_nocturno',
    'atender_alerta', 'crear_nota', 'borrar_nota', 'editar_contacto',
    'editar_colegio', 'editar_institucion', 'editar_anuncio', 'activar_anuncio',
    'desactivar_anuncio', 'borrar_anuncio',
  ]) {
    assert.equal(importanciaDe(a), 'rutina', a);
  }
});

test('paridad: la lista de rutinarias del front y la del server son idénticas', () => {
  // El front esconde y el server filtra en la query. Si se despegan, el toggle
  // "ver también lo rutinario" miente. Mismo patrón que planes.ts/provincias.ts.
  assert.deepEqual([...ACCIONES_RUTINA].sort(), [...ACCIONES_RUTINA_SERVER].sort());
});

test('D4: una acción desconocida es CLAVE, no rutina', () => {
  assert.equal(importanciaDe('accion_que_no_existe_todavia'), 'clave');
  assert.equal(categoriaDe('accion_que_no_existe_todavia'), 'sistema');
});

test('D4: la acción desconocida se redacta con su slug crudo y la entidad', () => {
  const t = di(ev({ accion: 'invento_nuevo', entidad: 'escuela' }));
  assert.match(t, /invento_nuevo/);
  assert.match(t, /escuela/);
});

test('D4: una acción desconocida sin entidad tampoco rompe', () => {
  const t = di(ev({ accion: 'invento_suelto', entidad: null, entidad_id: null }));
  assert.match(t, /invento_suelto/);
});

test('CATEGORIAS cubre todas las categorías que devuelve categoriaDe', () => {
  const claves = new Set(CATEGORIAS.map((c) => c.key));
  for (const a of ['ver_como', 'crear_colegio', 'crear_maestra', 'set_trial',
    'crear_institucion', 'arco_rectificacion', 'nap_backfill']) {
    assert.ok(claves.has(categoriaDe(a)), `${a} → ${categoriaDe(a)}`);
  }
});

// ── Titulares: chicos (D2 — nunca el nombre del alumno) ────────────────────

test('titular: pase confirmado nombra los colegios y NO al alumno', () => {
  const t = di(ev({
    accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1',
    detalle: { alumno_id: ALUMNO, escuela_destino: 'e2', via: 'link', adulto_vinculo: 'madre' },
  }));
  assert.match(t, /a3f2…9c4c/);
  assert.match(t, /San Martín/);
});

test('titular: pase solicitado usa escuela_destino_id (la otra clave del detalle)', () => {
  const t = di(ev({
    accion: 'transferencia_solicitada', entidad: 'transferencia', entidad_id: 't1',
    detalle: { alumno_id: ALUMNO, escuela_destino_id: 'e2' },
  }));
  assert.match(t, /San Martín/);
  assert.match(t, /a3f2…9c4c/);
});

test('titular: cancelación ARCO ejecutada avisa que es borrado físico', () => {
  const t = di(ev({
    accion: 'arco_cancelacion_ejecutada', entidad: 'arco_caso', entidad_id: 'c1',
    detalle: { agregado: { grado: 3 } },
  }));
  assert.match(t, /borrado físico/i);
});

test('titular: rectificación ARCO lista los campos tocados', () => {
  const t = di(ev({
    accion: 'arco_rectificacion', entidad: 'arco_caso', entidad_id: 'c1',
    detalle: { alumno_id: OTRO_ALUMNO, campos: ['nombre', 'avatar'] },
  }));
  assert.match(t, /nombre/);
  assert.match(t, /avatar/);
});

test('titular: cancelación ARCO rechazada no rompe sin detalle', () => {
  const t = di(ev({
    accion: 'arco_cancelacion_rechazada', entidad: 'arco_caso', entidad_id: 'c1', detalle: null,
  }));
  assert.ok(t.length > 0);
  assert.doesNotMatch(t, /undefined|null|\[object/);
});

// ── Titulares: el resto ────────────────────────────────────────────────────

test('titular: suspender un colegio se dice "suspendió", no "cambió de X a Y"', () => {
  const t = di(ev({
    accion: 'cambiar_estado_colegio', entidad: 'escuela', entidad_id: 'e1',
    detalle: { de: 'activo', a: 'suspendido' },
  }));
  assert.match(t, /[Ss]uspendió/);
  assert.match(t, /Cerro Azul/);
});

test('titular: reset de contraseña nombra a la maestra', () => {
  const t = di(ev({
    accion: 'reset_password_maestra', entidad: 'perfil', entidad_id: 'd1', detalle: null,
  }));
  assert.match(t, /Marta Suárez/);
});

test('titular: ver como nombra a la maestra impersonada', () => {
  const t = di(ev({ accion: 'ver_como', entidad: 'perfil', entidad_id: 'd1', detalle: null }));
  assert.match(t, /Marta Suárez/);
});

test('titular: extender trial dice cuántos días y hasta cuándo', () => {
  const t = di(ev({
    accion: 'extender_trial', entidad: 'escuela', entidad_id: 'e1',
    detalle: { dias: 30, nuevo_fin: '2026-09-15' },
  }));
  assert.match(t, /30/);
  assert.match(t, /15 de septiembre de 2026/);
  assert.match(t, /Cerro Azul/);
});

test('titular: anuncio global se distingue del anuncio a un colegio', () => {
  const global = di(ev({
    accion: 'crear_anuncio', entidad: 'anuncio', entidad_id: 'an1',
    detalle: { titulo: 'Mantenimiento el martes', escuela_id: null },
  }));
  assert.match(global, /Mantenimiento el martes/);
  assert.match(global, /todos los colegios/i);

  const uno = di(ev({
    accion: 'crear_anuncio', entidad: 'anuncio', entidad_id: 'an1',
    detalle: { titulo: 'Aviso', escuela_id: 'e1' },
  }));
  assert.match(uno, /Cerro Azul/);
});

test('titular: reasignar maestra muestra colegio de origen y destino', () => {
  const t = di(ev({
    accion: 'reasignar_maestra', entidad: 'perfil', entidad_id: 'd1',
    detalle: { de: 'e1', a: 'e2' },
  }));
  assert.match(t, /Cerro Azul/);
  assert.match(t, /San Martín/);
});

test('titular: un id que no resuelve cae al id corto, no a "undefined"', () => {
  const t = di(ev({
    accion: 'cambiar_estado_colegio', entidad: 'escuela', entidad_id: 'e404',
    detalle: { de: 'activo', a: 'archivado' },
  }));
  assert.match(t, /e404/);
  assert.doesNotMatch(t, /undefined|null|\[object/);
});

test('titular: institución y sus admins', () => {
  assert.match(
    di(ev({ accion: 'crear_institucion', entidad: 'institucion', entidad_id: 'i1', detalle: { nombre: 'Fundación Norte', tipo: 'fundacion' } })),
    /Fundación Norte/,
  );
  assert.match(
    di(ev({ accion: 'asignar_colegio_institucion', entidad: 'escuela', entidad_id: 'e1', detalle: { de: null, a: 'i1' } })),
    /Cerro Azul/,
  );
});

test('D2 estructural: ningún titular lleva un nombre de alumno', () => {
  // El módulo no recibe nombres de alumnos por diseño: aunque alguien los
  // metiera en `nombres.perfiles`, el redactor de alumnos usa SIEMPRE el id.
  const nombresConAlumno = { ...NOMBRES, perfiles: { ...NOMBRES.perfiles, [ALUMNO]: 'Juan Pérez' } };
  const eventos = [
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
    ev({ accion: 'arco_acceso_exportado', entidad: 'arco_caso', entidad_id: 'c1', detalle: { alumno_id: ALUMNO } }),
    ev({ accion: 'arco_rectificacion', entidad: 'arco_caso', entidad_id: 'c2', detalle: { alumno_id: ALUMNO, campos: ['nombre'] } }),
    ev({ accion: 'alumno_transferido_activado', entidad: 'transferencia', entidad_id: 'm1', detalle: { alumno_id: ALUMNO, grado: 3 } }),
  ];
  for (const e of eventos) {
    assert.doesNotMatch(redactar(e, nombresConAlumno, {}), /Juan Pérez/, e.accion);
  }
});

// ── Acciones que escriben los triggers de la base (D8) ─────────────────────
// No pasan por registrarAuditoria, así que no aparecen grepeando las fns: se
// descubrieron mirando la tabla real. matricula_abierta era la acción MÁS
// frecuente de todas (67 de ~180 filas).

test('D8: matricula_abierta/cerrada son rutina — duplican a alumno_transicion', () => {
  assert.equal(importanciaDe('matricula_abierta'), 'rutina');
  assert.equal(importanciaDe('matricula_cerrada'), 'rutina');
});

test('D8: alumno_transicion, arco_oposicion y docente_creado son clave', () => {
  for (const a of ['alumno_transicion', 'arco_oposicion', 'docente_creado']) {
    assert.equal(importanciaDe(a), 'clave', a);
  }
  assert.equal(categoriaDe('alumno_transicion'), 'chicos');
  assert.equal(categoriaDe('arco_oposicion'), 'chicos');
  assert.equal(categoriaDe('docente_creado'), 'maestras');
});

test('D8: el slug real es reactivar_maestra, no activar_maestra', () => {
  assert.equal(categoriaDe('reactivar_maestra'), 'maestras');
  assert.equal(importanciaDe('reactivar_maestra'), 'clave');
  const t = di(ev({ accion: 'reactivar_maestra', entidad: 'perfil', entidad_id: 'd1', detalle: null }));
  assert.match(t, /Marta Suárez/);
});

test('D8: alumno_transicion usa un verbo por estado destino', () => {
  const caso = (d) => di(ev({ accion: 'alumno_transicion', entidad: 'perfil', entidad_id: ALUMNO, detalle: d }));
  assert.match(caso({ de: 'activo', a: 'en_transito', motivo: 'migracion' }), /salió de su colegio por un pase/);
  assert.match(caso({ de: 'en_transito', a: 'activo', escuela_id: 'e2' }), /quedó activo en San Martín/);
  assert.match(caso({ de: 'activo', a: 'egresado', motivo: 'egreso' }), /egresó/);
  assert.match(caso({ de: 'activo', a: 'baja', motivo: 'arco_baja' }), /baja por un pedido ARCO/);
  // Estado nuevo que nadie previó: no rompe, cae al genérico.
  assert.match(caso({ de: 'activo', a: 'inventado' }), /de activo a inventado/);
});

test('D8: alumno_transicion lee el alumno de entidad_id, no del detalle', () => {
  const t = di(ev({ accion: 'alumno_transicion', entidad: 'perfil', entidad_id: ALUMNO, detalle: { de: 'activo', a: 'egresado' } }));
  assert.match(t, /a3f2…9c4c/);
});

test('D8: arco_oposicion distingue activar de levantar', () => {
  const on = di(ev({ accion: 'arco_oposicion', entidad: 'perfil', entidad_id: ALUMNO, detalle: { excluido_procesamiento: true } }));
  const off = di(ev({ accion: 'arco_oposicion', entidad: 'perfil', entidad_id: ALUMNO, detalle: { excluido_procesamiento: false } }));
  assert.match(on, /Activó la oposición/);
  assert.match(off, /Levantó la oposición/);
});

test('D8: matricula_abierta/cerrada tampoco nombran al alumno', () => {
  const nombresConAlumno = { ...NOMBRES, perfiles: { ...NOMBRES.perfiles, [ALUMNO]: 'Juan Pérez' } };
  for (const e of [
    ev({ accion: 'matricula_abierta', entidad: 'matricula', entidad_id: 'm1', detalle: { alumno_id: ALUMNO, escuela_id: 'e1', consentimiento_id: null } }),
    ev({ accion: 'matricula_cerrada', entidad: 'matricula', entidad_id: 'm1', detalle: { alumno_id: ALUMNO, motivo: 'egreso' } }),
    ev({ accion: 'alumno_transicion', entidad: 'perfil', entidad_id: ALUMNO, detalle: { de: 'activo', a: 'egresado' } }),
    ev({ accion: 'arco_oposicion', entidad: 'perfil', entidad_id: ALUMNO, detalle: { excluido_procesamiento: true } }),
  ]) {
    assert.doesNotMatch(redactar(e, nombresConAlumno, {}), /Juan Pérez/, e.accion);
  }
});

test('D8: matricula_abierta nombra el colegio y el motivo del cierre', () => {
  assert.match(
    di(ev({ accion: 'matricula_abierta', entidad: 'matricula', entidad_id: 'm1', detalle: { alumno_id: ALUMNO, escuela_id: 'e1' } })),
    /Cerro Azul/,
  );
  assert.match(
    di(ev({ accion: 'matricula_cerrada', entidad: 'matricula', entidad_id: 'm1', detalle: { alumno_id: ALUMNO, motivo: 'migracion' } })),
    /por un pase/,
  );
});

// ── actorDe: el uuid de ceros NO siempre es "la familia" ───────────────────

test('actorDe: con email, gana el email', () => {
  assert.equal(actorDe(ev({ actor_email: 'ignacio@edutia.ar' }), NOMBRES), 'ignacio@edutia.ar');
});

test('actorDe: ceros en transferencia_confirmada = la familia', () => {
  const e = ev({ accion: 'transferencia_confirmada', actor_id: '00000000-0000-0000-0000-000000000000', actor_email: null, nivel: null });
  assert.equal(actorDe(e, NOMBRES), 'La familia');
});

test('actorDe: ceros en cualquier otra acción = el sistema, NO la familia', () => {
  for (const a of ['matricula_abierta', 'matricula_cerrada', 'alumno_transicion']) {
    const e = ev({ accion: a, actor_id: '00000000-0000-0000-0000-000000000000', actor_email: null, nivel: null });
    assert.equal(actorDe(e, NOMBRES), 'El sistema', a);
  }
});

test('actorDe: evento de trigger con actor_id real resuelve a la docente', () => {
  const e = ev({ accion: 'matricula_abierta', actor_id: 'd1', actor_email: null, nivel: null });
  assert.equal(actorDe(e, NOMBRES), 'Marta Suárez');
});

test('actorDe: actor_id que no resuelve cae al id corto, no a undefined', () => {
  const e = ev({ accion: 'matricula_abierta', actor_id: ALUMNO, actor_email: null, nivel: null });
  assert.equal(actorDe(e, NOMBRES), 'a3f2…9c4c');
});

// ── Agrupación de cadenas (D5) ─────────────────────────────────────────────

const feed = (eventos, nombres = NOMBRES, cons = CONSENTIMIENTOS) => armarFeed(eventos, nombres, cons);

test('cadena: los eventos de un mismo pase colapsan en UNA fila', () => {
  const items = feed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
    ev({ accion: 'transferencia_solicitada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-12T14:20:00Z', detalle: { alumno_id: ALUMNO, escuela_destino_id: 'e2' } }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].eventos.length, 2);
  // 3 pasos: los 2 hechos auditados + el consentimiento, que no es una fila de
  // `auditoria` pero es parte de la historia (D2).
  assert.equal(items[0].pasos.length, 3);
});

test('cadena: se fecha por el ÚLTIMO hecho', () => {
  const items = feed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
    ev({ accion: 'transferencia_solicitada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-12T14:20:00Z', detalle: { alumno_id: ALUMNO, escuela_destino_id: 'e2' } }),
  ]);
  assert.equal(items[0].fecha, '2026-08-14T09:05:00Z');
});

test('cadena: los pasos van en orden cronológico ascendente', () => {
  const items = feed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
    ev({ accion: 'transferencia_solicitada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-12T14:20:00Z', detalle: { alumno_id: ALUMNO, escuela_destino_id: 'e2' } }),
  ]);
  const fechas = items[0].pasos.map((p) => p.fecha);
  assert.deepEqual(fechas, ['2026-08-12T14:20:00Z', '2026-08-14T09:05:00Z', '2026-08-14T09:05:00Z']);
  // Con el mismo instante, autorizar va ANTES que confirmar.
  assert.match(items[0].pasos[1].texto, /Autorizó/);
  assert.match(items[0].pasos[2].texto, /confirmó/i);
});

test('cadena: el consentimiento entra como un paso propio, con nombre y vínculo (D2)', () => {
  const items = feed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
  ]);
  const texto = items[0].pasos.map((p) => p.texto).join(' | ');
  assert.match(texto, /María González/);
  assert.match(texto, /madre/);
  assert.match(texto, /link/);
});

test('cadena: sin consentimiento cargado no se inventa un paso', () => {
  const items = armarFeed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't9', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
  ], NOMBRES, {});
  assert.equal(items[0].pasos.length, 1);
  assert.doesNotMatch(items[0].pasos[0].texto, /Autorizó/);
});

test('cadena: transferencia_confirmada se atribuye a la familia, nunca a una persona (D6.2)', () => {
  const items = feed([
    ev({
      accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1',
      actor_id: '00000000-0000-0000-0000-000000000000', actor_email: null, nivel: null,
      created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' },
    }),
  ]);
  const paso = items[0].pasos.find((p) => /confirmó/i.test(p.texto));
  assert.ok(paso, 'falta el paso de confirmación');
  assert.match(paso.texto, /familia/i);
  assert.doesNotMatch(paso.texto, /ignacio@edutia\.ar/);
});

test('cadena ARCO: solicitada y ejecutada colapsan en una fila', () => {
  const items = feed([
    ev({ accion: 'arco_cancelacion_ejecutada', entidad: 'arco_caso', entidad_id: 'c1', created_at: '2026-08-16T10:00:00Z', detalle: { agregado: {} } }),
    ev({ accion: 'arco_cancelacion_solicitada', entidad: 'arco_caso', entidad_id: 'c1', created_at: '2026-08-10T10:00:00Z', detalle: { alumno_id: OTRO_ALUMNO } }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].eventos.length, 2);
  assert.equal(items[0].fecha, '2026-08-16T10:00:00Z');
});

test('D6.1: alumno_transferido_activado NO agrupa con el pase (guarda el id de la matrícula)', () => {
  const items = feed([
    ev({ accion: 'alumno_transferido_activado', entidad: 'transferencia', entidad_id: 'm1', created_at: '2026-08-15T08:00:00Z', detalle: { alumno_id: ALUMNO, grado: 3 } }),
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
  ]);
  assert.equal(items.length, 2);
});

test('D5: dos pases distintos no se mezclan', () => {
  const items = feed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't2', created_at: '2026-08-13T09:05:00Z', detalle: { alumno_id: OTRO_ALUMNO, escuela_destino: 'e1' } }),
  ]);
  assert.equal(items.length, 2);
});

test('D5: lo que no es pase ni ARCO nunca agrupa, aunque comparta entidad_id', () => {
  const items = feed([
    ev({ accion: 'set_limites', entidad: 'escuela', entidad_id: 'e1', created_at: '2026-08-14T09:00:00Z', detalle: { limites: {} } }),
    ev({ accion: 'cambiar_estado_colegio', entidad: 'escuela', entidad_id: 'e1', created_at: '2026-08-13T09:00:00Z', detalle: { de: 'trial', a: 'activo' } }),
  ]);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.pasos.length === 0));
});

test('D5: cadena partida entre páginas → el huérfano se muestra solo, con su titular', () => {
  const items = feed([
    ev({ accion: 'transferencia_confirmada', entidad: 'transferencia', entidad_id: 't1', created_at: '2026-08-14T09:05:00Z', detalle: { alumno_id: ALUMNO, escuela_destino: 'e2' } }),
  ]);
  assert.equal(items.length, 1);
  assert.ok(items[0].titular.length > 0);
  assert.doesNotMatch(items[0].titular, /undefined/);
});

test('armarFeed: ordena descendente por fecha y tolera lista vacía', () => {
  assert.deepEqual(armarFeed([], NOMBRES, {}), []);
  const items = feed([
    ev({ accion: 'crear_colegio', entidad_id: 'e1', created_at: '2026-08-10T09:00:00Z', detalle: { nombre: 'A' } }),
    ev({ accion: 'crear_colegio', entidad_id: 'e2', created_at: '2026-08-18T09:00:00Z', detalle: { nombre: 'B' } }),
  ]);
  assert.deepEqual(items.map((i) => i.fecha), ['2026-08-18T09:00:00Z', '2026-08-10T09:00:00Z']);
});

test('armarFeed: la importancia de una cadena es la más alta de sus eventos', () => {
  const items = feed([
    ev({ accion: 'arco_cancelacion_ejecutada', entidad: 'arco_caso', entidad_id: 'c1', created_at: '2026-08-16T10:00:00Z', detalle: { agregado: {} } }),
  ]);
  assert.equal(items[0].importancia, 'clave');
});

// ── Filtro de la vista (D3) ────────────────────────────────────────────────

test('filtrarFeed: por defecto esconde la rutina', () => {
  const items = feed([
    ev({ accion: 'ver_como', entidad: 'perfil', entidad_id: 'd1', created_at: '2026-08-18T09:00:00Z' }),
    ev({ accion: 'atender_alerta', entidad: 'admin_alerta_atendida', entidad_id: null, created_at: '2026-08-17T09:00:00Z', detalle: { clave: 'x' } }),
  ]);
  const soloClave = filtrarFeed(items, { verRutina: false });
  assert.equal(soloClave.length, 1);
  assert.equal(soloClave[0].importancia, 'clave');
});

test('filtrarFeed: con verRutina true vuelve todo', () => {
  const items = feed([
    ev({ accion: 'ver_como', entidad: 'perfil', entidad_id: 'd1', created_at: '2026-08-18T09:00:00Z' }),
    ev({ accion: 'atender_alerta', entidad: 'admin_alerta_atendida', entidad_id: null, created_at: '2026-08-17T09:00:00Z', detalle: { clave: 'x' } }),
  ]);
  assert.equal(filtrarFeed(items, { verRutina: true }).length, 2);
});

test('filtrarFeed: el chip de categoría acota, y sin categoría no filtra', () => {
  const items = feed([
    ev({ accion: 'ver_como', entidad: 'perfil', entidad_id: 'd1', created_at: '2026-08-18T09:00:00Z' }),
    ev({ accion: 'crear_colegio', entidad_id: 'e1', created_at: '2026-08-17T09:00:00Z', detalle: { nombre: 'A' } }),
  ]);
  assert.equal(filtrarFeed(items, { verRutina: true, categoria: 'poder' }).length, 1);
  assert.equal(filtrarFeed(items, { verRutina: true, categoria: '' }).length, 2);
});
