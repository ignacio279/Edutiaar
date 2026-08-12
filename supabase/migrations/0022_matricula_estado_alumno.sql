-- EDUTIA — Alumno golondrina, Fase 1: la matrícula como fuente de verdad del
-- vínculo alumno ↔ colegio, y el estado propio del alumno.
-- Spec: docs/superpowers/specs/2026-08-10-alumno-golondrina-design.md · ADR-011.
--
-- Principio rector: EDUTIA custodia los datos del chico en nombre de su familia.
-- El legajo (alumno_nodo/sesion/respuesta, keyed por alumno_id) pertenece al
-- alumno y viaja con él; la matrícula es solo el vínculo con un colegio.
--
-- DISEÑO: matricula = fuente de verdad; perfil.docente_id/aula_id/escuela_id/
-- grado quedan como CACHÉ DESNORMALIZADO de la matrícula activa, mantenido por
-- trigger. Así las policies existentes (es_mi_alumno, mi_escuela, boletin,
-- luna…) y los ~40 archivos que las leen siguen andando sin tocarse, y cerrar
-- una matrícula corta el scoping del colegio AL INSTANTE en todas las
-- superficies. Triple candado contra divergencia: (1) toda escritura pasa por
-- las RPCs matricula_abrir/matricula_cerrar (tabla sin policies de escritura),
-- (2) el trigger de sync es el único escritor del caché y se marca con un GUC,
-- (3) perfil_guard rechaza cualquier otro escritor de esas columnas — de paso
-- tapa el self-update de perfil por PostgREST que existía desde 0002.

-- ── 1) Estado propio del alumno ─────────────────────────────────────────────
-- activo = matrícula vigente · en_transito = migró, el legajo espera intacto
-- (el corazón del feature) · egresado = terminó el ciclo · baja = SOLO vía
-- ARCO (único camino a borrado real, migración 0024).
alter table perfil add column estado text not null default 'activo'
  check (estado in ('activo', 'en_transito', 'egresado', 'baja'));

-- ── 2) Matrícula ────────────────────────────────────────────────────────────
create table matricula (
  id            uuid primary key default gen_random_uuid(),
  alumno_id     uuid not null references perfil(id) on delete cascade,
  escuela_id    uuid not null references escuela(id),
  aula_id       uuid references aula(id) on delete set null,
  docente_id    uuid references perfil(id) on delete set null,
  grado         int,
  fecha_inicio  date not null default current_date,
  fecha_fin     date,
  estado        text not null default 'activa' check (estado in ('activa', 'cerrada')),
  motivo_cierre text check (motivo_cierre in ('migracion', 'egreso', 'arco_baja', 'error_carga')),
  -- Sin FK (patrón auditoria): el registro sobrevive al borrado del actor.
  abierta_por   uuid,
  cerrada_por   uuid,
  -- FK diferida a 0023 (la tabla consentimiento no existe todavía).
  consentimiento_id uuid,
  created_at    timestamptz not null default now(),
  check ((estado = 'activa') = (fecha_fin is null)),
  check (estado = 'activa' or motivo_cierre is not null)
);

-- LA constraint del feature, a nivel base: como máximo UNA matrícula activa.
create unique index matricula_una_activa on matricula (alumno_id) where fecha_fin is null;
create index matricula_alumno_idx on matricula (alumno_id, fecha_inicio desc);
create index matricula_escuela_idx on matricula (escuela_id) where fecha_fin is null;

alter table matricula enable row level security;
-- Lectura: el alumno lo suyo; la docente SOLO mientras lo tiene (es_mi_alumno
-- lee el caché → al cerrarse la matrícula pierde también el historial: regla
-- de visibilidad del legajo vivo). El admin va por service_role.
create policy matricula_select on matricula for select to authenticated
  using (alumno_id = auth.uid() or es_mi_alumno(alumno_id));
-- Sin policies de escritura → solo service_role vía las RPCs.

