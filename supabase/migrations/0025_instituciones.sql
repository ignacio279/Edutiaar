-- EDUTIA — Alumno golondrina, Fase 2: instituciones (tenancy de dos niveles).
-- Spec: docs/superpowers/specs/2026-08-10-alumno-golondrina-design.md · ADR-011.
--
-- Una institución (provincia, fundación, red, municipio) agrupa colegios y
-- puede tener sus propios administradores. REGLA INQUEBRANTABLE: el admin de
-- institución JAMÁS ve datos de alumnos individuales — solo agregados de SUS
-- colegios (k-anonimato del observatorio incluido).

create table institucion (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  tipo       text check (tipo in ('provincia', 'fundacion', 'red', 'municipio')),
  contacto   jsonb,
  estado     text not null default 'activa'
             check (estado in ('activa', 'suspendida', 'archivada')),
  created_at timestamptz not null default now()
);
alter table institucion enable row level security;
-- Sin policies: server-only (admin-instituciones e institucion-panel).

alter table escuela add column institucion_id uuid references institucion(id) on delete set null;
create index escuela_institucion_idx on escuela (institucion_id);

-- Admins de institución: tabla PROPIA, no un nivel nuevo en plataforma_admin.
-- Diseño fail-closed: las 13 fns admin existentes consultan plataforma_admin
-- → un admin de institución les da 403 automático sin tocar una línea; solo
-- institucion-panel conoce esta tabla (via verificarAdminInstitucion).
create table institucion_admin (
  perfil_id      uuid primary key references auth.users(id) on delete cascade,
  institucion_id uuid not null references institucion(id) on delete cascade,
  nombre         text not null,
  activo         boolean not null default true,
  creado_por     uuid,
  created_at     timestamptz not null default now()
);
create index institucion_admin_inst_idx on institucion_admin (institucion_id);
alter table institucion_admin enable row level security;
-- Sin policies: server-only.
