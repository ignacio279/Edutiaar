-- 0016: formato de interacción del ejercicio (opciones/escribir/ordenar/unir).
-- Hasta ahora TODO ejercicio era opción múltiple; el enum `tipo` (reconocer/completar/
-- ordenar/producir) solo cambiaba el redactado. `formato` define CÓMO responde el chico:
--   opciones → toca uno de 4 botones (comportamiento histórico; es el DEFAULT).
--   escribir → tipea la respuesta (correcta = texto esperado; opciones vacío).
--   ordenar  → ordena fichas para armar una oración (opciones = fichas en orden correcto,
--              correcta = oración completa; el front las muestra mezcladas).
--   unir     → une pares tocando (datos.pares = [{izq,der}]; correcta = pares serializados).
-- `datos` (jsonb, nullable) guarda lo que no entra en opciones/correcta: los pares de
-- 'unir' y el flag {estricto:true} (nodos de ortografía/tildes → corrección sin normalizar).
-- default 'opciones' → los ~miles de ejercicios existentes siguen funcionando sin backfill.
-- Sin cambios de RLS: ejercicio ya es select 'to authenticated using(true)' y las
-- escrituras son service_role (generador-ejercicios).

create type formato_ejercicio as enum ('opciones', 'escribir', 'ordenar', 'unir');
alter table ejercicio add column if not exists formato formato_ejercicio not null default 'opciones';
alter table ejercicio add column if not exists datos jsonb;
