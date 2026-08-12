-- EDUTIA — Alumno golondrina, Fase 2: derechos ARCO (Ley 25.326).
-- Spec: docs/superpowers/specs/2026-08-10-alumno-golondrina-design.md · ADR-011.
--
-- Acceso (export del legajo), Rectificación (con diff auditado), Cancelación
-- (el ÚNICO borrado físico de todo el sistema, 2 pasos, confirma solo super)
-- y Oposición (exclusión del procesamiento no esencial, ej. observatorio).
-- La mecánica de ejecución vive en la Edge Function admin-arco; acá el esquema.

-- ── 1) Casos ARCO ───────────────────────────────────────────────────────────
-- alumno_id SIN FK a propósito: el caso es el registro legal y tiene que
-- SOBREVIVIR a la cancelación (cuando el perfil ya no existe). `agregado`
-- guarda el snapshot ANÓNIMO pre-borrado ({sesiones, respuestas, nodos_
-- dominados, grado, provincia, rango_fechas}) — sin nombre ni ids.
create table arco_caso (
  id            uuid primary key default gen_random_uuid(),
  alumno_id     uuid not null,
  tipo          text not null check (tipo in ('acceso', 'rectificacion', 'cancelacion', 'oposicion')),
  estado        text not null default 'solicitado'
                check (estado in ('solicitado', 'confirmado', 'ejecutado', 'rechazado')),
  solicitado_por uuid,
  detalle       jsonb,
  agregado      jsonb,
  ejecutado_por uuid,
  ejecutado_at  timestamptz,
  created_at    timestamptz not null default now(),
  check (estado <> 'ejecutado' or ejecutado_at is not null)
);
create index arco_caso_alumno_idx on arco_caso (alumno_id, created_at desc);
create index arco_caso_estado_idx on arco_caso (estado) where estado in ('solicitado', 'confirmado');

alter table arco_caso enable row level security;
-- Sin policies: server-only (admin-arco con service_role; el guard de admin
-- decide quién ve y quién confirma — cancelación solo nivel 'super').

-- ── 2) Oposición: exclusión del procesamiento no esencial ───────────────────
-- El observatorio (y todo agregado no esencial) filtra estas filas ANTES de
-- computar. No toca el servicio esencial (practicar, panel de la docente).
alter table perfil add column excluido_procesamiento boolean not null default false;

-- El guard de 0022 pasa a proteger también esta columna: la fija SOLO el
-- flujo ARCO vía la RPC de abajo (ni la docente, ni self-update, ni un PATCH
-- de service_role suelto).
create or replace function perfil_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('edutia.matricula_sync', true), '') = '1' then
    return new;
  end if;
  if new.docente_id is distinct from old.docente_id
     or new.aula_id is distinct from old.aula_id
     or new.escuela_id is distinct from old.escuela_id
     or new.grado is distinct from old.grado
     or new.estado is distinct from old.estado
     or new.excluido_procesamiento is distinct from old.excluido_procesamiento then
    raise exception 'vinculo_protegido: el vínculo y el estado del alumno se cambian solo vía matrícula';
  end if;
  return new;
end;
$$;

-- Única puerta de escritura de la oposición (la llama admin-arco y audita).
create or replace function arco_set_exclusion(
  p_alumno uuid, p_valor boolean, p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from perfil where id = p_alumno and rol = 'alumno';
  if not found then raise exception 'alumno_inexistente'; end if;
  perform set_config('edutia.matricula_sync', '1', true);
  update perfil set excluido_procesamiento = p_valor where id = p_alumno;
  insert into auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (coalesce(p_actor, '00000000-0000-0000-0000-000000000000'),
          'arco_oposicion', 'perfil', p_alumno,
          jsonb_build_object('excluido_procesamiento', p_valor));
end;
$$;
revoke execute on function arco_set_exclusion(uuid, boolean, uuid) from public, anon, authenticated;
