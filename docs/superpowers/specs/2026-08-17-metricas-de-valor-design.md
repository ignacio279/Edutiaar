# Métricas de valor en `/admin/metricas` — diseño

**Fecha:** 2026-08-17 · **Estado:** aprobado, en implementación
**Migración:** `0032_metricas_de_valor.sql` · **ADR relacionados:** ADR-009 (panel admin), ADR-010 (observatorio), ADR-011 (golondrina)

## Problema

`/admin/metricas` mide **volumen**, no **salud**. Los cuatro tiles de arriba
("548 ejercicios respondidos", "275 generados", "1 boletín", "4 chats") son
contadores crudos: sin denominador, sin comparación contra el período anterior
y sin ninguna consecuencia. Ninguno responde la pregunta que le importa a quien
opera la plataforma: **¿esto le está sirviendo a alguien?**

Peor: dos de ellos inducen conclusiones falsas.

- "ejercicios generados por SOL" es un número de **costo**, no de adopción. Más
  generados NO es mejor: un ejercicio generado que nadie respondió es plata
  quemada (Regla 4). Su lugar natural es Costos, y su forma útil es un ratio.
- "Precisión" en la comparativa entre colegios (80% vs 67%) no compara
  enseñanza: son chicos de distintos grados, en distintos nodos y con
  **dificultad adaptativa** (`elegirEjercicios` sube y baja el nivel según el
  historial de cada uno). Es comparar notas de exámenes distintos. Justo lo que
  el Observatorio resuelve con marco NAP + k=5.

Mientras tanto, EDUTIA guarda algo que casi ninguna plataforma educativa tiene y
que hoy no se mira: un **motor determinístico que sabe si un chico aprendió un
tema**. `alumno_nodo.puntaje` (ELO-lite 0→100) y el hito `dominado` — que exige
≥70 puntos, ≥2 ejercicios de `producir`, ≥1 difícil al primer intento y ≥50
respondidos — no son telemetría: son **evidencia de aprendizaje**.

## Qué se construye

Diez métricas, agrupadas en tres preguntas.

### A. ¿Los chicos aprenden?

| # | Métrica | Por qué es interesante |
|---|---|---|
| 1 | **Temas dominados en el período** (+ delta vs. período anterior) | El hito es caro y pegajoso: no se regala. Es la frase de valor del producto. |
| 2 | **Esfuerzo para dominar**: mediana de ejercicios hasta el hito | Si **baja** mes a mes, SOL está eligiendo mejor. Mide si *nosotros* mejoramos. |
| 3 | **Chicos destrabados**: salieron de `a_reforzar` | Recuperación — el caso más lindo del producto, y hoy invisible. |
| 4 | **Histograma de puntaje** de la plataforma, mes contra mes | La curva entera moviéndose a la derecha. |

### B. ¿Cubrimos el currículum oficial? *(el diferencial)*

| # | Métrica | Por qué es interesante |
|---|---|---|
| 5 | **% de los NAP del grado cubierto / dominado** | Con los 289 temas oficiales ya en la base: "un chico de 3° cubrió el 34% de los NAP de 3°". Es el número para un ministerio. |
| 6 | **Temas NAP que ningún colegio toca** | Puntos ciegos de toda la plataforma. Accionable: o falta contenido o falta programa. |

### C. ¿Le sirve a la maestra? *(el copiloto)*

| # | Métrica | Por qué es interesante |
|---|---|---|
| 7 | **Alertas de LUNA atendidas / emitidas** + mediana de tiempo hasta atender | Si las marca, LUNA **gobierna decisiones**. Si las ignora, LUNA es ruido bonito. La métrica más honesta del producto. |
| 8 | **Tasa de boletín aprobado sin editar**, como tendencia mensual | Una caída = regresión de prompt, detectada sola. |
| 9 | **Override docente**: cuántas veces le lleva la contra al motor | Bajo = confía. Alto = el modelo no matchea el aula. Interesante en los dos sentidos. |
| 10 | **Horas ahorradas estimadas** (boletines × ~18 min) | Etiquetado "estimado". Es la historia de valor, contada en la unidad que la maestra siente. |

