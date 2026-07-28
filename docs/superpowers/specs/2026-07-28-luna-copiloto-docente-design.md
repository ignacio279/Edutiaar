# Diseño — LUNA, copiloto de la docente (dashboard + boletines + chat 24/7)

> Fecha: 2026-07-28 · Etapa: Fase 2 (primer copiloto docente).
> Estado: implementado.

## Problema

La docente ve el recorrido de cada chico en su panel, pero nadie mira **el aula
entera** por ella: quién se está quedando, quién esquiva un tipo de ejercicio,
quién va adelantado. Tampoco tiene ayuda para las tareas de escritura que le
comen horas (boletines para las familias) ni un lugar donde consultar dudas
pedagógicas con el contexto real de SU aula (plurigrado, zona rural).

## Objetivo

LUNA: un copiloto que lee la actividad de SOL de toda el aula y (1) muestra
métricas y alertas priorizadas, (2) redacta borradores de boletín anclados en
evidencia, (3) responde consultas pedagógicas 24/7 con el contexto del aula.
Principio rector no negociable: **LUNA propone, la maestra decide** — todo lo
generado nace en `borrador` y requiere aprobación explícita.

## Decisiones (validadas con el usuario)

- **Período del boletín: mensual** (clave `'2026-07'`). "Pendiente" = alumno sin
  boletín aprobado del mes en curso.
- **Boletín aprobado se puede corregir**: "Corregir" lo vuelve a borrador y sube
  `version`; re-aprobación requerida. Un boletín por (alumno, período).
- **Chat: hilo único continuo** por docente, persistido en DB, con "Limpiar
  conversación" (delete RLS de sus mensajes).
- **Modelo: `claude-sonnet-4-6`** para boletín y chat (pocas docentes, calidad
  pedagógica manda; constante de una línea por función).
- **Alertas solo informativas**: calculadas on-demand al cargar el dashboard,
  sin persistencia ni estado visto/resuelto (eso llega con el job nocturno).
- **Tope suave diario** (Regla 4): 50 mensajes de chat y 20 generaciones de
  boletín por docente/día (tabla `luna_uso`, solo service_role — inmune a
  "Limpiar conversación").
- **Seed plurigrado**: `seed-actividad.mjs` reparte los alumnos semilla en
  grados 1/3/5 y crea los programas de Lengua 1° y 5°, para demostrar el picker
  de grados y la planificación multi-nivel de punta a punta.

## Arquitectura

```
/docente/luna (dashboard)          /docente/luna/boletin           /docente/luna/chat
   │  queries RLS (browser)           │  invoke('luna-boletin')       │  invoke('luna-chat')
   ▼                                  ▼                               ▼
web/lib/luna.ts (análisis PURO)    Edge Fn luna-boletin            Edge Fn luna-chat
  alertas + métricas + resumen        service_role + recheck          service_role + recheck
  (client-side, RLS ya scope-a)       es_mi_alumno → Claude           rol docente → Claude
                                      (sonnet, tool forzada)          (sonnet, historial en DB)
```

### 1. Migración `0016_luna.sql`

`boletin` (alumno, docente, periodo, contenido jsonb por secciones, estado
borrador/aprobado, aprobado_por/at, version, unique (alumno, periodo)),
`luna_mensaje` (hilo del chat por docente) y `luna_uso` (contadores diarios,
sin policies = solo service_role). RLS: la docente lee/edita SOLO lo suyo
(`docente_id = auth.uid()`); los INSERT los hacen las Edge Functions.

### 2. Servicio de análisis `web/lib/luna.ts` (puro)

Detectores por alumno (umbral documentado en el código): inactividad (5/10
días → media/alta; nunca practicó → info honesta), caída de precisión por nodo
(últimos 7 días vs 14 previos, ambas ventanas con muestra mínima, caída ≥25
pts → alta), evitación de tipo `producir` (≥12 respuestas en 14 días y 0 de
ese tipo → media), adelantado (>50% dominado sin a_reforzar → info positiva).
`metricasAula`, `resumenAula`, `periodoActual` (convención mensual). Todo toma
`now: Date` por parámetro y con aula vacía devuelve vacío — nunca inventa.
Desacoplado a propósito: puede moverse a un job nocturno sin reescribir.

