# SOL Fase 2 — Diseño con el Agent SDK de Anthropic

> Spec de diseño (planteo). Define QUÉ construir y por qué. No es plan de ejecución.
> Fecha: 2026-06-27. Estado: **propuesta, fuera del MVP (Fase 2)**.
> Documentos relacionados: [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`DATA_MODEL.md`](../../DATA_MODEL.md), [`DECISIONS.md`](../../DECISIONS.md), [`Agents-sdk.md`](../../Agents-sdk.md).

## Resumen

SOL pasa de "Claude llamado desde una Edge Function" a un **agente real** construido con el **Agent SDK de Anthropic**, corriendo en un host propio. Cada materia tiene su **SOL especialista**: se sube el contenido de la materia, SOL lo entiende, se especializa en eso y solo eso, divide el contenido en **nodos**, y los alumnos avanzan por esos nodos. Al cerrar cada sesión de práctica, SOL **evalúa al chico por lote** (dónde falla, qué errores repite, qué reforzar) y mueve el estado del nodo del alumno. Queda preparado (sin construir) para que más adelante SOL **edite los nodos** según la evidencia.

Esto **respeta el espíritu de ADR-002** (la app sigue corrigiendo cada respuesta; SOL no corrige por click) y agrega una capa de evaluación cualitativa de costo controlado.

## Decisiones tomadas (locks)

| # | Decisión | Por qué |
|---|---|---|
| D1 | **Motor: Agent SDK en host propio** (servicio `sol-engine`, Python). | El pedido literal: SOL como agente con subagents por materia y tools. Convive con lo de hoy, no lo reemplaza. |
| D2 | **Evaluación por sesión (lote), no por click.** | Mantiene ADR-002 y el tope de costo (1 llamada por sesión, no 10). |
| D3 | **Especialización generada y guardada al subir el contenido.** SOL se especializa + divide en nodos de una vez; ambos quedan guardados; la seño revisa antes de publicar. | Barato (corre una vez por plan), versionable, controlable. |
| D4 | **SOL trabaja solo con los nodos guardados** durante las sesiones. No re-aprende todo cada vez. | Costo y previsibilidad. |
| D5 | **Subagents por TRABAJO (no por materia)** + **skills** para el método pedagógico (reusable entre materias). | Separa el QUÉ (contenido por materia) del CÓMO (método compartido). |
| D6 | **Groundwork de nodos editables: dejar el seam, no construirlo.** | Es Fase 2.x; sin datos reales de uso sería sobrediseñar. |

## Capas conceptuales (modelo ordenador)

- **Skill = el MÉTODO** (cómo enseñar/evaluar; materia-agnóstico, reusable).
- **Perfil de materia (`sol_materia`) = el QUÉ** (el contenido, generado del plan).
- **Subagent = el TRABAJO** (dividir, evaluar, en el futuro editar).
- **Tool = las MANOS** (leer/escribir Supabase).
- **Hook / `max_budget_usd` = los guardarraíles** (costo, menores).

Cuando entra una materia nueva, **hereda el método** (skills); solo cambia el perfil. No se reescribe nada.

## Arquitectura

```
[Vercel front]
     │ (HTTPS)
     ▼
[Supabase]  ──Edge Functions──►  cosas baratas / per-click
     │        (pool de ejercicios, login, corrección)
     │
     │  ◄──MCP / service_role──►  [sol-engine  (Agent SDK, Python)]
                                    · especializar materia (subir contenido)
                                    · dividir en nodos
                                    · evaluar sesión
                                    · (futuro) editar nodos
```

- El front **nunca** llama a sol-engine directo: pasa por Edge Function o por un endpoint con auth. La API key de Claude vive en sol-engine (server). Respeta **ADR-005**.
- sol-engine lee/escribe Supabase vía **MCP de Supabase** (o `service_role`).
- Las Edge Functions siguen con lo per-click barato. sol-engine solo corre en los **bordes** (subir contenido / cerrar sesión), nunca durante cada click.

### "1 SOL por materia" = sesión especializada (no chat caro permanente)

