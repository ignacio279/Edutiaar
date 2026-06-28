-- EDUTIA — Fase 2 / SP-4: tipo de ejercicio (cobertura por formato).
-- La regla de dominio (spec 2026-06-28-evaluacion-y-dominio-de-nodos.md) exige
-- cobertura de formatos: para dominar un nodo hay que demostrarlo en varios tipos,
-- no solo opción múltiple. Por eso el ejercicio lleva un tipo.

create type tipo_ejercicio as enum ('reconocer','completar','ordenar','producir');
alter table ejercicio add column tipo tipo_ejercicio not null default 'reconocer';
