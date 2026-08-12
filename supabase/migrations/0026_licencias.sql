-- EDUTIA — Alumno golondrina, Fase 2: licencias (evolución de los trials).
-- Spec: docs/superpowers/specs/2026-08-10-alumno-golondrina-design.md · ADR-011.
--
-- Una licencia es de UN colegio o de UNA institución (pool con cupos), nunca
-- ambos. El veredicto de acceso pasa a mirar la licencia efectiva (directa
-- primero, pool después) reutilizando el corte suave del trial: vencida =
-- solo lectura, jamás borrar. escuela.estado queda como freno de mano manual
-- y la rama trial de 0018 como fallback para colegios sin licencia.

-- ── 1) Licencia ─────────────────────────────────────────────────────────────
create table licencia (
  id             uuid primary key default gen_random_uuid(),
  escuela_id     uuid references escuela(id) on delete cascade,
  institucion_id uuid references institucion(id) on delete cascade,
  plan           text not null default 'docente'
                 check (plan in ('basico', 'docente', 'completo', 'custom')),
  cupos          int check (cupos is null or cupos > 0),
  fecha_inicio   date not null default current_date,
  fecha_fin      date,
  estado         text not null default 'prueba'
                 check (estado in ('prueba', 'activa', 'vencida', 'suspendida')),
  condiciones    text,
  created_at     timestamptz not null default now(),
  -- De un colegio XOR de una institución; cupos solo tienen sentido en pools.
  check (num_nonnulls(escuela_id, institucion_id) = 1),
  check (institucion_id is not null or cupos is null)
);
create index licencia_escuela_idx on licencia (escuela_id) where escuela_id is not null;
create index licencia_institucion_idx on licencia (institucion_id) where institucion_id is not null;
alter table licencia enable row level security;
-- Sin policies: server-only. La maestra ve el EFECTO vía mi_acceso().

