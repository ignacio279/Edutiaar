// Unit — migración 0032 (métricas de valor): congela las reglas ESTRUCTURALES
// del DDL contra su texto, patrón de golondrina-ddl.test.mjs. No reemplaza a
// los tests de integración (que corren contra la base real): sirve para que un
// cambio descuidado del archivo ponga rojo el commit, no el deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/0032_metricas_de_valor.sql', import.meta.url), 'utf8');

test('0032: el log de hitos lo escribe el TRIGGER, no el cliente', () => {
  assert.ok(sql.includes('create trigger hito_registrar_trg'), 'el trigger existe');
  assert.ok(/after insert or update on alumno_nodo/.test(sql),
    'AFTER insert or update: los dos caminos de escritura (chico practicando y seño con override)');
  assert.ok(/security definer/.test(sql),
    'SECURITY DEFINER: el trigger inserta y cuenta saltando la RLS del cliente');
  assert.ok(/set search_path = public/.test(sql),
    'search_path fijo: un SECURITY DEFINER sin esto es secuestrable');
});

test('0032: hito_aprendizaje es server-only (RLS activa y SIN policies)', () => {
  assert.ok(sql.includes('alter table hito_aprendizaje enable row level security'), 'RLS activa');
  assert.ok(!/create policy \w+ on hito_aprendizaje/.test(sql),
    'sin policies: como uso_api, lo lee solo service_role');
});

test('0032: los cuatro hitos que importan quedan registrados', () => {
  assert.ok(sql.includes("create type hito_tipo as enum ('dominado', 'destrabado', 'trabado', 'override')"),
    'el enum congela los tipos');
  for (const t of ['dominado', 'destrabado', 'trabado', 'override']) {
    assert.ok(sql.includes(`'${t}', v_ejercicios, new.puntaje`), `el trigger inserta el hito ${t}`);
  }
});

test('0032: el esfuerzo para dominar se cuenta EN el momento del hito', () => {
  assert.ok(/select count\(\*\) into v_ejercicios/.test(sql), 'cuenta ejercicios dentro del trigger');
  assert.ok(/from respuesta r\s*\n\s*join sesion s on s\.id = r\.sesion_id/.test(sql),
    'cuenta respuestas reales del (alumno, nodo), no sesiones');
  assert.ok(sql.includes('create index if not exists sesion_alumno_nodo_idx on sesion (alumno_id, nodo_id)'),
    'índice compuesto: 0001 solo tiene las columnas sueltas');
});

test('0032: el backfill queda MARCADO y no se puede confundir con dato vivo', () => {
  assert.ok(sql.includes("check (origen in ('vivo', 'backfill'))"), 'el CHECK congela los dos orígenes');
  assert.ok(sql.includes("'backfill', an.actualizado_at"),
    'el backfill usa actualizado_at: fecha APROXIMADA, por eso va marcada');
});

test('0032: luna_alerta no deja mover primera_vez_at (sin policy de UPDATE)', () => {
  assert.ok(sql.includes('create policy luna_alerta_insert on luna_alerta for insert'), 'la docente inserta lo suyo');
  assert.ok(sql.includes('create policy luna_alerta_select on luna_alerta for select'), 'y lee lo suyo');
  assert.ok(!/create policy \w+ on luna_alerta for update/.test(sql),
    'SIN update: el "tiempo hasta atender" no se puede falsear hacia adelante');
  assert.ok(sql.includes('primary key (docente_id, clave)'),
    'PK natural: el upsert idempotente conserva la primera emisión');
});

test('0032: el snapshot es idempotente por día', () => {
  assert.ok(sql.includes('primary key (fecha, escuela_id, bucket)'), 'PK compuesta → upsert sin duplicar');
  assert.ok(sql.includes('check (bucket between 0 and 9)'), 'deciles acotados');
  assert.ok(sql.includes('alter table snapshot_aprendizaje enable row level security'), 'server-only');
});
