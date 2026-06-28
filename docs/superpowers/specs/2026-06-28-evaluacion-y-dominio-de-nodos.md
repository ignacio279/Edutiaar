# Evaluación y dominio de nodos — Spec

> Spec de diseño. Define **QUÉ** construir y por qué. No es plan de ejecución.
> Fecha: 2026-06-28. Estado: **propuesta; es la Etapa 3 del MVP y la base de la evaluación de Fase 2.**
> Relacionados: [`2026-06-27-sol-fase2-agent-sdk-design.md`](2026-06-27-sol-fase2-agent-sdk-design.md), [`2026-06-28-decaimiento-temporal-repaso-espaciado.md`](2026-06-28-decaimiento-temporal-repaso-espaciado.md), [`../../DATA_MODEL.md`](../../DATA_MODEL.md), [`../../DECISIONS.md`](../../DECISIONS.md), [`../../ROADMAP.md`](../../ROADMAP.md).

## Resumen

Cuando un chico practica un nodo, ¿cuándo decimos que **lo domina**? Este spec define esa regla.
La clave: **el estado del nodo lo decide una regla determinística de la app, NO la IA** (resuelve OPEN-1
del spec de SOL Fase 2). La IA (SOL) solo produce un **diagnóstico cualitativo** aparte (`evaluacion_sesion`);
el color del mapa lo mueve esta regla, en código, gratis.

La regla no premia repetir: premia **cobertura**. Para dominar un nodo el chico tiene que demostrarlo en
**varios formatos** (no solo opción múltiple) y en **dificultad alta**, todo **al primer intento**. Eso es lo
que mata el "adivinar": no se domina un nodo a fuerza de clicks con suerte.

## Por qué determinística y no por IA

| # | Decisión | Por qué |
|---|---|---|
| D1 | **El estado del nodo lo calcula la app, no la IA.** | **Confianza:** la maestra puede predecir y explicar por qué un nodo está verde. **Costo:** contar respuestas es gratis (no gasta API). **Menores:** no manda datos del chico a la IA para esto. (Es el ancla de D9 del spec de SOL y de DD1 del de decaimiento.) |
| D2 | **La regla corre al cerrar la sesión**, sobre las `respuesta` de esa sesión + la ventana reciente del nodo. | Un punto único, barato, después de que la app ya corrigió cada respuesta (ADR-002). |
| D3 | **Dominar exige cobertura de formato y dificultad, no repetición.** | Evita el falso dominio por opción múltiple repetida. |
| D4 | **Solo cuentan los aciertos al PRIMER intento** (`correcta` Y `reintentos = 0`). | Acertar después de fallar/reintentar no demuestra dominio. |
| D5 | **`a_reforzar` es señal suave: nunca retrocede a `no_empezado`.** | Cuidado emocional (no castiga); la maestra ve "atender" sin borrar progreso. |
| D6 | **La docente puede fijar el estado a mano (override).** | Conoce al chico; manda ella sobre la regla. |
| D7 | **El decaimiento temporal queda para Fase 2** (spec aparte). | Acá se define cómo se *llega* a `dominado`; cómo se *afloja* con el tiempo es [`...decaimiento...`](2026-06-28-decaimiento-temporal-repaso-espaciado.md). |

## Estados del nodo

Enum `estado_nodo` (ya existe en DATA_MODEL): `no_empezado` | `en_construccion` | `a_reforzar` | `dominado`.

- **no_empezado** — el chico todavía no practicó el nodo.
- **en_construccion** — empezó pero todavía no alcanza el dominio.
- **a_reforzar** — se está trabando AHORA (señal de rendimiento, ortogonal al tiempo).
- **dominado** — cubrió formatos y dificultad al primer intento en la ventana reciente.

## La regla (determinística)

Se evalúa por nodo, mirando una **ventana reciente: las últimas 8 respuestas del chico en ese nodo**
(`respuesta` join `ejercicio` del nodo, ordenadas por fecha). "Acierto" = `correcta = true` **Y** `reintentos = 0`.

- **→ `dominado`** si en la ventana hay **≥ 6 de 8 aciertos al primer intento**, y entre esos aciertos hay
  **≥ 2 de tipo `producir`** y **≥ 1 de dificultad alta** (`dificil`). (Cobertura, no repetición.)
- **→ `a_reforzar`** si **2 fallos seguidos** al primer intento, **o** la sesión cerró con **< 50 %** de aciertos.
  Señal suave: marca "atender", **nunca** baja a `no_empezado`.
- **→ `en_construccion`** si practicó pero no cae en ninguno de los anteriores.
- **`no_empezado`** se mantiene solo si nunca practicó.

