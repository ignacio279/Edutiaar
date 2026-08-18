-- EDUTIA — Identidad oficial del establecimiento (CUE y matrícula declarada).
-- Spec: docs/superpowers/specs/2026-08-18-cue-y-asiento-ministerial-design.md
--
-- POR QUÉ: el CUE (Clave Única de Establecimiento) es el identificador federal
-- de cada escuela argentina. Sin él, ningún número de EDUTIA se puede cruzar
-- con el Padrón Oficial, el Relevamiento Anual, SInIDE ni Aprender — y el
-- matching por nombre en ruralidad ("Escuela N° 45" en cada departamento) es
-- un veto técnico garantizado del equipo de estadística de cualquier provincia.
--
-- TODO NULLABLE a propósito: la identidad se carga cuando la escuela la dicta.
-- Ningún colegio existente se rompe y nada se exige retroactivamente.
-- Las reglas están espejadas en _shared/identidad.ts y web/lib/admin/identidad.ts
-- (patrón provincias.ts: el test de paridad compara los tres).

alter table escuela
  add column cue text
    check (cue is null or cue ~ '^[0-9]{9}$'),
  -- Anexo del establecimiento: '00' es la sede. Un anexo sin CUE no
  -- identifica nada; lo rechaza validarIdentidad y lo limpia armarPatchIdentidad.
  add column cue_anexo text
    check (cue_anexo is null or cue_anexo ~ '^[0-9]{2}$'),
  -- Departamento y localidad: el eje sub-provincial donde se decide la
  -- política educativa. Se GUARDA el dato desde ahora (barato); la vista
  -- agregada por departamento espera a que haya densidad para que el
  -- k-anonimato k=5 no la deje en blanco.
  add column departamento text,
  add column localidad text,
  -- Matrícula TOTAL del establecimiento según la escuela (no la de EDUTIA):
  -- el denominador sin el cual "12 chicos practicando" no dice nada.
  add column matricula_declarada integer
    check (matricula_declarada is null or matricula_declarada between 1 and 10000),
  add column matricula_anio integer
    check (matricula_anio is null or matricula_anio between 2000 and 2100);

-- Dos colegios no pueden reclamar el MISMO establecimiento oficial. Parcial:
-- los colegios sin CUE (todos los de hoy) no compiten entre sí. El coalesce
-- espeja a claveEstablecimiento(): anexo ausente y '00' son la misma sede.
create unique index escuela_cue_unico_idx
  on escuela (cue, coalesce(cue_anexo, '00'))
  where cue is not null;

-- Búsqueda por jurisdicción sub-provincial (la usa el panel al filtrar).
create index escuela_departamento_idx on escuela (provincia, departamento);
