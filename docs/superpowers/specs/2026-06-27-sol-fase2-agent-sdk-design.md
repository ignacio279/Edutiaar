# SOL Fase 2 — Diseño (especialista por materia + evaluación por sesión)

> Spec de diseño (planteo). Define QUÉ construir y por qué. No es plan de ejecución.
> Fecha: 2026-06-27 (rev. 2026-06-28). Estado: **propuesta, fuera del MVP (Fase 2)**.
> Documentos relacionados: [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`DATA_MODEL.md`](../../DATA_MODEL.md), [`DECISIONS.md`](../../DECISIONS.md), `2026-06-28-evaluacion-y-dominio-de-nodos.md`, [`Agents-sdk.md`](../../Agents-sdk.md).
>
> **Cambio clave (rev.):** el estado del nodo (`dominado`/`a_reforzar`/etc.) lo decide una **regla determinística de la app** (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`, que resuelve OPEN-1), **no la IA**. La evaluación por sesión de SOL es **solo diagnóstico cualitativo**. Ajustado en todo el documento.

## Resumen

Cada materia tiene su **SOL especialista**: la seño sube el contenido de la materia, SOL lo entiende, se especializa en eso y solo eso, divide el contenido en **nodos**, y los alumnos avanzan por esos nodos. Al cerrar cada sesión de práctica, SOL **evalúa al chico por lote** y produce un **diagnóstico cualitativo** (dónde falla, qué errores repite, qué reforzar). El **estado del nodo lo mueve la regla determinística de la app** (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`), no SOL. Queda preparado (sin construir) para que más adelante SOL **edite los nodos** según la evidencia.

Respeta el espíritu de **ADR-002** (la app sigue corrigiendo cada respuesta; SOL no corrige por click) y agrega una capa de evaluación cualitativa de costo controlado.

### Nota sobre el motor (Agent SDK vs Messages API)

El pedido original fue usar el **Agent SDK de Anthropic**. Se evaluó y se descartó, por dos razones. **La principal: SOL no necesita el Agent SDK.** El valor del SDK es el harness de Claude Code (leer/escribir archivos, correr bash, editar código, subagents); SOL solo tiene que llamar a Claude, usar 2–3 tools contra la base, y devolver datos estructurados — eso es exactamente lo que hace la **Messages API**, más simple y barato. **Secundaria:** el Agent SDK (TS) trae un binario de Claude Code y necesita un runtime Node con filesystem; **no corre en las Edge Functions de Supabase** (Deno). (Con Vercel sí hay funciones Node, así que si algún día se necesitara el SDK, el host sería una función de Vercel, no un servidor nuevo — pero no es el caso.)

Se eligió la **Messages API de Claude llamada desde Edge Functions de Supabase** (cero servidor nuevo, lo más barato, respeta "diseñar lo justo"). Se conservan los **conceptos** del diseño agente (especialista por materia, trabajos separados, método reusable, tools, salida estructurada), traducidos a Messages API. El **Agent SDK** (en host propio o en una función Node de Vercel) o **Managed Agents** (Anthropic hostea el loop) quedan como camino de upgrade solo si en el futuro se necesitan subagents/skills/hooks nativos.