> Los números (ventana 8, umbral 6, ≥2 `producir`, ≥1 `dificil`, < 50 %) son el diseño cerrado;
> los **valores exactos quedan a validar con la docente** en el piloto. La forma de la regla no cambia.

### Puntaje (gradiente del mapa)
`alumno_nodo.puntaje` = **% de aciertos al primer intento en la ventana, ponderado por tipo y dificultad**
(producir y difícil pesan más). Es lo que pinta el gradiente de color del nodo en el mapa, más fino que el
estado discreto.

## Tipos de ejercicio (cobertura)

Para que la regla pueda exigir cobertura, el ejercicio necesita un **tipo**. Se agrega:

- **`ejercicio.tipo`** enum: `reconocer` | `completar` | `ordenar` | `producir` (demanda creciente).
  - *reconocer* — elegir la opción correcta (opción múltiple).
  - *completar* — llenar un hueco.
  - *ordenar* — poner en secuencia.
  - *producir* — generar la respuesta (lo más exigente; es lo que valida dominio real).
- `ejercicio.dificultad` ya existe (int); se usa para el requisito de "≥1 difícil".

> Requiere que el **pool de ejercicios** (`generador-ejercicios`) genere **varios tipos y dificultades** por
> nodo. Sin variedad en el pool, la cobertura no se puede exigir.

## Servir ejercicios (la escalera)

Al practicar, la app no sirve cualquier ejercicio: **empuja hacia los formatos y dificultades que al chico le
faltan cubrir** en ese nodo. Si ya tiene varios `reconocer` fáciles al primer intento, le ofrece `producir`
y/o difícil. Así, avanzar hacia `dominado` implica naturalmente demostrar cobertura. (Esta es la "escalera"
que referencian el spec de SOL y el de decaimiento.)

Dificultad adaptativa (ROADMAP Etapa 3): sube si acierta seguido, baja si falla — dentro de la escalera de
cobertura.

## Flujo al cerrar sesión (paso a paso)

1. El chico practicó: la app sirvió ejercicios (escalera), **corrigió cada respuesta (gratis)** comparando
   contra `ejercicio.correcta`, guardó `respuesta` (con `correcta`, `reintentos`, `tiempo_seg`) y la `sesion`.
2. Al cerrar la sesión, **la app recalcula `alumno_nodo`** (estado + puntaje) del nodo tocado con la regla de
   arriba. Determinístico, instantáneo, sin IA. **El mapa cambia de color acá.**
3. En paralelo (Fase 2), la Edge Function `evaluar-sesion` produce el **diagnóstico cualitativo** de SOL
   (`evaluacion_sesion`: resumen, errores, a_reforzar) — eso es ayuda para la maestra/el chico, **no** mueve
   el estado.

> Separación de poderes: **regla = estado/color** (app, gratis); **SOL = diagnóstico** (IA, 1 llamada Haiku).

## Modelo de datos (cambios)

- **`ejercicio.tipo`** enum `reconocer|completar|ordenar|producir` — nuevo (ver arriba).
- `alumno_nodo` ya tiene `estado`, `puntaje`, `actualizado_at`: la regla los escribe al cerrar sesión.
- `respuesta` ya tiene `correcta` y `reintentos`: son la entrada de la regla.
- No hace falta tabla nueva para esto. (El diagnóstico de SOL vive en `evaluacion_sesion`, definida en el spec de SOL.)

## Override de la docente

La maestra puede **fijar el estado de un nodo a mano** (D6), por encima de la regla. Útil cuando conoce algo
que la práctica no captó. Implementación: un campo/registro de override que la regla respeta (no lo pisa en el
próximo cierre de sesión). Detalle fino se define en el plan de SP-4.

## Qué resuelve / qué deja abierto

- **Resuelve OPEN-1** del spec de SOL Fase 2: la regla de dominio del nodo queda definida, determinística,
  calculada por la app, con cobertura por formato (`producir`) y dificultad.
- **Habilita SP-4** (evaluador por sesión): la regla determinística + el diagnóstico cualitativo de SOL.
- **Deja a Fase 2** el **decaimiento temporal / repaso espaciado** (cómo un `dominado` se afloja con el
  tiempo) → spec [`2026-06-28-decaimiento-temporal-repaso-espaciado.md`](2026-06-28-decaimiento-temporal-repaso-espaciado.md).

## A validar con la docente

- Los **valores** de la regla: ventana (8), umbral de dominio (6/8), mínimos de `producir` (≥2) y `dificil` (≥1), piso de `a_reforzar` (< 50 %).
- La ponderación exacta del **puntaje** por tipo/dificultad.
- Si los **cuatro tipos** de ejercicio son los correctos para Lengua (y cómo se trasladan a otras materias).
