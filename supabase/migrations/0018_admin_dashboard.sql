-- EDUTIA — Dashboard de administración v3: esquema transversal (Fase 0).
-- Spec: docs/superpowers/specs/2026-08-05-admin-dashboard-v3-design.md · ADR-009.
-- El admin de plataforma NO tiene fila en perfil ni valor nuevo en rol_usuario:
-- vive en plataforma_admin (server-only) y opera solo vía Edge Functions admin-*.
-- Ninguna policy existente se modifica; lo único que se reemplaza es el listado
-- anon de 0004 (leak de enumeración) por vistas públicas mínimas.

-- ── 1) Colegio: tipo, estado, trial, contacto CRM, límites de IA ────────────
alter table escuela
  add column tipo text check (tipo in ('rural', 'unidocente', 'plurigrado')),
  add column estado text not null default 'trial'
    check (estado in ('trial', 'activo', 'suspendido', 'archivado')),
  add column trial_inicio date,
  add column trial_fin date,
  add column contacto jsonb,
  add column limites jsonb,
  add column created_at timestamptz not null default now();

-- Backfill: la escuela semilla sigue operando como hasta hoy.
update escuela set estado = 'activo';

-- ── 2) Admins de plataforma (server-only: RLS sin policies) ─────────────────
create table plataforma_admin (
  perfil_id uuid primary key references auth.users (id) on delete cascade,
  nivel text not null check (nivel in ('super', 'operativo')),
  nombre text not null,
  activo boolean not null default true,
  creado_por uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table plataforma_admin enable row level security;

-- ── 3) Auditoría (server-only; escriben las fns admin desde el día uno) ─────
-- Sin FK en actor_id a propósito: el registro sobrevive al borrado del admin.
create table auditoria (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_email text,
  nivel text,
  accion text not null,
  entidad text,
  entidad_id uuid,
  detalle jsonb,
  created_at timestamptz not null default now()
);
create index auditoria_fecha_idx on auditoria (created_at desc);
create index auditoria_entidad_idx on auditoria (entidad, entidad_id);
alter table auditoria enable row level security;

-- ── 4) Features por colegio (la docente LEE la suya; escribe admin-features) ─
create table escuela_feature (
  escuela_id uuid primary key references escuela (id) on delete cascade,
  flags jsonb not null,
  plan text not null default 'custom'
    check (plan in ('basico', 'docente', 'completo', 'custom')),
  updated_at timestamptz not null default now()
);
alter table escuela_feature enable row level security;
create policy escuela_feature_select on escuela_feature for select to authenticated
  using (escuela_id = mi_escuela());

-- ── 5) Acceso por maestra (server-only) ─────────────────────────────────────
-- NO va en perfil: perfil_update permite self-update y una docente podría
-- des-suspenderse por PostgREST. Sin fila = activa sin trial propio.
create table docente_acceso (
  perfil_id uuid primary key references perfil (id) on delete cascade,
  estado text not null default 'activo' check (estado in ('activo', 'suspendido')),
  trial_inicio date,
  trial_fin date
);
alter table docente_acceso enable row level security;

-- ── 6) Uso de API (insert-only, server-only) ────────────────────────────────
-- Un INSERT por llamada a Claude (éxito o error). Sin la carrera
-- read-then-upsert de luna_uso; los agregados se computan on-demand.
create table uso_api (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid references escuela (id) on delete set null,
  perfil_id uuid references perfil (id) on delete set null,
  funcion text not null,
  modelo text,
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  costo_usd numeric(12, 6) not null default 0,
  ok boolean not null default true,
  latencia_ms int,
  error_codigo text,
  created_at timestamptz not null default now()
);
create index uso_api_escuela_idx on uso_api (escuela_id, created_at);
create index uso_api_funcion_idx on uso_api (funcion, created_at);
alter table uso_api enable row level security;

-- ── 7) Helpers y RPCs ───────────────────────────────────────────────────────

