// Unit — validadores puros de admin-colegios (alta, edición y estados de
// colegios desde el panel admin, WP1). La fuente de verdad de la validación es
// la Edge Function; estos helpers la blindan. Node strippa los tipos del .ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_COLEGIO,
  ESTADOS_COLEGIO,
  FEATURES_DEFAULT,
  TRIAL_DIAS,
  tipoValido,
  estadoValido,
  validarCrear,
  validarEditar,
  armarPatchEditar,
  puedeTransicionar,
  requiereSuper,
  fechasTrial,
  normalizarFiltros,
} from '../../supabase/functions/admin-colegios/validar.ts';

test('tipoValido: solo rural/unidocente/plurigrado', () => {
  assert.deepEqual(TIPOS_COLEGIO, ['rural', 'unidocente', 'plurigrado']);
  for (const t of TIPOS_COLEGIO) assert.equal(tipoValido(t), true);
  assert.equal(tipoValido('urbano'), false);
  assert.equal(tipoValido(''), false);
  assert.equal(tipoValido(undefined), false);
  assert.equal(tipoValido(3), false);
});

test('estadoValido: solo trial/activo/suspendido/archivado', () => {
  assert.deepEqual(ESTADOS_COLEGIO, ['trial', 'activo', 'suspendido', 'archivado']);
  for (const e of ESTADOS_COLEGIO) assert.equal(estadoValido(e), true);
  assert.equal(estadoValido('borrado'), false);
  assert.equal(estadoValido(null), false);
});

test('validarCrear: nombre vacío y tipo inválido rebotan con código snake', () => {
  assert.deepEqual(validarCrear({ nombre: '', tipo: 'rural' }), { ok: false, error: 'nombre_vacio' });
  assert.deepEqual(validarCrear({ nombre: '   ', tipo: 'rural' }), { ok: false, error: 'nombre_vacio' });
  assert.deepEqual(validarCrear({ tipo: 'rural' }), { ok: false, error: 'nombre_vacio' });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'urbano' }), { ok: false, error: 'tipo_invalido' });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12' }), { ok: false, error: 'tipo_invalido' });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'rural', zona: 42 }), { ok: false, error: 'zona_invalida' });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'plurigrado', zona: 'Traslasierra' }), { ok: true });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'unidocente', zona: null }), { ok: true });
});

test('validarEditar: parcial — solo valida lo que vino; patch vacío es legal', () => {
  assert.deepEqual(validarEditar({}), { ok: true });
  assert.deepEqual(validarEditar({ nombre: 'Nuevo nombre' }), { ok: true });
  assert.deepEqual(validarEditar({ nombre: '  ' }), { ok: false, error: 'nombre_vacio' });
  assert.deepEqual(validarEditar({ tipo: 'plurigrado' }), { ok: true });
  assert.deepEqual(validarEditar({ tipo: 'lo-que-sea' }), { ok: false, error: 'tipo_invalido' });
  assert.deepEqual(validarEditar({ zona: null }), { ok: true });
  assert.deepEqual(validarEditar({ zona: { x: 1 } }), { ok: false, error: 'zona_invalida' });
});

test('armarPatchEditar: trimea, zona vacía → null, ignora lo que no vino', () => {
  assert.deepEqual(armarPatchEditar({}), {});
  assert.deepEqual(armarPatchEditar({ nombre: '  Esc. 5  ' }), { nombre: 'Esc. 5' });
  assert.deepEqual(armarPatchEditar({ zona: '  ' }), { zona: null });
  assert.deepEqual(armarPatchEditar({ zona: null }), { zona: null });
  assert.deepEqual(
    armarPatchEditar({ nombre: 'Esc. 5', zona: ' Cuesta Blanca ', tipo: 'rural' }),
    { nombre: 'Esc. 5', zona: 'Cuesta Blanca', tipo: 'rural' },
  );
});

test('provincia: opcional en crear/editar, exacta contra la lista espejada', () => {
  // Crear: válida, ausente y null son legales; fuera de lista rebota.
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'rural', provincia: 'Neuquén' }), { ok: true });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'rural' }), { ok: true });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'rural', provincia: null }), { ok: true });
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'rural', provincia: 'Marte' }), { ok: false, error: 'provincia_invalida' });
  // Editar: mismas reglas, parcial.
  assert.deepEqual(validarEditar({ provincia: 'Neuquén' }), { ok: true });
  assert.deepEqual(validarEditar({}), { ok: true });
  assert.deepEqual(validarEditar({ provincia: null }), { ok: true });
  assert.deepEqual(validarEditar({ provincia: 'Marte' }), { ok: false, error: 'provincia_invalida' });
  assert.deepEqual(validarEditar({ provincia: 42 }), { ok: false, error: 'provincia_invalida' });
});

test('armarPatchEditar: la provincia entra al patch y el null explícito la limpia', () => {
  assert.deepEqual(armarPatchEditar({ provincia: 'Neuquén' }), { provincia: 'Neuquén' });
  assert.deepEqual(armarPatchEditar({ provincia: null }), { provincia: null });
  assert.deepEqual(armarPatchEditar({}), {});
  assert.deepEqual(
    armarPatchEditar({ nombre: 'Esc. 5', provincia: 'Chubut' }),
    { nombre: 'Esc. 5', provincia: 'Chubut' },
  );
});

