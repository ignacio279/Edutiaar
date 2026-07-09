-- 0014: imagen opcional en ejercicio (accesibilidad para pre-lectores 1°-2°).
-- Guarda una CLAVE de arte (art-key) del set fijo de web/lib/art.ts item()
-- (apples3, stars4, solcito, arbol, oveja, uva); NO una URL ni un binario.
-- Nullable: la enorme mayoría de los ejercicios sigue siendo solo texto.
-- Sin cambios de RLS: ejercicio ya es select 'to authenticated using(true)' y
-- las escrituras son service_role (generador-ejercicios).

alter table ejercicio add column if not exists imagen text;
