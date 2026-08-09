-- EDUTIA — Fase "Observatorio y avisos": provincia normalizada, alertas del
-- operador persistidas y el PRIMER cron del repo (job nocturno).
-- Spec: docs/superpowers/specs/2026-08-09-observatorio-y-avisos-design.md · ADR-010.

-- ── 1) Jurisdicción del colegio (eje del observatorio) ──────────────────────
-- `zona` sigue siendo texto libre (detalle); `provincia` es el eje normalizado.
-- La lista está espejada en _shared/provincias.ts y web/lib/admin/provincias.ts
-- (patrón planes.ts: test de paridad congela las tres copias).
alter table escuela add column provincia text
  check (provincia is null or provincia in (
    'Buenos Aires','CABA','Catamarca','Chaco','Chubut','Córdoba','Corrientes',
    'Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones',
    'Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz',
    'Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'));

-- Backfill de la seed ('Neuquén, Patagonia' → 'Neuquén').
update escuela set provincia = 'Neuquén' where zona ilike '%neuqu%';

create index escuela_provincia_idx on escuela (provincia);

-- ── 2) Alertas del operador precalculadas (server-only: RLS sin policies) ───
-- Snapshot que escribe admin-jobs cada noche (o "Recalcular ahora").
-- `clave` = la clave determinística de _shared/alertas-logica.ts → upsert
-- natural, idempotente. `tipo` SIN check a propósito: un detector nuevo no
-- debe exigir migración.
create table admin_alerta (
  clave text primary key,
  tipo text not null,
  prioridad text not null check (prioridad in ('alta', 'media')),
  escuela_id uuid references escuela (id) on delete cascade,
  escuela_nombre text not null,
  titulo text not null,
  detalle text not null,
  generada_at timestamptz not null default now()
);
create index admin_alerta_orden_idx on admin_alerta (prioridad, generada_at desc);
alter table admin_alerta enable row level security;

-- ── 3) Cron nocturno (primer cron del repo) ─────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper reutilizable: llama a la Edge Function admin-jobs con los secretos
-- guardados en VAULT (nada de secretos commiteados; sembrarlos es paso de
-- deploy — ver docs/DEPLOY_OBSERVATORIO_AVISOS.md:
--   select vault.create_secret('<url del proyecto>', 'project_url');
--   select vault.create_secret('<service_role JWT legacy>', 'service_role_key');
-- OJO: tiene que ser el JWT legacy, no un sb_secret_ — con verify_jwt=true un
-- token que no es JWT muere en el gateway).
-- Si faltan los secretos, avisa con raise notice y no hace nada: la migración
-- aplica limpia y el cron corre "vacío" hasta que se siembren.
-- El futuro job nocturno de LUNA se agenda con este MISMO helper y otra accion.
create or replace function llamar_admin_jobs(p_accion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'llamar_admin_jobs: faltan secretos en Vault (project_url / service_role_key)';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/admin-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('accion', p_accion),
    timeout_milliseconds := 30000);
end;
$$;
revoke execute on function llamar_admin_jobs(text) from public, anon, authenticated;

-- 06:00 UTC = 03:00 Argentina. cron.schedule con nombre es upsert (idempotente).
select cron.schedule('admin-jobs-nocturno', '0 6 * * *',
  $$select public.llamar_admin_jobs('nocturno')$$);
