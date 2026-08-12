// Unit — lógica pura del front del alumno golondrina (transferencias, ARCO,
// consentimientos, licencias) + los módulos hermanos de las Edge Functions
// nuevas. Todo con `now` inyectado: ninguna de estas funciones puede llamar a
// new Date() adentro. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  armarLinkAbsoluto, copyEstado, copyMotivo, copyVencimiento, diasHastaVencer,
  msgErrTransferencia, tokenDelFragmento, validarAutorizacion,
} from '../../web/lib/transferencias.ts';
import {
  mensajeDeuda, validarConsentimiento, copyEstadoConsentimiento,
} from '../../web/lib/consentimientos.ts';
import {
  confirmacionValida, lineasDelPlan, nombreArchivoLegajo, resumenDelPlan,
  seccionesDelLegajo, msgErrArco,
} from '../../web/lib/arco.ts';
import {
  copyCupos, copyVencimientoLicencia, cuposDe, diasHastaFin, extenderTreintaDias, porVencer,
  validarFormLicencia,
} from '../../web/lib/admin/licencias.ts';
import {
  armarSnapshotAnonimo, diffRectificacion, planDeBorrado,
} from '../../supabase/functions/admin-arco/arco-logica.ts';
import {
  estaBloqueada, estaVencida, registrarFallo, MAX_INTENTOS,
} from '../../supabase/functions/transferencia-confirmar/logica.ts';
import {
  calcularExpiracion, diasExpiracion, DIAS_EXPIRACION_DEFAULT,
} from '../../supabase/functions/gestion-transferencias/logica.ts';
import { precisionConK, fechasTrial, generarPasswordTemporal } from '../../supabase/functions/institucion-panel/validar.ts';

// Jueves 6 de agosto de 2026, 10:30 UTC.
const NOW = new Date(Date.UTC(2026, 7, 6, 10, 30));

// ── Transferencias: el form de la familia ───────────────────────────────────

test('validarAutorizacion: exige nombre y vínculo, con copy para la familia', () => {
  assert.equal(validarAutorizacion({ adulto_nombre: '  ', adulto_vinculo: 'madre' }).ok, false);
  assert.equal(validarAutorizacion({ adulto_nombre: 'Griselda', adulto_vinculo: 'abuela' }).ok, false);
  const ok = validarAutorizacion({ adulto_nombre: '  Griselda ', adulto_vinculo: 'madre' });
  assert.equal(ok.ok, true);
  assert.equal(ok.adulto_nombre, 'Griselda', 'recorta espacios');
});

test('tokenDelFragmento: tolera hash ausente, vacío o con solo "#"', () => {
  assert.equal(tokenDelFragmento('#abc123'), 'abc123');
  assert.equal(tokenDelFragmento('abc123'), 'abc123', 'sin # también sirve');
  assert.equal(tokenDelFragmento('#'), null);
  assert.equal(tokenDelFragmento(''), null);
  assert.equal(tokenDelFragmento(undefined), null);
});

test('armarLinkAbsoluto: no duplica la barra del origen', () => {
  assert.equal(armarLinkAbsoluto('https://www.edutia.ar/', 'ID', 'TOK'), 'https://www.edutia.ar/transferir/ID#TOK');
  assert.equal(armarLinkAbsoluto('https://www.edutia.ar', 'ID', 'TOK'), 'https://www.edutia.ar/transferir/ID#TOK');
});

test('diasHastaVencer / copyVencimiento: bordes de hoy, mañana y vencido', () => {
  assert.equal(diasHastaVencer('2026-08-06T23:00:00Z', NOW), 0);
  assert.equal(copyVencimiento('2026-08-06T23:00:00Z', NOW), 'Vence hoy');
  assert.equal(copyVencimiento('2026-08-07T01:00:00Z', NOW), 'Vence en 1 día', 'singular');
  assert.equal(copyVencimiento('2026-08-09T10:00:00Z', NOW), 'Vence en 3 días');
  assert.equal(copyVencimiento('2026-08-05T10:00:00Z', NOW), 'Venció hace 1 día');
  assert.equal(copyVencimiento(null, NOW), 'Sin fecha de vencimiento');
});

