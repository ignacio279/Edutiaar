-- EDUTIA — Etapa 0, item 1: esquema inicial
-- Crea enums, las 9 tablas del modelo (docs/DATA_MODEL.md) e índices de FK.

create type rol_usuario as enum ('docente','alumno');
create type estado_nodo as enum ('no_empezado','en_construccion','a_reforzar','dominado');

create table escuela (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  zona text
);

create table perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  rol rol_usuario not null,
  nombre text not null,
  avatar text,
  grado int,
  escuela_id uuid references escuela(id) on delete set null,
  docente_id uuid references perfil(id) on delete set null
);

create table materia (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
);

create table programa (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references materia(id) on delete cascade,
  grado int not null,
  contenido text
);

create table nodo (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references programa(id) on delete cascade,
  nombre text not null,
  orden int not null default 0
);

create table ejercicio (
  id uuid primary key default gen_random_uuid(),
  nodo_id uuid not null references nodo(id) on delete cascade,
  enunciado text not null,
  opciones jsonb not null,
  correcta text not null,
  dificultad int not null default 1
);

create table alumno_nodo (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references perfil(id) on delete cascade,
  nodo_id uuid not null references nodo(id) on delete cascade,
  estado estado_nodo not null default 'no_empezado',
  puntaje numeric not null default 0,
  actualizado_at timestamptz not null default now(),
  unique (alumno_id, nodo_id)
);

create table sesion (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references perfil(id) on delete cascade,
  nodo_id uuid not null references nodo(id) on delete cascade,
  fecha timestamptz not null default now(),
  duracion_seg int,
  aciertos int default 0,
  total int default 0
);

create table respuesta (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesion(id) on delete cascade,
  ejercicio_id uuid not null references ejercicio(id) on delete cascade,
  dada text,
  correcta bool not null,
  tiempo_seg int,
  reintentos int default 0,
  created_at timestamptz not null default now()
);

create index on perfil(docente_id);
create index on perfil(escuela_id);
create index on programa(materia_id);
create index on nodo(programa_id);
create index on ejercicio(nodo_id);
create index on alumno_nodo(alumno_id);
create index on alumno_nodo(nodo_id);
create index on sesion(alumno_id);
create index on sesion(nodo_id);
create index on respuesta(sesion_id);
create index on respuesta(ejercicio_id);