## Decisiones tomadas (locks)

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Motor: Messages API de Claude desde Edge Functions de Supabase.** Sin servidor nuevo. | SOL no necesita el harness del Agent SDK; todo el stack ya vive en Supabase; lo más barato y menos ops. |
| D2 | **Evaluación por sesión (lote), no por click.** Es diagnóstico cualitativo. | Mantiene ADR-002 y el tope de costo (1 llamada por sesión, no 10). |
| D3 | **Especialización generada y guardada al subir el contenido.** SOL se especializa + divide en nodos de una vez; ambos quedan guardados; **la seño revisa antes de publicar**. | Barato (corre una vez por plan), versionable, controlable. |
| D4 | **SOL trabaja solo con los nodos guardados** durante las sesiones. No re-aprende todo cada vez. | Costo y previsibilidad. |
| D5 | **Trabajos separados** (dividir, evaluar) + **plantillas de método reusables** entre materias. | Separa el QUÉ (contenido por materia) del CÓMO (método compartido). |
| D6 | **La seño es quien sube el plan** (herramienta de autoría docente). | Resuelve OPEN-F2-1. Es Fase 2 según CLAUDE.md. |
| D7 | **Groundwork de nodos editables: dejar el seam, no construirlo.** | Es Fase 2.x; sin datos reales de uso sería sobrediseñar. |
| D8 | **La seño sube el contenido en PDF.** Claude lee el PDF directo (sin OCR aparte). | Resuelve OPEN-F2-3. La Messages API soporta PDF nativo. |
| D9 | **El estado del nodo lo decide una regla determinística de la app, NO la IA.** SOL solo diagnostica. | Confianza (la maestra lo predice), costo (es contar, gratis) y menores (menos datos a la IA). Ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`. |

## Capas conceptuales (modelo ordenador)

- **Método = el CÓMO** (cómo dividir/evaluar; materia-agnóstico, reusable). Vive como **plantillas de prompt** versionadas, no atado a una materia.
- **Perfil de materia (`sol_materia`) = el QUÉ** (el contenido, generado del plan).
- **Trabajo = una tarea de SOL** (dividir, evaluar; en el futuro editar). Cada trabajo = su propia llamada/Edge Function con su prompt + tools.
- **Tool (tool use) = las MANOS** (leer/escribir Supabase desde el loop de la Edge Function).
- **Tope de costo en código = los guardarraíles** (límite de tokens/llamadas + control de menores).

Cuando entra una materia nueva, **hereda el método** (las plantillas); solo cambia el perfil. No se reescribe nada.

## Arquitectura

```
[Vercel front (Next.js)]
     │ (HTTPS)
     ▼
[Supabase]
  ├─ Postgres (RLS)            contenido + progreso + sol_materia + evaluacion_sesion
  ├─ Auth                      docente / alumno
  └─ Edge Functions (Deno/TS)
        ├─ pool de ejercicios, login, corrección  ← per-click, barato, sin IA
        └─ SOL  ── Messages API ──►  [Claude API (Anthropic)]
              · especializar materia (al subir contenido)
              · dividir en nodos
              · evaluar sesión (al cerrar)
```

- La API key de Claude vive **solo en la Edge Function** (variable de entorno del servidor); el front nunca la ve. Respeta **ADR-005**.
- El front nunca llama a Claude directo: todo pasa por Edge Functions.
- Las Edge Functions de SOL corren solo en los **bordes** (subir contenido / cerrar sesión), nunca durante cada click.
- La Edge Function usa el SDK de Anthropic para TypeScript (o `fetch` directo) contra la Messages API.

### "1 SOL por materia" = sesión especializada (no chat caro permanente)

Durante la práctica **no se llama a Claude**: el chico responde ejercicios del pool (de varios tipos: reconocer, completar, ordenar, producir — ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`) y la app corrige cada uno comparando contra la respuesta correcta. SOL aparece solo en dos momentos:
- **Al subir contenido** (una vez): se especializa + divide en nodos.
- **Al cerrar sesión** (una vez): evalúa.

El botón "Mate" abre la práctica de esa materia; el SOL de Mate = `system_prompt` armado con `perfil_materia(mate)` + las plantillas de método. Distinto botón = distinto perfil cargado.

## Modelo de datos (cambios)

Lo de hoy se mantiene. Se agrega/ajusta:

### Nueva tabla `sol_materia` — el especialista guardado (uno por programa)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| programa_id | uuid | FK → programa |
| perfil | jsonb | system_prompt + tono + criterios_eval + ejemplos_zona |
| estado | enum | `borrador` \| `publicado` (la seño revisa antes) |
| version | int | versionar regeneraciones |
| created_at | timestamp | |

### Tabla `nodo` — agregar columnas
- `descripcion text` — qué cubre el nodo (para que el evaluador sepa qué mira).
- `actualizado_at timestamp` — seam de edición futura.
- `version int` — seam de edición futura.