test('copyEstado y copyMotivo: todo estado conocido tiene copy humano', () => {
  for (const e of ['pendiente', 'confirmada', 'denegada', 'expirada']) {
    assert.ok(copyEstado(e).copy.length > 3, e);
  }
  assert.equal(copyMotivo('migracion'), 'Se mudó');
  assert.equal(copyMotivo('arco_baja'), 'Baja a pedido de la familia');
  assert.equal(copyMotivo(null), 'Abierta');
});

test('msgErrTransferencia: los códigos del backend público tienen copy', () => {
  for (const c of ['token_invalido', 'transferencia_bloqueada', 'transferencia_expirada', 'ya_resuelta']) {
    assert.ok(msgErrTransferencia({ error: c }).length > 15, c);
  }
});

// ── Lockout del link público ────────────────────────────────────────────────

test('registrarFallo: bloquea justo en el 5° intento y resetea el contador', () => {
  const previos = MAX_INTENTOS - 2; // 3
  const casi = registrarFallo(previos, NOW);
  assert.equal(casi.intentos_fallidos, MAX_INTENTOS - 1);
  assert.equal(casi.bloqueada_hasta ?? null, null, 'al 4° todavía no bloquea');

  const bloquea = registrarFallo(MAX_INTENTOS - 1, NOW);
  assert.equal(bloquea.intentos_fallidos, 0, 'al bloquear el contador vuelve a cero');
  assert.ok(bloquea.bloqueada_hasta, 'al 5° bloquea');
  assert.ok(new Date(bloquea.bloqueada_hasta) > NOW);
});

test('estaBloqueada / estaVencida comparan contra el ahora inyectado', () => {
  assert.equal(estaBloqueada(new Date(NOW.getTime() + 60000).toISOString(), NOW), true);
  assert.equal(estaBloqueada(new Date(NOW.getTime() - 60000).toISOString(), NOW), false);
  assert.equal(estaBloqueada(null, NOW), false);
  assert.equal(estaVencida(new Date(NOW.getTime() - 1000).toISOString(), NOW), true);
  assert.equal(estaVencida(new Date(NOW.getTime() + 1000).toISOString(), NOW), false);
});

test('diasExpiracion: default 14 y tolerancia a basura de plataforma_config', () => {
  assert.equal(diasExpiracion(undefined), DIAS_EXPIRACION_DEFAULT);
  assert.equal(diasExpiracion(null), DIAS_EXPIRACION_DEFAULT);
  assert.equal(diasExpiracion('no-es-numero'), DIAS_EXPIRACION_DEFAULT);
  assert.equal(diasExpiracion(7), 7);
  const expira = new Date(calcularExpiracion(NOW, 14));
  assert.equal(Math.round((expira.getTime() - NOW.getTime()) / 86400000), 14);
});

// ── Consentimientos ─────────────────────────────────────────────────────────

test('validarConsentimiento y mensajeDeuda: singular/plural sin reproche', () => {
  assert.equal(validarConsentimiento({ adulto_nombre: '', adulto_vinculo: 'madre' }).ok, false);
  assert.equal(validarConsentimiento({ adulto_nombre: 'Ana', adulto_vinculo: 'tio' }).ok, false);
  assert.equal(validarConsentimiento({ adulto_nombre: 'Ana', adulto_vinculo: 'tutor' }).ok, true);

  assert.equal(mensajeDeuda(0), null, 'sin deuda no hay aviso');
  assert.equal(mensajeDeuda(-3), null);
  assert.match(mensajeDeuda(1), /1 familia\./);
  assert.match(mensajeDeuda(4), /4 familias/);
  assert.equal(copyEstadoConsentimiento('pendiente_regularizar').copy, 'A regularizar');
});

// ── ARCO ────────────────────────────────────────────────────────────────────

