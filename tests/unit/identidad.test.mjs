// Unit — identidad oficial del establecimiento (migración 0033): el CUE (Clave
// Única de Establecimiento), su anexo y la matrícula declarada. La lista de
// reglas vive en TRES lugares — el check de la migración y los dos módulos
// espejo (Deno y web) — y no pueden divergir jamás (patrón provincias.ts).
// Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANEXO_SEDE, CUE_LARGO, MATRICULA_MAX, MATRICULA_ANIO_MAX, MATRICULA_ANIO_MIN,
  armarPatchIdentidad, claveEstablecimiento, copyCue, esAnexoValido, esCueValido,
  esMatriculaAnioValida, esMatriculaValida, normalizarCue, validarIdentidad,
} from '../../supabase/functions/_shared/identidad.ts';
import { esCueValido as esCueValidoWeb, copyCue as copyCueWeb } from '../../web/lib/admin/identidad.ts';

const sql = readFileSync(new URL('../../supabase/migrations/0033_identidad_oficial.sql', import.meta.url), 'utf8');

test('los dos módulos espejo son BYTE-idénticos', () => {
  const deno = readFileSync(new URL('../../supabase/functions/_shared/identidad.ts', import.meta.url), 'utf8');
  const web = readFileSync(new URL('../../web/lib/admin/identidad.ts', import.meta.url), 'utf8');
  assert.equal(deno, web, 'los espejos divergieron: copiá uno sobre el otro');
  assert.equal(esCueValidoWeb('740123400'), true, 'el espejo web valida igual');
});

test('el CUE son 9 dígitos exactos: ni 8 ni 10, ni letras', () => {
  assert.equal(CUE_LARGO, 9);
  assert.equal(esCueValido('740123400'), true);
  assert.equal(esCueValido('74012340'), false, '8 dígitos no es un CUE');
  assert.equal(esCueValido('7401234000'), false, '10 dígitos tampoco');
  assert.equal(esCueValido('74012340A'), false, 'letras nunca');
  assert.equal(esCueValido(''), false);
  assert.equal(esCueValido(740123400), false, 'número no: el CUE puede empezar con 0');
  assert.equal(esCueValido(null), false);
});

test('normalizarCue acepta lo que la escuela dicta con guiones y espacios', () => {
  // El CUE llega de un papel del ministerio: "74-01234-00", "740 123 400".
  assert.equal(normalizarCue('74-01234-00'), '740123400');
  assert.equal(normalizarCue(' 740 123 400 '), '740123400');
  assert.equal(normalizarCue('740123400'), '740123400');
  assert.equal(normalizarCue(''), null, 'vacío = sin CUE, no error');
  assert.equal(normalizarCue('   '), null);
  assert.equal(normalizarCue(null), null);
  assert.equal(normalizarCue(undefined), null);
  // Normalizar NO valida: sacar la basura y validar son dos pasos.
  assert.equal(normalizarCue('abc'), '');
});

test('el anexo son 2 dígitos y "00" es la sede', () => {
  assert.equal(ANEXO_SEDE, '00');
  assert.equal(esAnexoValido('00'), true);
  assert.equal(esAnexoValido('07'), true);
  assert.equal(esAnexoValido('0'), false, 'un dígito solo no es un anexo');
  assert.equal(esAnexoValido('123'), false);
  assert.equal(esAnexoValido('AB'), false);
});

test('la matrícula declarada es un entero de 1 a 10000, con su año', () => {
  assert.equal(MATRICULA_MAX, 10000);
  assert.equal(esMatriculaValida(12), true);
  assert.equal(esMatriculaValida('12'), true, 'el input del front manda texto');
  assert.equal(esMatriculaValida(MATRICULA_MAX), true);
  assert.equal(esMatriculaValida(0), false, 'una escuela sin chicos no se declara: se archiva');
  assert.equal(esMatriculaValida(-3), false);
  assert.equal(esMatriculaValida(10001), false);
  assert.equal(esMatriculaValida(12.5), false, 'medio chico no existe');
  assert.equal(esMatriculaValida('doce'), false);

  assert.equal(esMatriculaAnioValida(2026), true);
  assert.equal(esMatriculaAnioValida(MATRICULA_ANIO_MIN), true);
  assert.equal(esMatriculaAnioValida(MATRICULA_ANIO_MAX), true);
  assert.equal(esMatriculaAnioValida(MATRICULA_ANIO_MIN - 1), false);
  assert.equal(esMatriculaAnioValida(MATRICULA_ANIO_MAX + 1), false);
});

test('validarIdentidad: todo es OPCIONAL — un colegio sin CUE sigue siendo legal', () => {
  assert.deepEqual(validarIdentidad({}), { ok: true });
  assert.deepEqual(validarIdentidad({ cue: null, cue_anexo: null }), { ok: true });
  assert.deepEqual(validarIdentidad({ cue: '', matricula_declarada: '' }), { ok: true },
    'vacío del input = limpiar, no error');
  assert.deepEqual(validarIdentidad({ cue: '74-01234-00', cue_anexo: '00' }), { ok: true });
});

