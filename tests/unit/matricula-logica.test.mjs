// Tests de la máquina de estados del alumno golondrina (ADR-011, Fase 1).
// La lógica TS (_shared/matricula-logica.ts) es espejo de la SQL
// (alumno_transicion_valida, migración 0022): el test de paridad congela la
// tabla de verdad contra el texto del SQL. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESTADOS_ALUMNO, MOTIVOS_CIERRE, ERRS_MATRICULA,
  esMotivoValido, estadoTrasCierre, requiereConsentimiento, transicionValida,
} from '../../supabase/functions/_shared/matricula-logica.ts';

test('matriz de transiciones completa (la tabla de verdad del feature)', () => {
  const esperado = {
    // de → { a: válida }
    activo: { activo: true, en_transito: true, egresado: true, baja: true },
    en_transito: { activo: true, en_transito: true, egresado: false, baja: true },
    egresado: { activo: true, en_transito: false, egresado: true, baja: true },
    baja: { activo: false, en_transito: false, egresado: false, baja: true },
  };
  for (const de of ESTADOS_ALUMNO) {
    for (const a of ESTADOS_ALUMNO) {
      assert.equal(transicionValida(de, a), esperado[de][a], `${de} → ${a}`);
    }
  }
});

test('baja es terminal: NO se vuelve de una baja ARCO', () => {
  assert.equal(transicionValida('baja', 'activo'), false);
  assert.equal(transicionValida('baja', 'en_transito'), false);
  assert.equal(transicionValida('baja', 'egresado'), false);
});

test('estadoTrasCierre: el motivo del cierre decide el destino', () => {
  assert.equal(estadoTrasCierre('migracion'), 'en_transito', 'migrar no borra nada: espera');
  assert.equal(estadoTrasCierre('error_carga'), 'en_transito');
  assert.equal(estadoTrasCierre('egreso'), 'egresado');
  assert.equal(estadoTrasCierre('arco_baja'), 'baja');
});

test('esMotivoValido acepta solo los cuatro motivos', () => {
  for (const m of MOTIVOS_CIERRE) assert.equal(esMotivoValido(m), true, m);
  assert.equal(esMotivoValido('borrado'), false);
  assert.equal(esMotivoValido(''), false);
  assert.equal(esMotivoValido(null), false);
});

test('requiereConsentimiento: solo el alta inicial va sin consentimiento', () => {
  assert.equal(requiereConsentimiento(0), false, 'primera matrícula de la vida');
  assert.equal(requiereConsentimiento(1), true, 'toda reapertura es un evento de consentimiento');
  assert.equal(requiereConsentimiento(5), true);
});

test('paridad con el SQL de 0022: mismos estados, motivos y reglas clave', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0022_matricula_estado_alumno.sql', import.meta.url), 'utf8');
  for (const e of ESTADOS_ALUMNO) assert.ok(sql.includes(`'${e}'`), `estado ${e} ausente en 0022`);
  for (const m of MOTIVOS_CIERRE) assert.ok(sql.includes(`'${m}'`), `motivo ${m} ausente en 0022`);
  // Las tres reglas estructurales de la máquina, tal como están en el SQL:
  assert.ok(sql.includes(`when p_de = 'baja' then false`), 'baja terminal en SQL');
  assert.ok(sql.includes(`when p_a = 'baja' then true`), 'a baja solo vía ARCO en SQL');
  assert.ok(sql.includes('matricula_una_activa'), 'constraint de matrícula única activa');
  // El cierre revoca el login (sin esto el chico entraría por el aula vieja).
  assert.ok(sql.includes('delete from alumno_cred'), 'el cierre debe revocar la credencial');
});

test('hay copy en español para cada código de error de las RPCs', () => {
  for (const codigo of ['alumno_dado_de_baja', 'falta_consentimiento', 'sin_matricula_activa'.replace('sin_matricula_activa', 'matricula_inexistente_o_cerrada'), 'motivo_invalido', 'transicion_invalida']) {
    assert.ok(ERRS_MATRICULA[codigo]?.length > 10, `falta copy para ${codigo}`);
  }
  assert.ok(ERRS_MATRICULA.matricula_activa_existente?.length > 10);
});
