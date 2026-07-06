-- EDUTIA — "Mis materias": borrado definitivo de una materia propia.
-- Despublicar ya sale por sol_materia_update (0006). Eliminar = borrar el
-- programa: el cascade arrastra sol_materia, nodos, ejercicios, alumno_nodo,
-- sesion y respuesta (progreso de menores incluido — irreversible).
-- Guarda de dos pasos EN EL SERVIDOR: solo se borra en 'borrador'; una materia
-- publicada exige despublicarla primero (update separado). Los programas
-- semilla no tienen sol_materia → quedan protegidos por el exists.
create policy programa_delete_autor on programa for delete to authenticated
  using (exists (
    select 1 from sol_materia sm
    where sm.programa_id = programa.id
      and sm.docente_id = auth.uid()
      and sm.estado = 'borrador'
  ));