test('identidad oficial: el CUE viaja por crear y por editar, siempre opcional', () => {
  // Un colegio sin CUE sigue siendo legal: la identidad se carga cuando la
  // escuela la dicta (migración 0033).
  assert.deepEqual(validarCrear({ nombre: 'Esc. 12', tipo: 'rural' }), { ok: true });
  assert.deepEqual(
    validarCrear({ nombre: 'Esc. 12', tipo: 'rural', cue: '74-01234-00', cue_anexo: '00' }),
    { ok: true },
  );
  assert.deepEqual(
    validarCrear({ nombre: 'Esc. 12', tipo: 'rural', cue: '1234' }),
    { ok: false, error: 'cue_invalido' },
  );
  assert.deepEqual(validarEditar({ cue: '740123400' }), { ok: true });
  assert.deepEqual(validarEditar({ matricula_declarada: 0 }), { ok: false, error: 'matricula_invalida' });
  assert.deepEqual(validarEditar({ departamento: 'Confluencia' }), { ok: true });
});

test('armarPatchEditar: la identidad oficial entra normalizada al mismo patch', () => {
  assert.deepEqual(
    armarPatchEditar({ nombre: 'Esc. 5', cue: '74-01234-00', matricula_declarada: '48' }),
    { nombre: 'Esc. 5', cue: '740123400', matricula_declarada: 48 },
  );
  assert.deepEqual(armarPatchEditar({ localidad: '  Aluminé  ' }), { localidad: 'Aluminé' });
  // Limpiar el CUE se lleva el anexo: sin CUE, un anexo es basura.
  assert.deepEqual(armarPatchEditar({ cue: null }), { cue: null, cue_anexo: null });
});

test('puedeTransicionar: matriz de estados', () => {
  // Válidas.
  assert.equal(puedeTransicionar('trial', 'activo'), true);
  assert.equal(puedeTransicionar('trial', 'suspendido'), true);
  assert.equal(puedeTransicionar('trial', 'archivado'), true);
  assert.equal(puedeTransicionar('activo', 'suspendido'), true);
  assert.equal(puedeTransicionar('activo', 'archivado'), true);
  assert.equal(puedeTransicionar('suspendido', 'activo'), true);
  assert.equal(puedeTransicionar('suspendido', 'archivado'), true);
  assert.equal(puedeTransicionar('archivado', 'activo'), true); // restaurar
  // Inválidas: mismo estado, "volver a prueba", salir de archivado a otro lado.
  for (const e of ESTADOS_COLEGIO) assert.equal(puedeTransicionar(e, e), false, `${e} → ${e}`);
  assert.equal(puedeTransicionar('activo', 'trial'), false);
  assert.equal(puedeTransicionar('suspendido', 'trial'), false);
  assert.equal(puedeTransicionar('archivado', 'trial'), false);
  assert.equal(puedeTransicionar('archivado', 'suspendido'), false);
  // Basura.
  assert.equal(puedeTransicionar('trial', 'borrado'), false);
  assert.equal(puedeTransicionar(undefined, 'activo'), false);
});

test('requiereSuper: solo archivar', () => {
  assert.equal(requiereSuper('archivado'), true);
  assert.equal(requiereSuper('suspendido'), false);
  assert.equal(requiereSuper('activo'), false);
  assert.equal(requiereSuper('trial'), false);
});

test('fechasTrial: hoy en UTC + 30 días, con cruce de mes y de año', () => {
  assert.equal(TRIAL_DIAS, 30);
  assert.deepEqual(fechasTrial(new Date('2026-08-06T12:00:00Z')), {
    trial_inicio: '2026-08-06',
    trial_fin: '2026-09-05',
  });
  // Cruce de año.
  assert.deepEqual(fechasTrial(new Date('2026-12-15T23:59:00Z')), {
    trial_inicio: '2026-12-15',
    trial_fin: '2027-01-14',
  });
  // La fecha es la UTC, no la local: 23:59Z sigue siendo ese día en UTC.
  assert.equal(fechasTrial(new Date('2026-02-01T00:00:00Z')).trial_fin, '2026-03-03');
});

test('FEATURES_DEFAULT: copia literal de features_default() (0018, plan docente)', () => {
  assert.deepEqual(FEATURES_DEFAULT, {
    sol: true,
    luna: { activa: true, alertas: true, boletines: true, chat: true },
    terra: false,
  });
});

test('normalizarFiltros: ignora lo inválido y sanea la búsqueda para ilike', () => {
  assert.deepEqual(normalizarFiltros(), {});
  assert.deepEqual(normalizarFiltros(null), {});
  assert.deepEqual(normalizarFiltros({}), {});
  assert.deepEqual(normalizarFiltros({ estado: 'trial', tipo: 'rural', busqueda: ' Aromos ' }), {
    estado: 'trial', tipo: 'rural', busqueda: 'Aromos',
  });
  // Estado/tipo inválidos se ignoran (no rompen el listado).
  assert.deepEqual(normalizarFiltros({ estado: 'borrado', tipo: 'urbano' }), {});
  // Comodines y caracteres que rompen la query de PostgREST salen.
  assert.deepEqual(normalizarFiltros({ busqueda: '%los_aromos%' }), { busqueda: 'los aromos' });
  assert.deepEqual(normalizarFiltros({ busqueda: 'a,b(c)' }), { busqueda: 'a b c' });
  assert.deepEqual(normalizarFiltros({ busqueda: '%%__' }), {});
});
