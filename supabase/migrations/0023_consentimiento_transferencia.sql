-- EDUTIA — Alumno golondrina, Fase 2: consentimiento parental y transferencia.
-- Spec: docs/superpowers/specs/2026-08-10-alumno-golondrina-design.md · ADR-011.
--
-- Regla dura de la pieza 2: SIN CONSENTIMIENTO REGISTRADO NO EXISTE
-- TRANSFERENCIA. Vive en la DB dos veces: matricula_abrir lo exige para toda
-- reapertura (acá se completa la validación de contenido que 0022 dejó
-- pendiente) y un CHECK impide confirmar una transferencia sin consentimiento
-- ni siquiera por SQL directo.

-- ── 1) Consentimiento ───────────────────────────────────────────────────────
-- Quién autorizó qué: un adulto responsable (nombre + vínculo, sin DNI — la
-- prohibición de identificadores estatales rige acá también) autoriza el
-- tratamiento de datos en un colegio o la transferencia hacia uno.
-- 'pendiente_regularizar' = deuda visible del backfill: los alumnos cargados
-- antes de esta migración operan normal, pero la maestra debe regularizar.
create table consentimiento (
  id             uuid primary key default gen_random_uuid(),
  alumno_id      uuid not null references perfil(id) on delete cascade,
  escuela_id     uuid not null references escuela(id),
  adulto_nombre  text not null,
  adulto_vinculo text not null check (adulto_vinculo in ('madre', 'padre', 'tutor', 'otro')),
  alcance        text not null check (alcance in ('tratamiento', 'transferencia')),
  via            text not null check (via in ('asistida', 'link', 'migracion')),
  estado         text not null default 'vigente'
                 check (estado in ('vigente', 'revocado', 'pendiente_regularizar')),
  -- Sin FK (patrón auditoria): el registro sobrevive al borrado del actor.
  registrado_por uuid,
  otorgado_at    timestamptz,
  revocado_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (estado <> 'vigente' or otorgado_at is not null),
  check (estado <> 'revocado' or revocado_at is not null)
);
create index consentimiento_alumno_idx on consentimiento (alumno_id, created_at desc);
create index consentimiento_deuda_idx on consentimiento (escuela_id)
  where estado = 'pendiente_regularizar';

alter table consentimiento enable row level security;
-- Lectura: el alumno lo suyo; la docente mientras lo tiene (mismo criterio que
-- matricula). Escritura server-only (Edge Functions con service_role).
create policy consentimiento_select on consentimiento for select to authenticated
  using (alumno_id = auth.uid() or es_mi_alumno(alumno_id));

-- Ahora sí: la FK que 0022 dejó diferida.
alter table matricula
  add constraint matricula_consentimiento_fk
  foreign key (consentimiento_id) references consentimiento(id) on delete set null;

-- ── 2) Transferencia (server-only) ──────────────────────────────────────────
-- El evento de consentimiento entre colegios. El token es opaco (hash bcrypt,
-- patrón aula_secreto): el link público no revela NADA del alumno hasta que
-- la familia lo confirma. La autorización de transferencia ES el consentimiento
-- de tratamiento para el colegio nuevo (consentimiento_id).
create table transferencia (
  id              uuid primary key default gen_random_uuid(),
  alumno_id       uuid not null references perfil(id) on delete cascade,
  escuela_origen  uuid references escuela(id),
  escuela_destino uuid not null references escuela(id),
  solicitada_por  uuid,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'confirmada', 'denegada', 'expirada')),
  token_hash      text,
  expira_at       timestamptz not null,
  consentimiento_id uuid references consentimiento(id),
  confirmada_via  text check (confirmada_via in ('link', 'asistida')),
  resuelta_at     timestamptz,
  created_at      timestamptz not null default now(),
  -- LA regla: sin consentimiento registrado no existe transferencia confirmada.
  check (estado <> 'confirmada' or consentimiento_id is not null),
  check (estado <> 'confirmada' or confirmada_via is not null),
  check (estado = 'pendiente' or resuelta_at is not null)
);
-- A lo sumo UNA pendiente por alumno (misma técnica que matricula_una_activa).
create unique index transferencia_una_pendiente on transferencia (alumno_id)
  where estado = 'pendiente';
create index transferencia_destino_idx on transferencia (escuela_destino, created_at desc);

alter table transferencia enable row level security;
-- Sin policies: solo service_role (las docentes la ven vía Edge Function, que
-- re-verifica pertenencia — el token jamás sale de la DB, solo su hash).

-- ── 3) Config de plataforma (server-only) ───────────────────────────────────
create table plataforma_config (
  clave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now()
);
alter table plataforma_config enable row level security;
insert into plataforma_config (clave, valor)
values ('transferencia_dias_expiracion', '14'::jsonb);

-- ── 4) matricula_abrir v2: valida el CONTENIDO del consentimiento ───────────
-- Misma firma que 0022. Reabrir exige un consentimiento del MISMO alumno,
-- HACIA la escuela que abre, con alcance 'transferencia' y vigente.
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
  if v_previas > 0 then
    if p_consentimiento is null then
      raise exception 'falta_consentimiento: reabrir matrícula exige consentimiento de transferencia';
    end if;
    perform 1 from consentimiento
      where id = p_consentimiento and alumno_id = p_alumno
        and escuela_id = p_escuela and alcance = 'transferencia'
        and estado = 'vigente';
    if not found then
      raise exception 'consentimiento_invalido: no es de este alumno hacia esta escuela, o no está vigente';
    end if;
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

-- ── 5) Backfill: deuda de consentimiento visible ────────────────────────────
-- Un registro 'pendiente_regularizar' por cada alumno pre-existente con
-- colegio: no bloquea nada, pero la deuda queda contable por escuela.
insert into consentimiento (alumno_id, escuela_id, adulto_nombre, adulto_vinculo,
                            alcance, via, estado)
select id, escuela_id, '(pendiente de regularizar)', 'otro',
       'tratamiento', 'migracion', 'pendiente_regularizar'
from perfil
where rol = 'alumno' and escuela_id is not null;
