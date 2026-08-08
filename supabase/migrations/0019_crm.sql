-- EDUTIA — Dashboard admin v3 / WP7: CRM-lite y alertas del operador.
-- Spec: docs/superpowers/specs/2026-08-05-admin-dashboard-v3-design.md (D9:
-- esta migración está pre-asignada al WP7; ningún otro WP crea migraciones).
-- Patrón server-only de 0018: RLS habilitada SIN policies → solo el
-- service_role (Edge Function admin-crm, con guard plataforma_admin) las toca.
-- Ninguna docente ni alumno ve una nota de la relación comercial (PostgREST
-- devuelve 0 filas y rechaza inserts).

-- ── Notas de la relación con cada colegio (timeline CRM) ────────────────────
create table escuela_nota (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuela(id) on delete cascade,
  autor_id uuid not null, autor_email text,
  tipo text not null default 'nota' check (tipo in ('nota','contacto','acuerdo')),
  cuerpo text not null,
  created_at timestamptz not null default now()
);
create index escuela_nota_idx on escuela_nota (escuela_id, created_at desc);
alter table escuela_nota enable row level security;

-- ── Alertas del operador ya atendidas (patrón 0017 luna_alerta_atendida) ────
-- Las alertas se calculan on-demand (admin-crm/alertas-logica.ts); acá solo se
-- persiste la CLAVE determinística de cada hecho puntual ya atendido, así
-- "Listo ✓" la oculta para siempre aunque se recalcule. La clave es global al
-- equipo operador (no por admin): si uno la atendió, está atendida.
create table admin_alerta_atendida (
  clave text primary key,
  atendida_por uuid not null,
  atendida_at timestamptz not null default now()
);
alter table admin_alerta_atendida enable row level security;