### Tabla `ejercicio` — agregar columna
- `tipo enum` — `reconocer` \| `completar` \| `ordenar` \| `producir`. Necesaria para que la regla de dominio (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`) pueda exigir cobertura por formato. (Ya existe `dificultad`.)

### Nueva tabla `evaluacion_sesion` — la salida del evaluador (solo diagnóstico)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| sesion_id | uuid | FK → sesion |
| resumen | text | para la seño y el chico |
| errores | jsonb | patrones detectados (ej: "confunde b/d") |
| a_reforzar | jsonb | nodos/temas a reforzar (señal para el editor futuro) |
| created_at | timestamp | |

> Esta tabla es **solo diagnóstico cualitativo**. El estado del nodo (`alumno_nodo.estado`) **no** sale de acá: lo calcula la regla determinística de la app (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`).

`materia` / `nodo` / `alumno_nodo` ya soportan N materias (solo agregar filas + RLS).

## Trabajos de SOL (jobs)

| Trabajo | Cuándo | Tools | Método (plantilla) | Modelo |
|---|---|---|---|---|
| `dividir-nodos` | al subir el plan (1×) | `leer_programa`, `escribir_nodos` | `dividir-en-nodos` | `claude-sonnet-4-6` (Opus si el plan es difícil) |
| `evaluar-sesion` | al cerrar sesión | `leer_respuestas`, `escribir_evaluacion` | `evaluar-sesion`, `tono-sol` | `claude-haiku-4-5` (corre seguido) |
| `editar-nodos` *(futuro)* | seña pide / evidencia | `editar_nodo` (con OK seño) | `dividir-en-nodos` | — |

Cada trabajo = una Edge Function (o un handler) que arma el prompt con el perfil de la materia + la plantilla de método, corre un loop chico de tool use contra la Messages API, y escribe el resultado en Supabase. **El estado del nodo NO lo mueve la IA:** lo calcula la regla determinística de la app (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`) al cerrar la sesión, en código aparte. `generador-ejercicios` queda como está hoy (ya anda, barato), pero debe generar **ejercicios de varios tipos** (reconocer/completar/ordenar/producir) y dificultades para que la regla de cobertura funcione.

**Entrada de `dividir-nodos`:** la seño sube el contenido en **PDF** (D8). La Edge Function manda el PDF directo a Claude (document block base64, o vía Files API si es grande) — Claude lo lee sin pipeline de OCR aparte. PDF con texto nativo trocea mejor que foto escaneada; límite ~32MB / ~100 páginas *(verificar contra la doc actual)* — un plan entra cómodo. De ahí salen `sol_materia` (perfil) + los `nodo`, que la seño revisa antes de publicar.

## Método reusable (plantillas de prompt)

Arrancar con cuatro bloques de instrucciones, guardados y versionados, inyectables en el `system_prompt` de cada trabajo:
- `dividir-en-nodos` — granularidad, orden, prerrequisitos de un buen mapa de nodos.
- `evaluar-sesion` — leer respuestas → detectar patrones de error → producir el **diagnóstico cualitativo** (`resumen`, `errores`, `a_reforzar`). **No** decide el estado del nodo (eso es la regla determinística).
- `tono-sol` — voz rioplatense, alienta, nunca castiga (convención de CLAUDE.md).
- `ejemplos-de-zona` — usar `escuela.zona` para contextualizar.

Son materia-agnósticos: los comparten todas las materias y trabajos. (Si más adelante se migra al Agent SDK, estos bloques se convierten naturalmente en *skills* del SDK.)

## Tools (las manos sobre Supabase)

Pocas, parejas a la DB: `leer_programa`, `escribir_nodos`, `leer_respuestas(sesion)`, `escribir_evaluacion`, y *(futuro)* `editar_nodo`. Se implementan como **tool use** en el loop manual de la Edge Function (cada tool = una función que pega a Supabase con `service_role`). Cada tool **scopeada por alumno/sesión**.

> No hay tool de IA para mover el estado del nodo. La actualización de `alumno_nodo` la hace **código determinístico de la app** al cerrar la sesión (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`).

