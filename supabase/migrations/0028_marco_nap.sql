-- EDUTIA — Marco curricular NAP: la vara fija contra la que el observatorio
-- mide el aprendizaje. Spec: docs/superpowers/specs/2026-08-14-marco-nap-observatorio-design.md
--
-- Server-only a propósito (RLS habilitada SIN policies): lo leen dividir-nodos
-- y las fns admin-* con service_role. La docente todavía no ve su tema NAP
-- (fuera de alcance) y el alumno nunca.

create table nap_eje (
  id uuid primary key default gen_random_uuid(),
  materia text not null check (materia in
    ('Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales')),
  nombre text not null,
  orden int not null default 0,
  unique (materia, nombre)
);
alter table nap_eje enable row level security;

create table nap_tema (
  id uuid primary key default gen_random_uuid(),
  eje_id uuid not null references nap_eje(id) on delete cascade,
  nombre text not null,
  grado int not null check (grado between 1 and 7),
  orden int not null default 0,
  unique (eje_id, nombre, grado)
);
alter table nap_tema enable row level security;
create index nap_tema_eje_idx on nap_tema (eje_id, grado);

-- El mapeo cuelga de nodo (D-NAP3): 1 nodo → 0 o 1 tema. NULL = fuera del
-- marco, y como el dashboard agrega POR nap_tema_id, lo no mapeado desaparece
-- solo (así "Ética no se muestra" no necesita código propio).
alter table nodo add column nap_tema_id uuid references nap_tema(id) on delete set null;
alter table nodo add column nap_confianza numeric check (nap_confianza is null or (nap_confianza >= 0 and nap_confianza <= 1));
alter table nodo add column nap_revisado boolean not null default false;
create index nodo_nap_tema_idx on nodo (nap_tema_id);