### 3. Edge Function `luna-boletin` (service_role, verify_jwt)

`POST { alumno_id, periodo? }`. Verifica rol docente + `es_mi_alumno`
(alumno_ajeno 403), tope diario, key ANTES de escribir, junta la evidencia del
mes (sesiones, respuestas por tema/tipo, evolución 1ª vs 2ª quincena, racha) y
llama a Claude con tool forzada `escribir_boletin` (patrón evaluar-sesion).
El prompt exige NO inventar nada que no esté en los datos y anclar cada
afirmación en un dato provisto. Sin actividad en el período → 409
`sin_actividad` (sin llamar a Claude). A la API van solo nombre de pila, grado
y desempeño (datos mínimos).

### 4. Edge Function `luna-chat` (service_role, verify_jwt)

`POST { mensaje, alertas? }`. Verifica rol docente + tope diario. Arma el
system prompt con el contexto real del aula (una línea por alumno: nombre de
pila, grado, estado, última práctica, precisión reciente; alertas activas;
programa por materia; momento del año) e instrucción plurigrado: UN eje común
con niveles por grado presente. Historial: últimos 12 mensajes de
`luna_mensaje`; el par pregunta/respuesta se persiste junto tras el éxito
(si Claude falla no se guarda nada → reintento seguro).

### 5. Front

- `web/components/DocenteSidebar.tsx`: entrada LUNA (ícono `moon` en `art.ts`).
- `/docente/luna`: métricas, dos acciones grandes (boletín / chat), alertas
  priorizadas (alta violeta, media celeste, info verde — nunca rojo), resumen.
- `/docente/luna/boletin`: wizard grado → alumno → generando → revisión
  (Editar inline / Aprobar / Regenerar / Corregir). Errores con copy cálido y
  Reintentar; nunca pantalla colgada.
- `/docente/luna/chat`: espejo del chat de practicar (append optimista con
  devolución si falla, timeout 30s, auto-scroll, Limpiar conversación).

## Seguridad (datos de menores)

- Scoping estricto: el dashboard usa queries del browser que la RLS existente
  (`es_mi_alumno` / `docente_id = auth.uid()`) ya limita al aula de la docente
  autenticada; las Edge Functions usan service_role pero re-verifican rol y
  pertenencia a mano (Regla 5).
- A la API de Claude van solo nombre de pila, grado y datos de desempeño.
  Nada de PINs, emails, avatares ni identificadores.
- API key solo server-side (Regla 1); tope diario propio + tope de gasto en
  consola (Regla 4).

## Tests

- `tests/unit/luna.test.mjs` — detectores (disparan/callan), orden, métricas,
  período mensual, resumen, aula vacía.
- `tests/unit/luna-boletin.test.mjs` — prompt (no-invención, anclaje en
  evidencia, dirigido a la familia), `resumirActividad`, `parseBoletin` nunca
  tira, `periodoActual` duplicado coincide con el del lib.
- `tests/unit/luna-chat.test.mjs` — system (plurigrado, no-invención, aula
  vacía, líneas de alumnos), recorte de historial, roles, `aParrafos`.
- `tests/unit/art.test.mjs` — ícono `moon`.
- `tests/integration/luna-rls.test.mjs` — scoping entre docentes y contra
  alumnos, ciclo borrador→aprobado→corregir→re-aprobar, limpieza del chat.

## Fuera de alcance (YAGNI)

- Entrega de boletines a las familias (TERRA, fase futura). El aprobado queda
  consultable y marcado listo para entrega.
- Job nocturno de análisis / alertas persistidas con estado visto.
- Múltiples conversaciones de chat, historial de versiones del boletín.
- Streaming de respuestas (el repo entero es request/response JSON).