## Guardarraíles y salida limpia

- **Tope de costo:** se controla **en código** — límite de `max_tokens` por llamada, modelo barato (Haiku) para lo frecuente, y un contador/límite mensual de gasto. Cumple Rule 4. (Si se migra al Agent SDK, esto pasa a ser `max_budget_usd` built-in.)
- **Menores:** el `evaluar-sesion` devuelve **salida estructurada** que calza exacto con `evaluacion_sesion` → nunca texto libre suelto, no se cuelan datos personales. El schema es el contrato. Implementación: o bien el parámetro `output_format` (`{type: "json_schema", schema}`) de la Messages API *(verificar que Haiku lo soporte; arrancó como beta `structured-outputs-2025-11-13`)*, o más simple, **tool use estricto** — como el resultado se escribe vía `escribir_evaluacion`, el `input_schema` de ese tool con `strict: true` ya garantiza la estructura, sin parámetro aparte y andando en todos los modelos.
- **Tono:** validación liviana del mensaje al chico *(pulido, no bloqueante al inicio)*.

## Flujo de evaluación por sesión (paso a paso)

1. Chico practica: la app sirve ejercicios del pool (de varios tipos), **corrige cada respuesta (gratis)**, guarda `respuesta` + crea `sesion`. Sin IA.
2. Cierra sesión → **la app actualiza `alumno_nodo`** con la regla determinística (ver `2026-06-28-evaluacion-y-dominio-de-nodos.md`). Sin IA, gratis. El mapa cambia de color acá.
3. En paralelo, el front llama a la Edge Function `evaluar-sesion` con la `sesion`.
4. La Edge Function: carga `sol_materia` (perfil) + plantillas (`evaluar-sesion`, `tono-sol`) → tool `leer_respuestas(sesion)` → corre Messages API → devuelve el **diagnóstico estructurado** (`resumen`, `errores[]`, `a_reforzar[]`) → tool `escribir_evaluacion` → `evaluacion_sesion`.
5. Front: mensaje cálido al chico (tono SOL) + la seño ve el análisis cualitativo en su panel.

Costo: **1 llamada Haiku por sesión** (solo el diagnóstico; el estado del nodo no cuesta nada). Tope en código.

## Regla de dominio del nodo (resuelta — ver 2026-06-28-evaluacion-y-dominio-de-nodos.md)

La regla de dominio quedó **definida y cerrada** en `2026-06-28-evaluacion-y-dominio-de-nodos.md` (resuelve OPEN-1). Resumen, para que este doc sea autocontenido:

- Es **determinística** y la calcula la **app**, no la IA.
- Mira una **ventana reciente** (últimos 8 del nodo), solo aciertos **al primer intento** (`correcta` Y `reintentos = 0`).
- `dominado` exige **cobertura**, no repetición: ≥6 de 8 al primer intento, **≥2 de tipo `producir`** y **≥1 `dificil`** entre ellos. (Esto es lo que mata el adivinar — no se domina solo con opción múltiple.)
- `a_reforzar` = 2 fallos seguidos o sesión <50%. Señal suave; **nunca** retrocede a `no_empezado`.
- La **docente puede fijar el estado a mano** (override).
- `alumno_nodo.puntaje` = % al primer intento ponderado por tipo y dificultad → pinta el gradiente del mapa.

> Requiere `ejercicio.tipo` (ver Modelo de datos) y que el pool genere ejercicios de varios tipos y dificultades.

## Seam para nodos editables (dejar listo, NO construir)

