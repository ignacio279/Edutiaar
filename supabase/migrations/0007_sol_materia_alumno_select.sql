-- EDUTIA — Fase 2 / SP-3: el alumno ve las materias publicadas de su escuela.
-- Hasta ahora sol_materia solo la leía su docente dueña (0006). El alumno necesita
-- listar las materias PUBLICADAS de su escuela para elegir cuál practicar.
-- Policy permisiva adicional → se OR-ea con sol_materia_select (dueño).
-- El filtro por grado lo hace el front (join a programa.grado); los nodos ya son
-- legibles por nodo_select using(true).

create policy sol_materia_select_publicado on sol_materia for select to authenticated
  using (estado = 'publicado' and escuela_id = mi_escuela());