-- Nivel del admin logueado (null si no es admin). Igual que mi_escuela():
-- security definer + EXECUTE para authenticated (0005: no se puede revocar).
create or replace function admin_nivel()
returns text language sql security definer stable set search_path = public as $$
  select nivel from plataforma_admin where perfil_id = auth.uid() and activo;
$$;
revoke execute on function admin_nivel() from public, anon;

-- Defaults de flags: ÚNICA fuente (front y Edge no hardcodean). Equivale al
-- plan 'docente' (SOL + LUNA completa), la conducta actual de la app.
create or replace function features_default()
returns jsonb language sql immutable set search_path = public as $$
  select '{"sol": true, "luna": {"activa": true, "alertas": true, "boletines": true, "chat": true}, "terra": false}'::jsonb;
$$;
revoke execute on function features_default() from public, anon;

-- Núcleo del veredicto de acceso para un perfil (docente o alumno).
-- Solo lo llaman mi_acceso() (definer) y el service_role vía acceso_de().
-- Prioridad: sin perfil → bloqueado · colegio suspendido/archivado → bloqueado
-- · maestra suspendida → bloqueado · trial vencido (colegio o maestra) →
-- solo_lectura · si no → activo. Para un alumno rige el acceso de SU docente.
create or replace function acceso_calcular(p_perfil uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_perfil record;
  v_escuela record;
  v_docente uuid;
  v_acc record;
  v_flags jsonb;
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

  if v_escuela.estado is null then
    v_estado := 'bloqueado'; v_motivo := 'sin_escuela';
  elsif v_escuela.estado in ('suspendido', 'archivado') then
    v_estado := 'bloqueado'; v_motivo := 'colegio_suspendido';
  elsif v_acc.estado = 'suspendido' then
    v_estado := 'bloqueado'; v_motivo := 'cuenta_suspendida';
  elsif v_escuela.estado = 'trial' and v_escuela.trial_fin is not null
        and v_escuela.trial_fin < current_date then
    v_estado := 'solo_lectura'; v_motivo := 'trial_vencido'; v_trial := v_escuela.trial_fin;
  elsif v_acc.trial_fin is not null and v_acc.trial_fin < current_date then
    v_estado := 'solo_lectura'; v_motivo := 'trial_vencido'; v_trial := v_acc.trial_fin;
  else
    v_trial := coalesce(
      case when v_escuela.estado = 'trial' then v_escuela.trial_fin end,
      v_acc.trial_fin);
  end if;

  return jsonb_build_object('estado', v_estado, 'motivo', v_motivo,
                            'trial_fin', v_trial, 'features', v_flags);
end;
$$;
revoke execute on function acceso_calcular(uuid) from public, anon, authenticated;

-- Mi propio acceso (docente o alumno logueado). Solo datos propios → seguro
-- para authenticated.
create or replace function mi_acceso()
returns jsonb language sql security definer stable set search_path = public as $$
  select acceso_calcular(auth.uid());
$$;
revoke execute on function mi_acceso() from public, anon;

-- Acceso de un perfil arbitrario: SOLO service_role (Edge Functions).
create or replace function acceso_de(p_perfil uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select acceso_calcular(p_perfil);
$$;
revoke execute on function acceso_de(uuid) from public, anon, authenticated;

-- ── 8) Fix del leak de enumeración anon (reemplaza 0004) ────────────────────
-- Las columnas nuevas de escuela (estado, trial, contacto, límites) NO deben
-- ser legibles por anon. El setup del aula solo necesita id/nombre/zona, y un
-- colegio suspendido o archivado desaparece del listado.
drop policy escuela_anon_list on escuela;
drop policy aula_anon_list on aula;

create view escuela_publica as
  select id, nombre, zona from escuela where estado in ('trial', 'activo');
create view aula_publica as
  select id, escuela_id, nombre, grado, codigo from aula;
grant select on escuela_publica, aula_publica to anon, authenticated;