-- Un colegio consume a lo sumo UN cupo de UN pool (PK = escuela_id).
create table licencia_asignacion (
  escuela_id  uuid primary key references escuela(id) on delete cascade,
  licencia_id uuid not null references licencia(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index licencia_asignacion_lic_idx on licencia_asignacion (licencia_id);
alter table licencia_asignacion enable row level security;
-- Sin policies: server-only.

-- Respaldo del cupo a nivel DB (la fn valida primero y da el error amigable):
-- asignar por encima del cupo del pool es imposible aunque haya carrera.
create or replace function licencia_cupos_guard()
returns trigger language plpgsql as $$
declare
  v_cupos int;
  v_usadas int;
begin
  -- Lock del pool (for update) para que dos asignaciones concurrentes no
  -- pasen el cupo: la segunda espera y ve el count ya actualizado.
  select cupos into v_cupos from licencia where id = new.licencia_id for update;
  if v_cupos is not null then
    select count(*) into v_usadas from licencia_asignacion where licencia_id = new.licencia_id;
    if v_usadas >= v_cupos then raise exception 'sin_cupos'; end if;
  end if;
  return new;
end;
$$;
create trigger licencia_cupos_guard_trg
  before insert or update on licencia_asignacion
  for each row execute function licencia_cupos_guard();

-- ── 2) acceso_calcular v2 (MISMA firma y shape que 0018) ────────────────────
-- Prioridad: sin perfil → bloqueado · sin escuela → bloqueado · colegio
-- suspendido/archivado → bloqueado (freno de mano) · maestra suspendida →
-- bloqueado · licencia efectiva: suspendida → bloqueado, vencida →
-- solo_lectura (corte suave; 'prueba' vencida reporta trial_vencido, el resto
-- licencia_vencida) · sin licencia → rama trial de 0018 intacta · después,
-- el trial propio de la maestra. Los consumidores (mi_acceso, acceso_de,
-- decidirAcceso, front) no cambian: mismo jsonb de salida.
create or replace function acceso_calcular(p_perfil uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_perfil record;
  v_escuela record;
  v_docente uuid;
  v_acc record;
  v_flags jsonb;
  v_lic record;
  v_lic_vencida boolean;
  v_estado text := 'activo';
  v_motivo text := null;
  v_trial date := null;
begin
  select id, rol, escuela_id, docente_id into v_perfil from perfil where id = p_perfil;
  if v_perfil.id is null then
    return jsonb_build_object('estado', 'bloqueado', 'motivo', 'sin_perfil',
                              'trial_fin', null, 'features', features_default());
  end if;

  select estado, trial_fin into v_escuela from escuela where id = v_perfil.escuela_id;
  select coalesce(ef.flags, features_default()) into v_flags
    from (select 1) x left join escuela_feature ef on ef.escuela_id = v_perfil.escuela_id;

  v_docente := case when v_perfil.rol = 'docente' then v_perfil.id else v_perfil.docente_id end;
  select estado, trial_fin into v_acc from docente_acceso where perfil_id = v_docente;

  -- Licencia efectiva: la directa del colegio manda; si no hay, la del pool.
  select l.id, l.estado, l.fecha_fin into v_lic
    from licencia l where l.escuela_id = v_perfil.escuela_id
   order by l.fecha_inicio desc, l.created_at desc limit 1;
  if v_lic.id is null then
    select l.id, l.estado, l.fecha_fin into v_lic
      from licencia_asignacion la join licencia l on l.id = la.licencia_id
     where la.escuela_id = v_perfil.escuela_id
     order by l.fecha_inicio desc, l.created_at desc limit 1;
  end if;
  v_lic_vencida := v_lic.id is not null and (v_lic.estado = 'vencida'
    or (v_lic.fecha_fin is not null and v_lic.fecha_fin < current_date));

  if v_escuela.estado is null then
    v_estado := 'bloqueado'; v_motivo := 'sin_escuela';
  elsif v_escuela.estado in ('suspendido', 'archivado') then
    v_estado := 'bloqueado'; v_motivo := 'colegio_suspendido';
  elsif v_acc.estado = 'suspendido' then
    v_estado := 'bloqueado'; v_motivo := 'cuenta_suspendida';
  elsif v_lic.id is not null and v_lic.estado = 'suspendida' then
    v_estado := 'bloqueado'; v_motivo := 'licencia_suspendida';
  elsif v_lic_vencida then
    v_estado := 'solo_lectura';
    v_motivo := case when v_lic.estado = 'prueba' then 'trial_vencido' else 'licencia_vencida' end;
    v_trial := v_lic.fecha_fin;
  elsif v_lic.id is null and v_escuela.estado = 'trial' and v_escuela.trial_fin is not null
        and v_escuela.trial_fin < current_date then
    v_estado := 'solo_lectura'; v_motivo := 'trial_vencido'; v_trial := v_escuela.trial_fin;
  elsif v_acc.trial_fin is not null and v_acc.trial_fin < current_date then
    v_estado := 'solo_lectura'; v_motivo := 'trial_vencido'; v_trial := v_acc.trial_fin;
  else
    v_trial := coalesce(
      case when v_lic.id is not null and v_lic.estado = 'prueba' then v_lic.fecha_fin end,
      case when v_lic.id is null and v_escuela.estado = 'trial' then v_escuela.trial_fin end,
      v_acc.trial_fin);
  end if;

  return jsonb_build_object('estado', v_estado, 'motivo', v_motivo,
                            'trial_fin', v_trial, 'features', v_flags);
end;
$$;

-- ── 3) Backfill: cada colegio existente recibe su licencia ──────────────────
-- trial → 'prueba' con sus fechas; el resto → 'activa' SIN fecha_fin (un
-- trial_fin viejo en un colegio ya activo no debe resucitar como corte).
insert into licencia (escuela_id, plan, fecha_inicio, fecha_fin, estado)
select e.id,
       coalesce(ef.plan, 'docente'),
       coalesce(e.trial_inicio, current_date),
       case when e.estado = 'trial' then e.trial_fin else null end,
       case when e.estado = 'trial' then 'prueba' else 'activa' end
from escuela e
left join escuela_feature ef on ef.escuela_id = e.id
where not exists (select 1 from licencia l where l.escuela_id = e.id);
