# SOL Fase 2 — Diseño (especialista por materia + evaluación por sesión)

> Spec de diseño (planteo). Define QUÉ construir y por qué. No es plan de ejecución.
> Fecha: 2026-06-27. Estado: **propuesta, fuera del MVP (Fase 2)**.
> Documentos relacionados: [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`DATA_MODEL.md`](../../DATA_MODEL.md), [`DECISIONS.md`](../../DECISIONS.md), [`Agents-sdk.md`](../../Agents-sdk.md).

## Resumen

Cada materia tiene su **SOL especialista**: la seño sube el contenido de la materia, SOL lo entiende, se especializa en eso y solo eso, divide el contenido en **nodos**, y los alumnos avanzan por esos nodos. Al cerrar cada sesión de práctica, SOL **evalúa al chico por lote** (dónde falla, qué errores repite, qué reforzar) y mueve el estado del nodo del alumno. Queda preparado (sin construir) para que más adelante SOL **edite los nodos** según la evidencia.

Respeta el espíritu de **ADR-002** (la app sigue corrigiendo cada respuesta; SOL no corrige por click) y agrega una capa de evaluación cualitativa de costo controlado.

### Nota sobre el motor (Agent SDK vs Messages API)

El pedido original fue usar el **Agent SDK de Anthropic**. Se evaluó: el Agent SDK necesita un runtime Node/Python persistente y **no corre dentro de las Edge Functions de Supabase** (Deno). Dado que el stack es Supabase + Vercel y el equipo es chico, se eligió arrancar con la **Messages API de Claude llamada desde Edge Functions** (cero servidor nuevo, lo más barato, respeta "diseñar lo justo"). Se conservan los **conceptos** del diseño agente (especialista por materia, trabajos separados, método reusable, tools, salida estructurada), traducidos a Messages API. El **Agent SDK en host propio** o **Managed Agents** (Anthropic hostea el loop) quedan como camino de upgrade si en el futuro se necesitan subagents/skills/hooks nativos.

## Decisiones tomadas (locks)

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Motor: Messages API de Claude desde Edge Functions de Supabase.** Sin servidor nuevo. | Todo el stack ya vive en Supabase; equipo chico; lo más barato y menos ops. |
| D2 | **Evaluación por sesión (lote), no por click.** | Mantiene ADR-002 y el tope de costo (1 llamada por sesión, no 10). |
| D3 | **Especialización generada y guardada al subir el contenido.** SOL se especializa + divide en nodos de una vez; ambos quedan guardados; **la seño revisa antes de publicar**. | Barato (corre una vez por plan), versionable, controlable. |
| D4 | **SOL trabaja solo con los nodos guardados** durante las sesiones. No re-aprende todo cada vez. | Costo y previsibilidad. |
| D5 | **Trabajos separados** (dividir, evaluar) + **plantillas de método reusables** entre materias. | Separa el QUÉ (contenido por materia) del CÓMO (método compartido). |
| D6 | **La seño es quien sube el plan** (herramienta de autoría docente). | Resuelve OPEN-F2-1. Es Fase 2 según CLAUDE.md. |
| D7 | **Groundwork de nodos editables: dejar el seam, no construirlo.** | Es Fase 2.x; sin datos reales de uso sería sobrediseñar. |
| D8 | **La seño sube el contenido en PDF.** Claude lee el PDF directo (sin OCR aparte). | Resuelve OPEN-F2-3. La Messages API soporta PDF nativo. |

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

Durante la práctica **no se llama a Claude**: el chico responde opción múltiple del pool y la app corrige. SOL aparece solo en dos momentos:
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

### Nueva tabla `evaluacion_sesion` — la salida del evaluador
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| sesion_id | uuid | FK → sesion |
| resumen | text | para la seño y el chico |
| errores | jsonb | patrones detectados (ej: "confunde b/d") |
| a_reforzar | jsonb | nodos/temas a reforzar (señal para el editor futuro) |
| created_at | timestamp | |

`materia` / `nodo` / `alumno_nodo` ya soportan N materias (solo agregar filas + RLS).

## Trabajos de SOL (jobs)

| Trabajo | Cuándo | Tools | Método (plantilla) | Modelo |
|---|---|---|---|---|
| `dividir-nodos` | al subir el plan (1×) | `leer_programa`, `escribir_nodos` | `dividir-en-nodos` | `claude-sonnet-4-6` (Opus si el plan es difícil) |
| `evaluar-sesion` | al cerrar sesión | `leer_respuestas`, `escribir_evaluacion`, `mover_alumno_nodo` | `evaluar-sesion`, `tono-sol` | `claude-haiku-4-5` (corre seguido) |
| `editar-nodos` *(futuro)* | seña pide / evidencia | `editar_nodo` (con OK seño) | `dividir-en-nodos` | — |

Cada trabajo = una Edge Function (o un handler) que arma el prompt con el perfil de la materia + la plantilla de método, corre un loop chico de tool use contra la Messages API, y escribe el resultado en Supabase. `generador-ejercicios` queda como está hoy (ya anda, barato).

**Entrada de `dividir-nodos`:** la seño sube el contenido en **PDF** (D8). La Edge Function manda el PDF directo a Claude (document block base64, o vía Files API si es grande) — Claude lo lee sin pipeline de OCR aparte. PDF con texto nativo trocea mejor que foto escaneada; límite ~32MB/600 pág (un plan entra cómodo). De ahí salen `sol_materia` (perfil) + los `nodo`, que la seño revisa antes de publicar.

