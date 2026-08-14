# Diseño — Marco curricular NAP en el Observatorio (desempeño por materia y tema, comparable entre colegios)

> Fecha: 2026-08-14 · Etapa: Fase 2 (continuación de "Observatorio y avisos").
> Estado: diseño aprobado, sin implementar.

## Problema

El Observatorio agrega por jurisdicción y por materia × grado, y eso funciona:
contra la base real devuelve Neuquén con 5 alumnos activos y 79% de precisión,
y Lengua 3° con 78% de precisión y 36 de dominio promedio. Pero el nivel que un
ministerio realmente quiere leer — **cómo van los chicos tema por tema** — no
sirve, por tres razones distintas que conviene no mezclar:

1. **No hay vocabulario común.** Los nombres de nodo los escribe cada docente (o
   SOL a partir de lo que ella sube). `normalizarTema` hace `trim + lowercase +
   colapsar espacios`, nada más. Por eso todo el nivel tema sale marcado
   `aproximado: true` por diseño, y por eso dos colegios que enseñan lo mismo
   nunca caen en la misma fila salvo coincidencia de tipeo.
2. **Solo se muestran los 10 peores.** `topTemasQueCuestan` responde "qué duele
   más", no "cómo va cada tema". No existe el desglose completo.
3. **Está vacío.** El piso de `MIN_RESPUESTAS_TEMA = 20` por tema, con 23
   sesiones repartidas en 7 nodos, deja la respuesta en `{"temas": []}`.

Y hay un problema de encuadre además del técnico: hoy el dashboard agrega
**todo lo que los colegios practiquen**. Si una escuela da Ética, Ética entra.
Un tablero para un ministerio no puede tener una lista de materias que cambia
según lo que se le ocurrió cargar a cada docente.

## Objetivo

Que el Observatorio muestre, para un conjunto **fijo y con autoridad** de
materias y temas, cómo va el aprendizaje — legible por alguien que no conoce el
producto, y comparable entre colegios porque todos se miden contra la misma
vara.

En una frase: **definir contra qué se mide, y que lo que no esté en esa vara no
aparezca.**

Fuera de alcance (explícito):

- **La puerta para el ministerio.** Esta pantalla la abre el admin de EDUTIA en
  `/admin`. Un usuario propio para una provincia es otra fase; el asiento ya
  existe (`institucion` acepta tipo `provincia`, `institucion-panel` jamás
  muestra un alumno) y se reusará entonces.
- Exportación a CSV/PDF.
- Mostrarle el tema NAP a la docente en autoría.
- Corrección por representatividad muestral (ver Riesgos).
- TERRA.

## Decisiones

- **D-NAP1 — El marco son los NAP oficiales, cuatro materias.** Núcleos de
  Aprendizajes Prioritarios: Lengua, Matemática, Ciencias Naturales y Ciencias
  Sociales. Es el currículum que el Consejo Federal ya acordó para todo el
  país, así que un ministerio no discute la lista porque es la suya, y son
  además las áreas que Aprender evalúa. Ética y todo lo demás quedan fuera del
  dashboard por construcción, no por una regla especial.
  **El catálogo se carga desde los documentos oficiales**; transcribirlos con
  fidelidad es parte del trabajo, no se genera de memoria (ver Riesgos).