test('el snapshot anónimo NO lleva nombre ni uuids (test estructural)', () => {
  const snap = armarSnapshotAnonimo({
    fechasSesiones: ['2026-03-02T10:00:00Z', '2026-07-18T09:30:00Z', '2026-05-01T12:00:00Z'],
    respuestas: 512, nodosDominados: 3, grado: 5, provincia: 'Chaco',
  });
  assert.deepEqual(snap.rango_fechas, { desde: '2026-03-02', hasta: '2026-07-18' }, 'fechas recortadas al día');
  assert.equal(snap.sesiones, 3);
  const serial = JSON.stringify(snap);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serial), 'ningún uuid');
  for (const clave of ['nombre', 'alumno', 'email', 'id']) {
    assert.ok(!Object.keys(snap).includes(clave), `no debe haber clave ${clave}`);
  }
});

test('planDeBorrado + resumen: los ítems en cero no ensucian el dry-run', () => {
  const plan = planDeBorrado({ sesiones: 1, respuestas: 0, boletines: 2 });
  const lineas = lineasDelPlan(plan);
  assert.deepEqual(lineas, ['1 sesión de práctica', '2 boletines'], 'singular/plural y sin ceros');
  assert.match(resumenDelPlan(plan), /para siempre/);
  assert.match(resumenDelPlan(planDeBorrado({})), /ya está vacío/);
});

