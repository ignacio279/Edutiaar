# CUE y asiento ministerial — diseño

**Fecha:** 2026-08-18 · **Origen:** panel multi-agente "qué le falta al dashboard para el Ministerio de Educación" (8 agentes: 5 investigadores + 3 jurados). Los dos slices elegidos por el usuario de ese veredicto.

## Problema

1. **Los colegios de EDUTIA no tienen identidad oficial.** `escuela` (0001+0018+0021+0025) guarda nombre, zona (texto libre), provincia, tipo — pero no el **CUE** (Clave Única de Establecimiento, el identificador federal de todo establecimiento educativo argentino). Sin CUE, ningún número de EDUTIA se puede cruzar con el Padrón Oficial, el Relevamiento Anual, SInIDE ni Aprender: para un equipo técnico ministerial son datos de un universo paralelo, y el matching por nombre en ruralidad ("Escuela N° 45" en cada departamento) es veto garantizado. Fue la única propuesta unánime del panel (5/5 investigadores, 3/3 jurados).

2. **El ministerio no tiene dónde sentarse.** `institucion` acepta `tipo = 'provincia'` desde 0025, pero `institucion-panel` expone solo operación (resumen, métricas de volumen, altas, cupos): la provincia que entrara hoy vería costos y licencias, **cero aprendizaje**. Y encima la acción `metricas` devuelve `precision` por colegio como titular de cada fila — la misma métrica que la spec 2026-08-17 retiró de `/admin/metricas` por no comparable entre colegios (distintos grados, nodos y dificultad adaptativa), servida justo al actor con más poder de ranking sobre esas escuelas.

## Decisiones

### Slice 1 — Identidad oficial del establecimiento (migración `0033`)

- **Columnas nuevas en `escuela`, todas nullable** (nada se rompe, nada se exige retroactivamente): `cue` (`^[0-9]{9}$`), `cue_anexo` (`^[0-9]{2}$`, '00' = sede), `departamento`, `localidad` (texto), `matricula_declarada` (1..10000, la matrícula TOTAL del establecimiento que dicta la escuela — el denominador de cualquier cobertura futura) y `matricula_anio` (2000..2100, de qué año es ese dato).
- **Unicidad:** índice único parcial sobre `(cue, coalesce(cue_anexo,'00')) where cue is not null` — dos colegios no pueden reclamar el mismo establecimiento; anexo null y '00' son el mismo asiento (la sede).
- **Validación espejada, patrón `provincias.ts`:** regexes y rangos viven UNA vez en `_shared/identidad.ts`, espejo en `web/lib/admin/identidad.ts`, y un test de paridad compara ambos **y** el texto de la migración (patrón DDL congelado de `valor-ddl.test.mjs`). El server es la fuente de verdad; la UI solo da feedback.
- **Superficie:** alta de colegio en `/admin/colegios` suma CUE + anexo (opcionales); la ficha suma la tarjeta **"Identidad oficial"** (CUE, anexo, departamento, localidad, matrícula declarada + año) editable vía `editar`. `colegio_crear` de `institucion-panel` también acepta CUE/anexo. Errores: `cue_invalido`, `cue_anexo_invalido`, `cue_duplicado` (23505 del índice), `matricula_invalida`, `matricula_anio_invalido`.
- **Lo que NO entra (veredicto del panel):** import del Padrón de datos.gob.ar con autocompletado (v2, no bloqueante — el alta es una operación de decenas de veces al año), columnas `ambito`/`sector` (`escuela.tipo` ya cubre la organización; el ámbito oficial se deriva del padrón por CUE el día que haga falta), y cualquier pantalla nueva por departamento (el dato se guarda; la vista espera densidad para que k=5 no la vacíe).

### Slice 2 — Desempeño NAP en el panel institucional

- **`observatorio-logica.ts` se muda a `_shared/`** (las fns solo comparten por `_shared`; hasta hoy era privado de `admin-observatorio`). Cero cambios de conducta: mismos exports, mismos tests (cambia el path).
- **Acción nueva `desempeno` en `institucion-panel`:** espejo de la de `admin-observatorio` (materia obligatoria, grado 1-7 obligatorio) pero con el universo **scopeado a los colegios de la institución** en la capa de datos (mismo patrón que el resto de la fn: cada query filtra por `institucion_id`, el front no es fuente de verdad). Reusa `desempenoPorEje` tal cual: k=5 por tema, cobertura "N de M colegios", filas que nacen del catálogo, exclusión ARCO (`excluido_procesamiento`) antes de agregar. `provinciaDeAlumno` va vacío y sin filtro de provincia: el scoping ya lo hace el conjunto de escuelas. Solo lectura → no audita (mismo criterio que admin-observatorio).
- **`precision` por colegio se RETIRA de la acción `metricas`**: fuera `precisionConK` (función + test + campos `precision`/`muestraInsuficiente` de la respuesta) y fuera `copyPrecision` del front. La fila del colegio queda con volumen (sesiones, activos 7d, costo) — el desempeño ahora se mira contra los NAP, que sí es comparable. El front viejo deployado degrada con gracia (lee `undefined` → "Sin práctica todavía") hasta que llegue el push.
- **Front `/institucion`:** sección nueva "Aprendizaje contra los NAP" — chips de las 4 materias NAP + selector de grado 1-7, render por eje (dominio ponderado, alumnos, cobertura) con sus temas (dominio, % dominaron, "N de M colegios", pill de muestra chica). Las 4 materias se duplican como constante local con **test de paridad** contra `MATERIAS_NAP` de `web/lib/admin/nap.ts` (importar el módulo entero arrastraría el catálogo de 289 temas al bundle de la página). Copys puros en `web/lib/institucion.ts`, testeados.
- **Regla inquebrantable intacta:** la respuesta de `desempeno` son agregados del catálogo — ni nombres ni ids de alumnos ni de colegios (la cobertura es un CONTEO).

## Tests

- `tests/unit/identidad.test.mjs` (nuevo): validadores, paridad `_shared` ↔ `web/lib` ↔ DDL 0033, bordes (8/10 dígitos, anexo '00', matrícula 0 y 10001).
- `tests/unit/admin-colegios.test.mjs`: `validarCrear`/`validarEditar`/`armarPatchEditar` con los campos nuevos.
- `tests/unit/golondrina-front.test.mjs`: `validarColegioCrear` (institucion-panel) con CUE; muere el test de `precisionConK`; copys nuevos del panel.
- Integración (necesita envs, como siempre): la acción `desempeno` scopeada queda anotada para `matriz-permisos.test.mjs`.

## Deploy

`0033` (aditiva, segura) + re-deploy de `admin-colegios`, `admin-observatorio` (import movido) e `institucion-panel`. El front llega a prod con el push a `main` (camino Vercel, independiente — recordar el 2026-08-12).