test('validarIdentidad: cada campo malo tiene su código de error', () => {
  assert.deepEqual(validarIdentidad({ cue: '1234' }), { ok: false, error: 'cue_invalido' });
  assert.deepEqual(validarIdentidad({ cue_anexo: '5' }), { ok: false, error: 'cue_anexo_invalido' });
  assert.deepEqual(validarIdentidad({ matricula_declarada: 0 }), { ok: false, error: 'matricula_invalida' });
  assert.deepEqual(validarIdentidad({ matricula_anio: 1990 }), { ok: false, error: 'matricula_anio_invalido' });
  assert.deepEqual(validarIdentidad({ departamento: 123 }), { ok: false, error: 'departamento_invalido' });
  assert.deepEqual(validarIdentidad({ localidad: {} }), { ok: false, error: 'localidad_invalida' });
});

test('validarIdentidad: un anexo sin CUE no significa nada', () => {
  assert.deepEqual(validarIdentidad({ cue_anexo: '02' }), { ok: false, error: 'anexo_sin_cue' });
  assert.deepEqual(validarIdentidad({ cue: '740123400', cue_anexo: '02' }), { ok: true });
});

test('armarPatchIdentidad: solo lo que vino, normalizado, y null limpia', () => {
  assert.deepEqual(armarPatchIdentidad({}), {}, 'patch vacío = no-op');
  assert.deepEqual(
    armarPatchIdentidad({ cue: '74-01234-00', cue_anexo: '00', matricula_declarada: '48', matricula_anio: '2026' }),
    { cue: '740123400', cue_anexo: '00', matricula_declarada: 48, matricula_anio: 2026 },
    'el CUE se guarda normalizado y la matrícula como número',
  );
  assert.deepEqual(armarPatchIdentidad({ departamento: null }), { departamento: null },
    'null explícito limpia la columna');
  assert.deepEqual(armarPatchIdentidad({ departamento: '  Confluencia  ' }), { departamento: 'Confluencia' });
  assert.deepEqual(armarPatchIdentidad({ localidad: '' }), { localidad: null });
});

test('armarPatchIdentidad: limpiar el CUE se lleva el anexo puesto', () => {
  // Sin esto quedaría un anexo huérfano en la base — justo lo que
  // valida `anexo_sin_cue` en la entrada.
  assert.deepEqual(armarPatchIdentidad({ cue: null }), { cue: null, cue_anexo: null });
  assert.deepEqual(armarPatchIdentidad({ cue: '   ' }), { cue: null, cue_anexo: null }, 'vacío también limpia');
  assert.deepEqual(armarPatchIdentidad({ cue: '', cue_anexo: '03' }), { cue: null, cue_anexo: null });
});

test('claveEstablecimiento: anexo ausente y "00" son el MISMO asiento (la sede)', () => {
  assert.equal(claveEstablecimiento('740123400', null), '740123400-00');
  assert.equal(claveEstablecimiento('740123400', '00'), '740123400-00');
  assert.equal(claveEstablecimiento('740123400', '02'), '740123400-02');
  assert.equal(claveEstablecimiento(null, '02'), null, 'sin CUE no hay clave');
});

test('copyCue: dice en castellano cuándo falta, sin sonar a error', () => {
  assert.equal(copyCue('740123400', '00'), 'CUE 740123400-00');
  assert.equal(copyCue('740123400', null), 'CUE 740123400-00');
  assert.equal(copyCue(null, null), 'Sin CUE cargado');
  assert.equal(copyCueWeb(null, null), 'Sin CUE cargado', 'el espejo web dice lo mismo');
});

// ── Paridad con el DDL (patrón valor-ddl.test.mjs) ──────────────────────────

test('0033: las columnas nacen NULLABLE — ningún colegio existente se rompe', () => {
  for (const col of ['cue', 'cue_anexo', 'departamento', 'localidad', 'matricula_declarada', 'matricula_anio']) {
    assert.ok(new RegExp(`add column ${col}\\b`).test(sql), `0033 agrega ${col}`);
  }
  // `where cue is not null` del índice parcial no cuenta: se mira columna por columna.
  assert.ok(
    !/add column [a-z_]+ [a-z]+\s+not null/.test(sql),
    'ninguna columna nueva es NOT NULL: la identidad se carga cuando se sabe',
  );
});

test('0033: los checks del SQL dicen lo mismo que los validadores', () => {
  assert.ok(sql.includes("cue ~ '^[0-9]{9}$'"), 'el check del CUE son 9 dígitos, igual que CUE_RE');
  assert.ok(sql.includes("cue_anexo ~ '^[0-9]{2}$'"), 'el check del anexo son 2 dígitos');
  assert.ok(
    new RegExp(`matricula_declarada between 1 and ${MATRICULA_MAX}`).test(sql),
    'el rango de la matrícula del SQL es el de MATRICULA_MAX',
  );
  assert.ok(
    new RegExp(`matricula_anio between ${MATRICULA_ANIO_MIN} and ${MATRICULA_ANIO_MAX}`).test(sql),
    'el rango del año del SQL es el de los módulos espejo',
  );
});

test('0033: dos colegios no pueden reclamar el MISMO establecimiento oficial', () => {
  assert.ok(/create unique index/.test(sql), 'hay un índice único');
  assert.ok(
    /coalesce\(cue_anexo, *'00'\)/.test(sql),
    'la clave única trata el anexo ausente como la sede "00" — igual que claveEstablecimiento',
  );
  assert.ok(/where cue is not null/.test(sql), 'parcial: los colegios sin CUE no compiten entre sí');
});