Mañana SOL ajusta nodos según evidencia agregada (muchos chicos tropiezan en el mismo nodo → dividirlo, reordenar, agregar prerrequisito). Lo que se deja preparado **ahora**:
- `nodo.actualizado_at` + `nodo.version` para auditar cambios.
- tool `editar_nodo` **definida pero detrás del OK de la seño** (gate).
- Regla dura: **editar un nodo nunca resetea** el progreso del chico (`alumno_nodo`), salvo decisión explícita.
- `evaluacion_sesion.a_reforzar` ya es la señal agregable que alimentará al editor.

## Descomposición en sub-proyectos (slices verticales)

Esto es grande → se rompe. Cada SP termina en algo demostrable y lleva sus tests (regla del proyecto). Cada uno tendrá su propio ciclo spec → plan → build.

| SP | Qué | Demo |
|---|---|---|
| **SP-1** | Edge Function SOL base (Messages API + tool use + 1 tool de prueba contra Supabase). | la función lee un nodo y responde algo de Claude. |
| **SP-2** | Autoría docente: la seño sube contenido → `sol_materia` + nodos generados; los revisa/publica. | la seño sube un plan → salen nodos revisables. |
| **SP-3** | Multi-materia en el front (Next.js): cards/botones por materia = SOL especialista. | el chico elige materia y practica. |
| **SP-4** | Evaluador por sesión: regla determinística que actualiza `alumno_nodo` (2026-06-28-evaluacion-y-dominio-de-nodos.md) + diagnóstico IA (`evaluacion_sesion`) + panel de la seño. | chico practica → el mapa cambia (regla) + la seño ve el análisis (IA). |
| **SP-5** *(futuro)* | Nodos editables. | — |

## Costos, modelos y riesgos

**Modelos** (US$/MTok, caché 2026-06; vía Messages API):
- `claude-opus-4-8` — $5/$25. El más capaz (default del proyecto). Usar en división/especialización si la calidad lo pide.
- `claude-sonnet-4-6` — $3/$15. Recomendado para división + especialización (corren raro; calidad/costo OK).
- `claude-haiku-4-5` — $1/$5. Evaluador por sesión (corre seguido, barato).

**Estimación gruesa:** eval en Haiku ≈ unos miles de tokens → ~US$0.003/sesión. 30 chicos × 1 sesión/día ≈ **< US$0.20/día**. División/especialización = one-time por materia. **Sin host nuevo** (corre en Edge Functions, plan Supabase que ya se paga).

**Topes:** `max_tokens` por llamada + modelo barato para lo frecuente + límite mensual de gasto → cumple Rule 4.

**Riesgos:**
- **Datos de menores:** las Edge Functions de SOL usan `service_role` → **bypassan RLS**. Crítico: scopear cada tool por alumno/sesión, salida estructurada sin PII, key server-side (ADR-005). Prever borrado/export por alumno.
- **Latencia del diagnóstico:** la evaluación IA corre al cerrar sesión; el estado del nodo ya se actualizó antes (regla, instantánea), así que el mapa no espera a la IA. Mostrar "SOL está mirando tu práctica…" para el diagnóstico. La eval por lote (1 llamada Haiku) entra cómoda en el límite de tiempo de las Edge Functions; vigilar si crece.
- **Pérdida de comodidades del SDK:** subagents/skills/hooks se reimplementan a mano (loop chico, plantillas, tope en código). Aceptable al arranque; si pesa, migrar a Agent SDK (host propio o función Node de Vercel) o Managed Agents.

## Preguntas — estado

- **OPEN-F2-1 (resuelta):** la **seño** sube el plan (autoría docente). → D6. Define SP-2.
- **OPEN-F2-2 (resuelta):** motor = **Messages API desde Edge Functions** (sin servidor nuevo). → D1.
- **OPEN-F2-3 (resuelta):** la seño sube el contenido en **PDF**; Claude lo lee directo. → D8.
- **OPEN-1 (resuelta):** regla de dominio del nodo → definida en `2026-06-28-evaluacion-y-dominio-de-nodos.md`. Determinística, calculada por la app, exige cobertura por formato (`producir`) y dificultad. La IA **no** decide el estado. *(Los números exactos siguen a validar con la docente, pero la decisión de diseño está cerrada.)*