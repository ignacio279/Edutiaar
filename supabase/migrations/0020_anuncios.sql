-- EDUTIA — Dashboard admin v3, WP8: anuncios / broadcast a maestras.
-- Spec: docs/superpowers/specs/2026-08-05-admin-dashboard-v3-design.md.
-- El admin crea anuncios (globales o por colegio) SOLO vía la Edge Function
-- admin-anuncios (service_role); las docentes los leen por RLS con alcance y
-- vigencia ya resueltos en la policy — el front no filtra nada sensible.

create table anuncio (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  cuerpo text not null,
  escuela_id uuid references escuela(id) on delete cascade,  -- null = todas
  activo boolean not null default true,
  desde timestamptz,
  hasta timestamptz,
  creado_por uuid not null,
  created_at timestamptz not null default now()
);
create index anuncio_vigencia_idx on anuncio (activo, escuela_id);
alter table anuncio enable row level security;

-- Solo DOCENTES en alcance y vigencia. Sin INSERT/UPDATE/DELETE para
-- authenticated: escribe únicamente admin-anuncios (service_role).
create policy anuncio_select_docente on anuncio for select to authenticated
  using (
    activo
    and (desde is null or desde <= now())
    and (hasta is null or hasta >= now())
    and (escuela_id is null or escuela_id = mi_escuela())
    and exists (select 1 from perfil p where p.id = auth.uid() and p.rol = 'docente')
  );