Fuera de alcance (propuestos y NO incluidos en esta fase): costo por tema
dominado, desperdicio del pool, detección de ejercicios sospechosos, semanas
activas consecutivas por colegio.

## Decisión de arquitectura: log de hitos por trigger

Dos hechos verificados contra el código:

1. **`alumno_nodo.actualizado_at` no sirve para saber cuándo se dominó un
   tema.** `web/app/alumno/[programaId]/practicar/page.tsx:295` hace upsert con
   `actualizado_at: new Date()` en **cada** cierre de sesión, incluso sobre un
   nodo que ya estaba `dominado` (el estado es pegajoso pero el puntaje se
   sigue replayeando). El timestamp dice "última práctica", no "fecha del hito".
2. **`alumno_nodo` lo escribe el cliente**, por RLS: el chico al practicar
   (`practicar/page.tsx:295`) y la seño al fijar un override
   (`docente/[alumnoId]/page.tsx:123`). El front no es una fuente de eventos
   confiable ni única.

De ahí la decisión: **un trigger `SECURITY DEFINER` sobre `alumno_nodo` es el
único escritor del log de hitos**. No lo puede falsear el cliente, cubre los dos
caminos de escritura sin tocar el front, y sigue vivo si mañana aparece un
tercero. Es el patrón que el proyecto ya usa para blindar invariantes en la
base: `matricula_sync` (0022), `perfil_guard` (0022), `nodo_nap_guard` (0031).

**Alternativa descartada — snapshot nocturno de todo.** Da deltas gruesos pero
no sabe *cuándo* pasó cada hito ni **cuántos ejercicios costó** (métrica 2), que
solo se puede capturar en el momento de la transición. El snapshot se conserva
únicamente para lo que es genuinamente poblacional: el histograma (métrica 4).

### Alertas emitidas: las persiste el dashboard, no un job

La métrica 7 necesita un denominador que hoy no existe: `luna_alerta_atendida`
(0017) guarda las atendidas, pero las alertas se **calculan on-demand** en
`web/lib/luna.ts` y nunca se guardan.

Se descartó espejar los detectores a `_shared/` + job nocturno (el slot
`luna_nocturno` reservado en `admin-jobs:209`): duplica ~120 líneas de lógica y
obliga a un test de paridad, como el de `acceso-logica`.

En su lugar: **el dashboard de la seño persiste lo que le mostró**
(`docente/luna/page.tsx:143`, justo donde ya llama `alertasAula`), con upsert
idempotente por `(docente_id, clave)`. Menos código, sin duplicación, y
semánticamente más preciso: el denominador pasa a ser *"alertas que LUNA
efectivamente le mostró"*, no *"alertas que existirían si abriera la pantalla"*.
Si nunca abre LUNA, no hubo nada que atender — y eso es la verdad, no un
agujero. De yapa sale gratis el **tiempo hasta atender** (`atendida_at` −
`primera_vez_at`).

Riesgo aceptado: la escribe el cliente por RLS, así que una docente podría
inflar sus propias filas. Mismo modelo de amenaza que `luna_alerta_atendida`,
ya aceptado en 0017; es analítica interna, sin efecto sobre acceso ni datos de
menores.

## Modelo de datos — migración `0032`

Las tres tablas nuevas son **server-only** salvo donde se indique (RLS activa,
sin policies para `authenticated`), como `uso_api`.

### `hito_aprendizaje` *(métricas 1, 2, 3, 9)*

`id` · `alumno_id` (FK cascade) · `nodo_id` (FK cascade) · `escuela_id` y
`grado` **desnormalizados** desde `perfil` (agregar por colegio y grado sin
joins caros; `perfil` es caché que mantiene `matricula_sync`) · `tipo`
(`dominado|destrabado|trabado|override`) · `ejercicios_hasta` · `puntaje` ·
`origen` (`vivo|backfill`) · `created_at`.

`nap_tema_id` **no** se desnormaliza: un nodo se puede reclasificar y la
clasificación vigente es la verdad — se joinea `nodo` al consultar.