Durante la práctica **no corre ningún agente**: el chico responde opción múltiple del pool y la app corrige. El agente SOL aparece solo en dos momentos:
- **Al subir contenido** (una vez): se especializa + divide en nodos.
- **Al cerrar sesión** (una vez): evalúa.

El botón "Mate" abre la práctica de esa materia; el SOL de Mate = perfil + skills + subagents scopeados a esa materia. Implementación recomendada: arrancar un cliente del SDK con `system_prompt = SOL base + perfil_materia` y el set de tools/skills correspondiente (más simple que pre-registrar N subagents formales; resultado visible idéntico).

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

## Subagents (por TRABAJO)

| Subagent | Cuándo | Tools | Skills | Modelo |
|---|---|---|---|---|
| `divisor-nodos` | al subir el plan (1×) | `leer_programa`, `escribir_nodos` | `dividir-en-nodos` | `claude-sonnet-4-6` (Opus si el plan es difícil) |
| `evaluador-sesion` | al cerrar sesión | `leer_respuestas`, `escribir_evaluacion`, `mover_alumno_nodo` | `evaluar-sesion`, `tono-sol` | `claude-haiku-4-5` (corre seguido) |
| `editor-nodos` *(futuro)* | seña pide / evidencia | `editar_nodo` (con OK seño) | `dividir-en-nodos` | — |

Cada materia usa los **mismos** subagents con su perfil inyectado. `generador-ejercicios` queda en la Edge Function de hoy (ya anda, barato); moverlo a sol-engine es opcional futuro.

## Skills (el método, reusable)

Arrancar con cuatro, en formato `SKILL.md` (carga on-demand):
- `dividir-en-nodos` — granularidad, orden, prerrequisitos de un buen mapa de nodos.
- `evaluar-sesion` — leer respuestas → detectar patrones de error → mapear a estado de nodo.
- `tono-sol` — voz rioplatense, alienta, nunca castiga (convención de CLAUDE.md).
- `ejemplos-de-zona` — usar `escuela.zona` para contextualizar.

Ventaja sobre meterlo en el system_prompt: cargan on-demand (menos tokens), las comparten todas las materias y subagents, y el equipo/seño las mejora sin tocar código.

## Tools (las manos sobre Supabase)

Pocas, parejas a la DB: `leer_programa`, `escribir_nodos`, `leer_respuestas(sesion)`, `escribir_evaluacion`, `mover_alumno_nodo`, y *(futuro)* `editar_nodo`. Vía MCP de Supabase o `service_role`. Cada tool **scopeada por alumno/sesión**.

## Guardarraíles y salida limpia

- **Tope de costo:** `max_budget_usd` del SDK por corrida (built-in) → cumple Rule 4. Hook `PreToolUse` solo si después se quiere control fino.
- **Menores:** el `evaluador` devuelve **salida estructurada** (`output_format` json_schema) que calza exacto con `evaluacion_sesion` → nunca texto libre suelto, no se cuelan datos personales. El schema es el contrato.
- **Seguridad/tono:** hook `Stop` liviano que valida tono apropiado *(pulido, no bloqueante al inicio)*.

## Flujo de evaluación por sesión (paso a paso)

1. Chico practica: la app sirve ejercicios del pool, **corrige cada click (gratis)**, guarda `respuesta` + crea `sesion`. Sin IA.
2. Cierra sesión → Edge Function dispara a sol-engine: *"evaluá sesión X"*.
3. `evaluador-sesion` arranca: carga `sol_materia` (perfil) + skills (`evaluar-sesion`, `tono-sol`) → tool `leer_respuestas(sesion)` → razona patrones → devuelve **salida estructurada** (json_schema: `resumen`, `errores[]`, `a_reforzar[]`, `estado_nodo_sugerido`).
4. tool `escribir_evaluacion` → `evaluacion_sesion`. tool `mover_alumno_nodo` → `alumno_nodo` (regla de dominio, OPEN-1).
5. Front: mensaje cálido al chico (tono SOL) + la seño ve el análisis en su panel.