test('diffRectificacion: solo nombre y avatar; lo demás es historia', () => {
  const actual = { nombre: 'Wanda', avatar: 'owl' };
  const ok = diffRectificacion(actual, { nombre: 'Wanda Sol' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.diff, { nombre: { antes: 'Wanda', despues: 'Wanda Sol' } });
  assert.equal(diffRectificacion(actual, { grado: 4 }).ok, false, 'grado no se rectifica');
  assert.equal(diffRectificacion(actual, { nombre: 'Wanda' }).ok, false, 'no-op no es cambio');
  assert.equal(diffRectificacion(actual, {}).ok, false);
});

test('confirmacionValida: freno tipeado tolerante a mayúsculas y espacios', () => {
  assert.equal(confirmacionValida('  wanda  ', 'Wanda'), true);
  assert.equal(confirmacionValida('Wanda  Sol', 'Wanda Sol'), true);
  assert.equal(confirmacionValida('Otra', 'Wanda'), false);
  assert.equal(confirmacionValida('', ''), false, 'sin esperado nunca confirma');
});

test('seccionesDelLegajo: siempre las 5 secciones, marcando las vacías', () => {
  const secciones = seccionesDelLegajo({
    perfil: { id: 'x', nombre: 'Wanda', estado: 'activo', excluido_procesamiento: false },
    matriculas: [{ escuela_nombre: 'El Chañar', fecha_inicio: '2026-03-01', fecha_fin: '2026-06-30', motivo_cierre: 'migracion' }],
    sesiones: [{}, {}], respuestas: [{}], alumno_nodo: [],
    consentimientos: [], boletines: [],
  });
  assert.equal(secciones.length, 5);
  assert.deepEqual(secciones.map((s) => s.titulo), [
    'Identidad', 'Recorrido escolar', 'Consentimientos', 'Actividad de aprendizaje', 'Boletines',
  ]);
  assert.equal(secciones[1].vacio, false);
  assert.equal(secciones[2].vacio, true, 'sin consentimientos → vacía');
  assert.match(secciones[1].filas[0].valor, /El Chañar/);
  assert.equal(secciones[3].filas[0].valor, '2');
  // Con legajo nulo no explota: todas vacías.
  assert.equal(seccionesDelLegajo(null).every((s, i) => (i === 0 ? true : s.vacio)), true);
});

test('nombreArchivoLegajo no filtra el nombre del chico', () => {
  const n = nombreArchivoLegajo('11111111-2222-3333-4444-555555555555', '2026-08-11T10:00:00Z');
  assert.equal(n, 'legajo-11111111-2026-08-11.json');
});

test('msgErrArco traduce los códigos con sufijo variable', () => {
  assert.match(msgErrArco({ error: 'campo_no_rectificable: grado' }), /nombre y el avatar/);
  assert.match(msgErrArco({ error: 'requiere_super' }), /super-admin/);
});

// ── Licencias e instituciones ───────────────────────────────────────────────

test('cuposDe: pool vs licencia directa', () => {
  assert.deepEqual(cuposDe({ cupos: 3, usados: 1 }), {
    esPool: true, cupos: 3, usados: 1, disponibles: 2, porcentaje: 33,
  });
  assert.equal(cuposDe({ cupos: null, usados: 0 }).esPool, false);
  assert.equal(cuposDe({ cupos: 2, usados: 5 }).disponibles, 0, 'nunca negativo');
  assert.match(copyCupos({ cupos: 1, usados: 1 }), /1 de 1 cupo usado · 0 libres/);
  assert.equal(copyCupos({ cupos: null }), 'Licencia de un solo colegio');
});

test('validarFormLicencia: XOR estricto y cupos solo en pools', () => {
  assert.equal(validarFormLicencia({ escuela_id: 'e1' }).ok, true);
  assert.equal(validarFormLicencia({ institucion_id: 'i1', cupos: 5 }).ok, true);
  assert.equal(validarFormLicencia({ escuela_id: 'e1', institucion_id: 'i1' }).ok, false, 'las dos → no');
  assert.equal(validarFormLicencia({}).ok, false, 'ninguna → no');
  assert.equal(validarFormLicencia({ escuela_id: 'e1', cupos: 3 }).ok, false, 'cupos sin institución');
  assert.equal(validarFormLicencia({ institucion_id: 'i1', cupos: 0 }).ok, false);
  assert.equal(validarFormLicencia({ escuela_id: 'e1', plan: 'inventado' }).ok, false);
});

test('vencimiento de licencia: bordes y ventana de aviso de 7 días', () => {
  assert.equal(diasHastaFin('2026-08-06', NOW), 0);
  assert.equal(copyVencimientoLicencia('2026-08-06', NOW), 'Vence hoy');
  assert.equal(copyVencimientoLicencia('2026-08-05', NOW), 'Venció hace 1 día');
  assert.equal(porVencer('2026-08-13', NOW), true, 'faltan 7 → avisa');
  assert.equal(porVencer('2026-08-14', NOW), false, 'faltan 8 → todavía no');
  assert.equal(porVencer(null, NOW), false);
});

test('extenderTreintaDias: suma sobre lo que quedaba, o desde hoy si ya venció', () => {
  // Le quedaban 10 días → 40 desde hoy: renovar temprano no cuesta días.
  assert.equal(extenderTreintaDias('2026-08-16', NOW), '2026-09-15');
  // Vence hoy → 30 días limpios.
  assert.equal(extenderTreintaDias('2026-08-06', NOW), '2026-09-05');
  // Ya vencida hace rato → NO arrastra el pasado, arranca de hoy.
  assert.equal(extenderTreintaDias('2026-06-30', NOW), '2026-09-05');
  // Sin fecha → también desde hoy.
  assert.equal(extenderTreintaDias(null, NOW), '2026-09-05');
});

test('precisionConK: el borde exacto del k-anonimato del panel institucional', () => {
  assert.deepEqual(precisionConK({ aciertos: 8, total: 10, alumnosDistintos: 4 }), {
    precision: null, muestraInsuficiente: true,
  }, '4 alumnos → suprimido');
  assert.deepEqual(precisionConK({ aciertos: 8, total: 10, alumnosDistintos: 5 }), {
    precision: 80, muestraInsuficiente: false,
  }, '5 alumnos → sale');
  assert.deepEqual(precisionConK({ aciertos: 0, total: 0, alumnosDistintos: 9 }), {
    precision: null, muestraInsuficiente: false,
  }, 'sin respuestas no hay precisión, pero la muestra alcanza');
});

test('fechasTrial y password temporal son determinísticos con la entrada dada', () => {
  const { trial_inicio, trial_fin } = fechasTrial(new Date(Date.UTC(2026, 7, 6)));
  assert.equal(trial_inicio, '2026-08-06');
  assert.equal(trial_fin, '2026-09-05', '30 días');
  // azar inyectado → password reproducible (el default usa crypto).
  const pass = generarPasswordTemporal(() => 0);
  assert.match(pass, /^[a-z]+-[a-z]+-[a-z]+-\d{3}$/);
  assert.equal(pass, generarPasswordTemporal(() => 0), 'mismo azar, misma salida');
});