-- ── 3) Máquina de estados (única fuente de transiciones válidas) ────────────
-- activo → en_transito (cierre por migración) · activo → egresado (cierre por
-- egreso) · en_transito|egresado → activo (matrícula nueva: transferencia o
-- reingreso) · cualquiera → baja SOLO por arco_baja · baja es TERMINAL.
create or replace function alumno_transicion_valida(p_de text, p_a text)
returns boolean language sql immutable as $$
  select case
    when p_de = p_a then true                       -- no-op siempre legal
    when p_de = 'baja' then false                   -- terminal: baja→activo prohibido
    when p_a = 'baja' then true                     -- solo la invoca el flujo ARCO
    when p_de = 'activo' and p_a in ('en_transito', 'egresado') then true
    when p_de in ('en_transito', 'egresado') and p_a = 'activo' then true
    else false
  end;
$$;
revoke execute on function alumno_transicion_valida(text, text) from public, anon;

-- Transición interna: valida contra la máquina, escribe el caché de estado y
-- audita. SIEMPRE con el GUC seteado (la llama solo este archivo).
create or replace function alumno_transicionar(
  p_alumno uuid, p_a text, p_actor uuid, p_detalle jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_de text;
begin
  select estado into v_de from perfil where id = p_alumno and rol = 'alumno';
  if v_de is null then raise exception 'alumno_inexistente'; end if;
  if not alumno_transicion_valida(v_de, p_a) then
    raise exception 'transicion_invalida: % → %', v_de, p_a;
  end if;
  if v_de = p_a then return; end if;
  perform set_config('edutia.matricula_sync', '1', true);
  update perfil set estado = p_a where id = p_alumno;
  insert into auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (coalesce(p_actor, '00000000-0000-0000-0000-000000000000'),
          'alumno_transicion', 'perfil', p_alumno,
          jsonb_build_object('de', v_de, 'a', p_a) || p_detalle);
end;
$$;
revoke execute on function alumno_transicionar(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ── 4) Sincronización del caché (único escritor de las columnas de vínculo) ─
create or replace function matricula_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('edutia.matricula_sync', '1', true);
  if new.fecha_fin is null then
    update perfil set docente_id = new.docente_id, aula_id = new.aula_id,
                      escuela_id = new.escuela_id, grado = new.grado
    where id = new.alumno_id;
  elsif tg_op = 'UPDATE' and old.fecha_fin is null then
    -- Se cerró: el colegio pierde el legajo vivo al instante.
    update perfil set docente_id = null, aula_id = null, escuela_id = null
    where id = new.alumno_id;
  end if;
  return new;
end;
$$;
create trigger matricula_sync_trg
  after insert or update on matricula
  for each row execute function matricula_sync();

-- Guard: NADIE más escribe el vínculo ni el estado (tapa también el
-- self-update de perfil vía PostgREST — perfil_update era using id=auth.uid()).
-- nombre/avatar quedan libres (los edita la gestión diaria y la propia UI).
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
     or new.estado is distinct from old.estado then
    raise exception 'vinculo_protegido: el vínculo y el estado del alumno se cambian solo vía matrícula';
  end if;
  return new;
end;
$$;
create trigger perfil_guard_trg
  before update on perfil
  for each row execute function perfil_guard();

-- ── 5) RPCs de matrícula (la ÚNICA puerta de escritura) ─────────────────────