- **D-NAP2 — Dos niveles: eje → tema.** El eje es el titular ("Número y
  operaciones"), el tema es el contenido por grado ("Fracciones de uso
  frecuente"). El titular siempre junta datos suficientes para ser confiable;
  el detalle responde el "¿por qué?". Un solo nivel falla en una punta u otra:
  solo ejes no es accionable, solo contenidos no es legible.

- **D-NAP3 — El mapeo cuelga de `nodo`, y `null` significa "fuera del marco".**
  Tres columnas en `nodo`, sin tabla puente: la relación es 1 nodo → 0 o 1
  tema, y `nodo` ya es la unidad que referencian `sesion` y `alumno_nodo`, así
  que agregar queda en un join directo. Que `nap_tema_id` sea nullable es lo
  que hace que "Ética no se muestra" salga gratis: el dashboard agrega **por**
  `nap_tema_id`, entonces lo no mapeado desaparece solo.

- **D-NAP4 — Clasifica `dividir-nodos`, y puede decir que no sabe.** Esa
  función ya llama a Sonnet cuando la seño divide su programa; se le suma al
  prompt el catálogo NAP de esa materia y grado (~25 líneas) y devuelve por
  nodo su tema y una confianza 0..1. **Devolver `null` está explícitamente
  permitido y se pide en el prompt**: un clasificador que nunca dice "no sé"
  ensucia el promedio con encajes forzados. Cero fricción para la docente y
  costo marginal nulo (ninguna llamada nueva).

- **D-NAP5 — Un tema promedia solo sobre los colegios que lo dan.** "Darlo" =
  tener al menos un nodo mapeado a ese tema **con al menos una sesión de al
  menos un alumno dentro del rango consultado**. Un nodo publicado pero nunca
  practicado no cuenta como dar el tema: el colegio lo tiene en el papel, no en
  el aula, y meterlo al denominador diluiría el promedio con ceros
  encubiertos. Un colegio
  que no lo da queda fuera del denominador; **nunca cuenta como cero**.
  Corolario obligatorio: **la cobertura se muestra siempre junto al número**
  ("Fracciones · 58 · 3 de 5 colegios"). Sin eso, un tema que da un solo
  colegio se lee como dato jurisdiccional, y eso es peor que no mostrarlo.

- **D-NAP6 — El promedio es sobre alumnos, no sobre colegios.** Cada chico pesa
  igual; el eje pondera sus temas por cantidad de alumnos con dato. Promediar
  promedios por colegio le daría a una escuela de 6 alumnos el mismo peso que a
  una de 200. La pregunta es "cómo van los chicos", así que el alumno es la
  unidad.

- **D-NAP7 — k=5 se mantiene, ahora por tema.** Un tema con menos de 5 alumnos
  distintos devuelve métricas `null` + `muestraInsuficiente: true`. El eje se
  calcula solo con los temas que pasan k. El anonimato no se toca: ninguna
  respuesta lleva nombres ni ids, y el test estructural que lo congela se
  extiende a los agregadores nuevos.

- **D-NAP8 — Se retira `topTemasQueCuestan`, y con él la etiqueta
  `aproximado`.** La tabla nueva ordenada por dominio ascendente **es** "los
  temas que más cuestan", pero con vocabulario canónico. Mantener los dos deja
  dos caminos a la misma pregunta con dos vocabularios distintos, uno de ellos
  admitidamente impreciso.

## Modelo de datos

Migración `0028_marco_nap.sql`:

```sql
create table nap_eje (
  id uuid primary key default gen_random_uuid(),
  materia text not null check (materia in
    ('Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales')),
  nombre text not null,
  orden int not null default 0,
  unique (materia, nombre)
);

create table nap_tema (
  id uuid primary key default gen_random_uuid(),
  eje_id uuid not null references nap_eje(id) on delete cascade,
  nombre text not null,
  grado int not null check (grado between 1 and 7),
  orden int not null default 0,
  unique (eje_id, nombre, grado)
);

alter table nodo add column nap_tema_id uuid references nap_tema(id);
alter table nodo add column nap_confianza numeric;
alter table nodo add column nap_revisado boolean not null default false;
create index nodo_nap_tema_idx on nodo (nap_tema_id);
```

RLS: el catálogo es **server-only** (lo leen `dividir-nodos` y las fns `admin-*`
con service_role). No se expone a `anon` ni a `authenticated` — la docente no lo
ve todavía (fuera de alcance), y el alumno nunca.

`nodo.nap_*` queda cubierto por las policies que `nodo` ya tiene. La escritura
del mapeo pasa solo por service_role.

## La clasificación

**Al publicar.** `dividir-nodos` recibe el catálogo de la materia y grado del
programa, y por cada nodo devuelve `{nap_tema_id, nap_confianza}` o `null`. La
lógica pura de armado del catálogo y de validación de la respuesta va en un
módulo hermano testeable desde Node, siguiendo el patrón de
`observatorio-logica.ts`.

**Backfill.** `scripts/backfill-nap.mjs`, idempotente: clasifica los nodos con
`nap_tema_id is null and nap_revisado = false`. Corre una vez sobre los 40 nodos
existentes y queda disponible para cuando se sumen colegios.

**Cola de revisión.** En `/admin`, una lista de nodos sin tema o con confianza
baja, agrupados por colegio y materia. El admin confirma o corrige; eso setea
`nap_revisado = true`. Es el mismo principio que LUNA: la máquina propone, la
persona decide. Un nodo revisado nunca se reclasifica solo.

## La agregación

Acción nueva `desempeno` en `admin-observatorio`, con la lógica pura en
`observatorio-logica.ts` (que ya existe y ya está testeada desde Node).

Entrada: `{materia, grado, provincia?, rango_dias}`. **`grado` es obligatorio**:
los temas de los NAP se definen por grado, así que agregar "todos los grados" en
una fila mezclaría contenidos distintos bajo un mismo nombre. La pantalla
siempre tiene un grado seleccionado.
Salida: ejes, cada uno con sus temas.

Por tema:

| Campo | De dónde sale |
|---|---|
| `dominioPromedio` | `alumno_nodo.puntaje` de los nodos mapeados a ese tema |
| `precision` | aciertos/total de las sesiones de esos nodos |
| `dominados` | % de alumnos con estado `dominado` |
| `alumnos` | alumnos distintos con dato |
| `colegiosConTema` / `colegiosTotal` | la cobertura de D-NAP5 |
| `muestraInsuficiente` | `alumnos < 5` → las tres métricas van `null` |

Por eje: las mismas métricas, ponderadas por alumnos con dato sobre los temas
que pasaron k, más su propia cobertura.

## La pantalla

`/admin/observatorio` suma la sección **"Desempeño por materia"**: cuatro chips
de materia, selector de grado, y el selector de provincia que ya existe.

Filas = ejes. Cada fila lleva **las tres métricas de la tabla de arriba**:
`dominioPromedio` como número grande **rotulado "Dominio"**, con su barra, y
`precision` y `dominados` como stats secundarias al lado. El rótulo no es
opcional: en esta misma pantalla la tarjeta "Aprendizaje por zona" muestra un
número rotulado "Precisión", así que un número pelado acá se lee como esa otra
cosa. Y al lado, siempre, la cobertura. Click en un eje → despliega sus temas
con el mismo formato. Las celdas sin muestra suficiente dicen "muestra
insuficiente" en vez de un número — las tres juntas, nunca una sí y otra no —
como ya hace el resto del Observatorio.

El drill-down actual de "temas que más cuestan" se retira (D-NAP8).

## Datos de demostración

`scripts/seed-actividad.mjs` se extiende para dejar un colegio con volumen real:
alumnos suficientes por grado para pasar k=5 y práctica en **Lengua y
Matemática** (hoy Matemática tiene 40 nodos cargados y cero práctica, así que no
aparece en ningún agregado). Los umbrales de anonimato **no se tocan**: se
arregla el dato, no la vara.

## Errores

- Catálogo ausente para una materia/grado → la sección muestra un vacío que lo
  explica, no un error.
- Clasificación fallida o inválida → el nodo queda con `nap_tema_id = null` y
  cae en la cola de revisión. Nunca rompe la publicación de la materia: la seño
  no se entera de que hubo un clasificador.
- Tema sin ningún colegio que lo dé → la fila se muestra con "sin datos", no se
  esconde: que un tema del marco no se esté enseñando **es** información.

## Testing

- **Unit** (`tests/unit/`): cobertura y exclusión de colegios sin el tema;
  ponderación por alumnos; k=5 por tema y propagación al eje; nodos con
  `nap_tema_id null` excluidos de todo agregado; validación de la respuesta del
  clasificador (incluido `null` como respuesta válida).
- **Anonimato estructural**: se extiende el test que congela que ninguna
  respuesta lleve nombres ni ids, para cubrir la acción `desempeno`.
- **Integración** (`tests/integration/`): el catálogo NO es legible por `anon`
  ni `authenticated`; `admin-observatorio` sigue exigiendo admin.

## Riesgos

1. **Transcribir los NAP.** El catálogo tiene que salir de las resoluciones del
   Consejo Federal, no de la memoria de un modelo. Es trabajo de carga real y
   hay que hacerlo con la fuente a la vista; un catálogo inventado invalida
   todo lo que se construya encima, y es exactamente el tipo de error que un
   ministerio detecta en la primera lectura.
2. **Clasificación errónea silenciosa.** Un nodo mal mapeado ensucia el
   promedio sin avisar. Lo mitigan la confianza reportada, la cola de revisión
   y el permiso explícito de devolver `null`, pero no desaparece.
3. **Representatividad.** Aprender tiene diseño muestral; esto mide a quien usa
   EDUTIA, cuando la usa. Ningún agregado lo corrige y el diseño no lo declara
   todavía. Antes de mostrarle esto a un organismo hay que decidir cómo se
   enuncia esa limitación en pantalla.