Costo: **1 corrida Haiku por sesión**. `max_budget_usd` como tope.

## Seam para nodos editables (dejar listo, NO construir)

Mañana SOL ajusta nodos según evidencia agregada (muchos chicos tropiezan en el mismo nodo → dividirlo, reordenar, agregar prerrequisito). Lo que se deja preparado **ahora**:
- `nodo.actualizado_at` + `nodo.version` para auditar cambios.
- tool `editar_nodo` **definida pero detrás del OK de la seño** (permission gate del SDK).
- Regla dura: **editar un nodo nunca resetea** el progreso del chico (`alumno_nodo`), salvo decisión explícita.
- `evaluacion_sesion.a_reforzar` ya es la señal agregable que alimentará al editor.

## Descomposición en sub-proyectos (slices verticales)

Esto es grande → se rompe. Cada SP termina en algo demostrable y lleva sus tests (regla del proyecto). Cada uno tendrá su propio ciclo spec → plan → build.

| SP | Qué | Demo |
|---|---|---|
| **SP-1** | Infra `sol-engine` (host + Agent SDK + MCP a Supabase + 1 tool de prueba). | sol-engine lee un nodo de Supabase. |
| **SP-2** | Especialización + división (subir contenido → `sol_materia` + nodos; seño revisa/publica). | subo un plan → salen nodos revisables. |
| **SP-3** | Multi-materia en el front (cards/botones por materia = SOL especialista). | el chico elige materia y practica. |
| **SP-4** | Evaluador por sesión (`evaluacion_sesion` + mover `alumno_nodo` + panel de la seño). | chico practica → SOL evalúa → el mapa cambia + la seño ve el análisis. |
| **SP-5** *(futuro)* | Nodos editables. | — |

## Costos, modelos y riesgos

**Modelos** (US$/MTok, caché 2026-06; aliases del SDK):
- `claude-opus-4-8` — $5/$25. El más capaz (default del proyecto). Usar en división/especialización si la calidad lo pide.
- `claude-sonnet-4-6` — $3/$15. Recomendado para división + especialización (corren raro; calidad/costo OK).
- `claude-haiku-4-5` — $1/$5. Evaluador por sesión (corre seguido, barato).

**Estimación gruesa:** eval en Haiku ≈ unos miles de tokens → ~US$0.003/sesión. 30 chicos × 1 sesión/día ≈ **< US$0.20/día**. + host chico ~US$5–10/mes. + división/especialización = one-time por materia.

**Topes:** `max_budget_usd` por corrida (built-in del SDK) + límite mensual de gasto → cumple Rule 4.

**Riesgos:**
- **Host nuevo = más ops y superficie.** Mitigación: empezar por SP-1 mínimo. Alternativa a evaluar a futuro: **Managed Agents** de Anthropic (Anthropic hostea el loop del agente; cero servidor propio que mantener). Anotado, no decidido acá.
- **Datos de menores:** sol-engine usa `service_role` → **bypassa RLS**. Crítico: scopear cada tool por alumno/sesión, salida estructurada sin PII, key server-side (ADR-005). Prever borrado/export por alumno.
- **Latencia:** la evaluación corre async al cerrar sesión; no bloquea al chico.
- **OPEN-1 (regla de "dominio" del nodo) sigue abierta** — el evaluador la necesita para mover `alumno_nodo`. Definir con la seño antes de SP-4.

## Preguntas abiertas para esta fase

- **OPEN-F2-1:** ¿Quién sube el plan de la materia en Fase 2 — la seño (herramienta de autoría) o el equipo? Define el alcance de SP-2 (la autoría docente es Fase 2 según CLAUDE.md).
- **OPEN-F2-2:** ¿Host propio (Railway/Fly/Render) vs Managed Agents? Decidir al arrancar SP-1.
- **OPEN-F2-3:** Formato exacto del contenido que se le pasa al `divisor-nodos` (relacionado con OPEN-2 del MVP).
- **OPEN-1 (heredada):** regla de dominio del nodo — bloquea SP-4.
