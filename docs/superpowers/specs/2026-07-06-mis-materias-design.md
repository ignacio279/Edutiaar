# Mis materias — registro y gestión de materias de la docente

**Fecha:** 2026-07-06 · **Estado:** implementado

## Problema

La docente no tenía registro de sus materias: la única superficie era `/docente/autoria`, cuyo estado vive en memoria. Si salía de la página, el borrador quedaba huérfano en la DB (los ids solo venían del response de `dividir-nodos`) y regenerar creaba duplicados. Tampoco existía forma de eliminar una materia ni de sacarla del picker de los chicos.

## Decisiones (validadas con el usuario)

1. **Dos niveles de "eliminar":**
   - **Despublicar** — `sol_materia.estado` vuelve a `'borrador'`; la materia sale del picker del alumno (policy `sol_materia_select_publicado`), el progreso queda. Sale por RLS existente (`sol_materia_update`).
   - **Eliminar definitivo** — borra el `programa`; el cascade arrastra `sol_materia`, `nodo`, `ejercicio`, `alumno_nodo`, `sesion`, `respuesta` (progreso de menores incluido, irreversible). Confirmación fuerte: tipear el nombre de la materia.
2. **Alcance materias y nodos:** desde el listado se reabre autoría con la materia cargada (`/docente/autoria?sol=<sol_materia_id>`) para editar/agregar/borrar nodos y (re)publicar. Esto arregla de raíz el bug del borrador perdido.

## Diseño

- **Migración `0013_programa_delete_autor`** — policy DELETE en `programa` gateada por `sol_materia` dueña **y `estado = 'borrador'`**: el borrado de una publicada exige despublicar primero (dos pasos que el front no puede saltear). Los programas semilla no tienen `sol_materia` → protegidos. Patrón `nodo_delete_autor` (0006). Verificada en DB real con simulación de roles (dueña+publicada 0, ajena 0, dueña+borrador 1).
- **`web/lib/materias.ts`** (pura, testeada): `armarListadoMaterias` (join en memoria sol_materia+nodos; borradores primero), `normalizarNombre`/`confirmaBorrado` (comparación sin acentos/case/espacios; vacío nunca confirma), `puedeBorrar` (espejo de la policy).
- **`/docente/materias`** — listado de `sol_materia` de la docente (con `.eq('docente_id')` obligatorio: la policy de 0007 también expone publicadas ajenas de la escuela), cards con emblema (`temaMateria`), grado, badge de estado y chips de nodos. Acciones: Editar / Despublicar / Eliminar (modal). Los writes validan filas afectadas con `.select('id')` (PostgREST devuelve 204 aunque la RLS filtre).
- **Autoría con `?sol=`** — `Suspense` + `useSearchParams`; modo `editar` oculta el form de generación (texto/PDF intacto para crear) y muestra header read-only. `publicar()` ahora guarda nodos primero (`guardarNodos()` extraído) y en una publicada saltea el update de estado y solo llama a `generador-ejercicios` (idempotente: genera para nodos sin ejercicios).
- **`DocenteSidebar`** compartido (antes 4 copias inline); ítem "Subir un plan" → "Mis materias".

## Tests

- `tests/unit/materias.test.mjs` — view-model y confirmación (12 casos).
- `tests/integration/materias-rls.test.mjs` — despublicar dueña/ajena, delete bloqueado en publicada, delete ajena/alumno, delete dueña en borrador + verificación del cascade completo (necesita envs).