-- Abrir: alta inicial (sin consentimiento de transferencia) o reingreso/
-- transferencia (exige consentimiento vigente con alcance 'transferencia' —
-- la regla dura de P2 vive ACÁ, no en la UI). La validación del contenido del
-- consentimiento se completa en 0023 cuando la tabla exista.
create or replace function matricula_abrir(
  p_alumno uuid, p_escuela uuid, p_aula uuid, p_docente uuid, p_grado int,
  p_actor uuid, p_consentimiento uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
  v_previas int;
  v_id uuid;
begin
  select estado into v_estado from perfil where id = p_alumno and rol = 'alumno';
  if v_estado is null then raise exception 'alumno_inexistente'; end if;
  if v_estado = 'baja' then raise exception 'alumno_dado_de_baja'; end if;

  select count(*) into v_previas from matricula where alumno_id = p_alumno;
  if v_previas > 0 and p_consentimiento is null then
    raise exception 'falta_consentimiento: reabrir matrícula exige consentimiento de transferencia';
  end if;

  insert into matricula (alumno_id, escuela_id, aula_id, docente_id, grado,
                         abierta_por, consentimiento_id)
  values (p_alumno, p_escuela, p_aula, p_docente, p_grado, p_actor, p_consentimiento)
  returning id into v_id;  -- el índice parcial rechaza una segunda activa

  perform alumno_transicionar(p_alumno, 'activo', p_actor,
    jsonb_build_object('matricula_id', v_id, 'escuela_id', p_escuela));
  insert into auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (coalesce(p_actor, '00000000-0000-0000-0000-000000000000'),
          'matricula_abierta', 'matricula', v_id,
          jsonb_build_object('alumno_id', p_alumno, 'escuela_id', p_escuela,
                             'consentimiento_id', p_consentimiento));
  return v_id;
end;
$$;
revoke execute on function matricula_abrir(uuid, uuid, uuid, uuid, int, uuid, uuid) from public, anon, authenticated;

-- Cerrar: fija fecha_fin y motivo, transiciona el estado según el motivo, y
-- REVOCA el login del chico (sin esto seguiría entrando por el código del
-- aula vieja: alumno_cred/intento_login son server-only de 0003).
create or replace function matricula_cerrar(
  p_matricula uuid, p_motivo text, p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_m record;
  v_a text;
begin
  select * into v_m from matricula where id = p_matricula and fecha_fin is null;
  if v_m.id is null then raise exception 'matricula_inexistente_o_cerrada'; end if;
  if p_motivo not in ('migracion', 'egreso', 'arco_baja', 'error_carga') then
    raise exception 'motivo_invalido';
  end if;

  update matricula
     set fecha_fin = current_date, estado = 'cerrada',
         motivo_cierre = p_motivo, cerrada_por = p_actor
   where id = p_matricula;

  v_a := case p_motivo when 'egreso' then 'egresado'
                       when 'arco_baja' then 'baja'
                       else 'en_transito' end;
  perform alumno_transicionar(v_m.alumno_id, v_a, p_actor,
    jsonb_build_object('matricula_id', p_matricula, 'motivo', p_motivo));

  delete from alumno_cred where perfil_id = v_m.alumno_id;
  delete from intento_login where perfil_id = v_m.alumno_id;

  insert into auditoria (actor_id, accion, entidad, entidad_id, detalle)
  values (coalesce(p_actor, '00000000-0000-0000-0000-000000000000'),
          'matricula_cerrada', 'matricula', p_matricula,
          jsonb_build_object('alumno_id', v_m.alumno_id, 'motivo', p_motivo));
end;
$$;
revoke execute on function matricula_cerrar(uuid, text, uuid) from public, anon, authenticated;

-- ── 6) Backfill retroactivo ─────────────────────────────────────────────────
-- Cada alumno existente con colegio recibe su matrícula activa (INSERT puro:
-- no muta perfil → el down deja el estado pre-migración exacto). El trigger
-- de sync re-escribe el caché con los mismos valores (no-op efectivo).
insert into matricula (alumno_id, escuela_id, aula_id, docente_id, grado, abierta_por)
select id, escuela_id, aula_id, docente_id, grado, null
from perfil
where rol = 'alumno' and escuela_id is not null;

-- Huérfanos (alumnos sin escuela, si los hubiera): quedan explícitamente en
-- tránsito, con el legajo intacto esperando reingreso. El guard exige el GUC.
do $$ begin
  perform set_config('edutia.matricula_sync', '1', true);
  update perfil set estado = 'en_transito'
  where rol = 'alumno' and escuela_id is null and estado = 'activo';
end $$;