Trigger `hito_registrar` — `after insert or update on alumno_nodo`, dispara:

| Transición | Hito |
|---|---|
| `estado` → `dominado` (desde otro) | `dominado` |
| `a_reforzar` → cualquier otro | `destrabado` |
| cualquier otro → `a_reforzar` | `trabado` |
| `estado_override` `false` → `true` | `override` |

Una transición puede emitir **dos** hitos (`a_reforzar` → `dominado` = destrabado
+ dominado); es correcto y es información. `ejercicios_hasta` se cuenta en el
momento del hito (`respuesta` ⋈ `sesion` por alumno+nodo), que es la única
oportunidad de saberlo sin reconstruir la historia.

### `snapshot_aprendizaje` *(métrica 4)*

`fecha` (date) · `escuela_id` · `bucket` (0-9 = decil de puntaje) · `nodos`.
PK `(fecha, escuela_id, bucket)` → la corrida es idempotente. La llena
`admin-jobs`, colgada del cron nocturno que ya existe.

### `luna_alerta` *(métrica 7)*

`docente_id` · `clave` (`tipo:alumnoId`, la misma de `claveAlerta`) · `tipo` ·
`prioridad` · `primera_vez_at`. PK `(docente_id, clave)`.
RLS: la docente **inserta y lee lo suyo**; sin policy de UPDATE, así que
`primera_vez_at` no se puede mover hacia adelante.

### Backfill

Los hitos históricos no existen. Se siembran con `origen='backfill'` desde el
estado actual de `alumno_nodo`: `created_at = actualizado_at` (**fecha
aproximada**, documentada) y `ejercicios_hasta` contado de verdad. El front
distingue `backfill` de `vivo` y no los mezcla en las series temporales: entran
como "antes de la medición". Sin esto las series arrancan vacías y la pantalla
parece rota el primer mes.

## Backend

- **`admin-metricas`** suma tres acciones, mismo patrón que las existentes
  (filas crudas ya acotadas; el cálculo vive en la lib pura del front):
  `aprendizaje` (hitos + snapshots), `curriculum` (NAP × nodos × alumno_nodo),
  `copiloto` (boletines + alertas emitidas/atendidas + overrides).
- **`admin-jobs`** suma la acción `snapshot_aprendizaje`, invocada también desde
  `nocturno`.

## Front

- Lib pura nueva **`web/lib/admin/valor.ts`** (no se agranda `metricas.ts`, que
  ya tiene 327 líneas) + `tests/unit/admin-valor.test.mjs`. Determinística, con
  `now: Date` inyectado, patrón `luna.ts` / `metricas.ts`.
- `/admin/metricas` reorganizada en los tres bloques, con cuatro tiles arriba:
  **temas dominados · % NAP del grado · alertas atendidas · horas ahorradas**.
- La columna **precisión** sale de la comparativa entre colegios (induce a
  conclusión falsa) y la reemplaza **activos/matriculados**.
- La curva semanal grafica **chicos activos**, no sesiones, y marca la semana en
  curso como parcial (hoy la última barra siempre parece una caída).

## Honestidad de los datos (no negociable)

- Toda métrica derivada de `origen='backfill'` se muestra separada o marcada.
- "Horas ahorradas" dice **estimado** y publica su supuesto (18 min/boletín).
- Muestras chicas se dicen: con n < 5 la tasa no se pinta como porcentaje.
- Cobertura NAP siempre muestra numerador y denominador ("34 de 61 temas").
- Nada de esto agrega datos nuevos de menores: el panel admin sigue viendo
  agregados e identificadores, nunca contenido del chico (Regla 5).

## Tests

- Unitarios de `valor.ts`: las diez métricas, con listas vacías → ceros y nunca
  NaN; ventanas de tiempo en los bordes; separación `vivo` / `backfill`.
- DDL del trigger en `tests/unit` (patrón `golondrina-ddl.test.mjs`).
- Integración: el trigger escribe el hito y el cliente NO puede insertar en
  `hito_aprendizaje` (RLS), en `tests/integration`.