## Método reusable (plantillas de prompt)

Arrancar con cuatro bloques de instrucciones, guardados y versionados, inyectables en el `system_prompt` de cada trabajo:
- `dividir-en-nodos` — granularidad, orden, prerrequisitos de un buen mapa de nodos.
- `evaluar-sesion` — leer respuestas → detectar patrones de error → mapear a estado de nodo.
- `tono-sol` — voz rioplatense, alienta, nunca castiga (convención de CLAUDE.md).
- `ejemplos-de-zona` — usar `escuela.zona` para contextualizar.

Son materia-agnósticos: los comparten todas las materias y trabajos. (Si más adelante se migra al Agent SDK, estos bloques se convierten naturalmente en *skills* del SDK.)

## Tools (las manos sobre Supabase)

Pocas, parejas a la DB: `leer_programa`, `escribir_nodos`, `leer_respuestas(sesion)`, `escribir_evaluacion`, `mover_alumno_nodo`, y *(futuro)* `editar_nodo`. Se implementan como **tool use** en el loop manual de la Edge Function (cada tool = una función que pega a Supabase con `service_role`). Cada tool **scopeada por alumno/sesión**.

## Guardarraíles y salida limpia

- **Tope de costo:** se controla **en código** — límite de `max_tokens` por llamada, modelo barato (Haiku) para lo frecuente, y un contador/límite mensual de gasto. Cumple Rule 4. (Si se migra al Agent SDK, esto pasa a ser `max_budget_usd` built-in.)
- **Menores:** el `evaluar-sesion` devuelve **salida estructurada** (`output_config.format` json_schema) que calza exacto con `evaluacion_sesion` → nunca texto libre suelto, no se cuelan datos personales. El schema es el contrato.
- **Tono:** validación liviana del mensaje al chico *(pulido, no bloqueante al inicio)*.

## Flujo de evaluación por sesión (paso a paso)

1. Chico practica: la app sirve ejercicios del pool, **corrige cada click (gratis)**, guarda `respuesta` + crea `sesion`. Sin IA.
2. Cierra sesión → el front llama a la Edge Function `evaluar-sesion` con la `sesion`.
3. La Edge Function: carga `sol_materia` (perfil) + plantillas (`evaluar-sesion`, `tono-sol`) → tool `leer_respuestas(sesion)` → corre Messages API → devuelve **salida estructurada** (json_schema: `resumen`, `errores[]`, `a_reforzar[]`, `estado_nodo_sugerido`).
4. tool `escribir_evaluacion` → `evaluacion_sesion`. tool `mover_alumno_nodo` → `alumno_nodo` (regla de dominio, OPEN-1).
5. Front: mensaje cálido al chico (tono SOL) + la seño ve el análisis en su panel.

Costo: **1 llamada Haiku por sesión**. Tope en código.

## Regla de dominio del nodo (propuesta, validar con la seño)

El evaluador necesita una regla para mover `alumno_nodo` (OPEN-1). Propuesta default, simple y en tono SOL (festeja la racha, no castiga) — **a validar con la docente antes de SP-4**:

- `no_empezado` → `en_construcción`: al primer ejercicio del nodo.
- → `dominado`: **5 de las últimas 6** respuestas del nodo correctas **al primer intento**, incluyendo **≥2 de dificultad alta**.
- → `a_reforzar`: 2 fallos seguidos en el nodo **o** sesión del nodo con <50% de aciertos. Señal suave, no castigo; vuelve a `en_construcción` al recuperarse.
- **Nunca** retrocede a `no_empezado`.
- `alumno_nodo.puntaje` = % de aciertos al primer intento, ponderado por dificultad → pinta el color/gradiente del mapa.

Alternativa más simple (si la seño prefiere): solo umbral — `dominado` = ≥80% de aciertos en los últimos N ejercicios, sin racha ni peso por dificultad.

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
| **SP-4** | Evaluador por sesión (`evaluacion_sesion` + mover `alumno_nodo` + panel de la seño). | chico practica → SOL evalúa → el mapa cambia + la seño ve el análisis. |
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
- **Latencia:** la evaluación corre al cerrar sesión; mostrar "SOL está mirando tu práctica…" para que no bloquee al chico. Edge Functions tienen límite de tiempo de ejecución — la eval por lote (1 llamada Haiku) entra cómoda; vigilar si crece.
- **Pérdida de comodidades del SDK:** subagents/skills/hooks se reimplementan a mano (loop chico, plantillas, tope en código). Aceptable al arranque; si pesa, migrar a Agent SDK (host propio) o Managed Agents.
- **OPEN-1 (regla de "dominio" del nodo) sigue abierta** — el evaluador la necesita para mover `alumno_nodo`. Definir con la seño antes de SP-4.

## Preguntas — estado

- **OPEN-F2-1 (resuelta):** la **seño** sube el plan (autoría docente). → D6. Define SP-2.
- **OPEN-F2-2 (resuelta):** motor = **Messages API desde Edge Functions** (sin servidor nuevo). → D1.
- **OPEN-F2-3 (resuelta):** la seño sube el contenido en **PDF**; Claude lo lee directo. → D8.
- **OPEN-1 (propuesta, validar con la seño):** regla de dominio del nodo — ver sección "Regla de dominio del nodo". Default propuesto (racha 5/6 al 1er intento + ≥2 difíciles); alternativa simple por umbral. **Confirmar con la docente antes de SP-4** (y Etapa 3 del MVP).
