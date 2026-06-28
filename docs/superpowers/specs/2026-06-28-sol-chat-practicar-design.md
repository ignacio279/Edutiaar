# Diseño — Chat con SOL en practicar (mock)

> Fecha: 2026-06-28 · Etapa: Fase 2 (SOL conversacional, dentro del alcance MVP)
> Estado: aprobado, listo para plan de implementación.

## Problema

Hoy "Practicar" solo sirve ejercicios de opción múltiple (corrige local contra
`ejercicio.correcta`). El alumno no puede **mandarle mensajes a SOL**: ni pedir
ayuda cuando se traba, ni preguntarle algo del tema. El MVP incluye "SOL
conversacional vía API de Claude", así que esto está en alcance.

## Objetivo

Que el chico, **dentro de la pantalla de practicar**, pueda:
1. **Pedir ayuda** sobre el ejercicio actual (pista / explicación).
2. **Chatear libre** con SOL sobre el tema del nodo.

Todo **demoable ya en modo mock** (no hay API key con billing todavía), y que
pase a Claude real quitando el flag cuando llegue la key.

## Decisiones tomadas (brainstorming)

- **Tipo:** combo — ayuda contextual en el ejercicio + chat libre.
- **Modo:** construir con flag `mock` (igual que el resto del proyecto).
- **Ubicación:** solo dentro de `practicar` (chat embebido + botón "Pedir ayuda a SOL"). Nada de chat fuera de practicar.
- **Persistencia:** efímera (en memoria del componente). No se guardan mensajes de menores (Regla 5). Sin migración.
- **SOL y la respuesta:** SOL **nunca** dice la opción correcta. Da pistas y explica; la app ya revela la respuesta sola tras 2 intentos. Mantiene "SOL no corrige".

## Arquitectura

Slice vertical: Edge Function nueva + lógica pura testeable + UI embebida.

```
practicar/page.tsx ──(invoke 'sol-chat', { mensajes, contexto, mock })──▶ Edge Function sol-chat
        │                                                                        │
        │ usa web/lib/chat.ts (puro)                                  mock ──▶ mockRespuesta() (de la lib)
        │  recortarHistorial / aMensajesClaude                        real ──▶ 1 llamada Messages API (haiku)
        │  construirSystem / mockRespuesta                                   (key SOLO server-side, Regla 1)
        ▼
   chat efímero en estado del componente
```

### 1. Edge Function `supabase/functions/sol-chat/index.ts`

- **Input (body):**
  ```ts
  {
    mensajes: { role: 'user' | 'sol'; content: string }[],
    contexto: {
      materia: string,
      nodoNombre: string,
      ejercicio?: { enunciado: string; opciones: string[]; correcta: string }
    },
    mock?: boolean
  }
  ```
- Se le pasa `correcta` al backend para que las pistas sean correctas, pero el
  system prompt prohíbe fuerte revelarla. `correcta` **nunca** sale al front en la respuesta.
- **Modo real:** una sola llamada a la Messages API (sin `runToolLoop`: el
  contexto va inline, el chat no necesita leer la DB). Modelo `claude-haiku-4-5`,
  `max_tokens ≈ 400`, historial recortado. La API key vive solo acá (Regla 1).
  Tope de costo por `max_tokens` + modelo barato (Regla 4).
- **Modo mock:** llama `mockRespuesta()` de `web/lib/chat.ts` y devuelve texto
  templado. Es el default mientras no haya API key.
- **Output:** `{ texto: string, mock?: boolean }`. Errores con `json({ error }, code)`
  como las otras funciones.
- CORS y helper `json` compartidos (`_shared/cors.ts`), igual que `sol`.

### 2. Lógica pura `web/lib/chat.ts` (sin DOM, testeable con `node --test`)

- `type ChatMsg = { role: 'user' | 'sol'; content: string }`
- `recortarHistorial(msgs: ChatMsg[], max = 8): ChatMsg[]` — últimos `max` (guardarraíl de costo, Regla 4).
- `aMensajesClaude(msgs: ChatMsg[]): { role: 'user'|'assistant'; content: string }[]` — mapea `'sol' → 'assistant'`.
- `construirSystem(contexto): string` — persona de SOL + guardrails (ver §4) + ejercicio actual cuando hay.
- `mockRespuesta(ultimo: string, contexto, esAyuda: boolean): string` — pista que
  referencia el `enunciado` (modo ayuda) o respuesta cálida del tema (modo libre).
  **Invariante: nunca incluye el texto de `contexto.ejercicio.correcta`.** Determinista
  (sin random) para ser testeable.

El system prompt y el mock viven en la lib (puros) y la Edge Function los importa,
así se testean desde Node sin red ni API key (mismo patrón que `_shared/loop.ts`).

### 3. Front — `web/app/alumno/[programaId]/practicar/page.tsx`

- Estado nuevo (efímero): `chatAbierto`, `chatMsgs: ChatMsg[]`, `chatCargando`, `input`.
- **Botón "Pedir ayuda a SOL"** junto al ejercicio: abre el chat y siembra un
  pedido de ayuda con el contexto del ejercicio actual (`esAyuda = true`), luego invoca la función.
- **Panel de chat plegable:** lista scrolleable de mensajes (avatar de SOL vía
  `art.sol()`), input de texto + botón enviar. Vive mientras dura la sesión de
  practicar (lifetime del componente). "Pedir ayuda" siempre pasa el ejercicio actual.
- **Cap de mensajes por sesión** (~20 del alumno): al llegar, SOL avisa suave y se
  deshabilita el input. Guardarraíl de costo en el cliente.
- Llamada: `supabase.functions.invoke('sol-chat', { body: { mensajes: recortados, contexto, mock: true } })`.
- Tono UI: cálido, simple, español rioplatense (Convenciones). Nunca "pa'".

### 4. Guardrails (chicos de 6 a 13) — en `construirSystem`

- Cálido, festeja aciertos, **nunca castiga** errores.
- Español rioplatense, simple. **Nunca "pa'"**, siempre "para" completo.
- Se queda en el **tema del nodo / materia**; si el chico se va de tema, redirige suave.
- **Nunca dice la opción correcta** — da pistas y explica el porqué.
- No pide datos personales (Regla 5).
- Costo (Regla 4): `claude-haiku-4-5` + `max_tokens` bajo + historial recortado +
  cap de mensajes en el front + mock por default.

### 5. Tests (obligatorio antes de commitear)

- **Unit** `tests/unit/chat.test.mjs` (`npm test`, Node nativo):
  - `recortarHistorial` respeta el tope y conserva el orden / los últimos.
  - `aMensajesClaude` mapea `'sol' → 'assistant'` y deja `'user'` igual.
  - `mockRespuesta` modo ayuda referencia el `enunciado`.
  - `mockRespuesta` modo libre responde algo coherente.
  - **`mockRespuesta` jamás incluye `correcta`** (invariante de seguridad pedagógica).
- **Edge Function:** smoke manual en mock (no necesita key). Real cuando llegue la key.

## Fuera de alcance (YAGNI)

- Persistencia en DB del chat / que la seño vea las conversaciones.
- Chat fuera de practicar (burbuja global, pestaña dedicada).
- Tools de búsqueda (leer nodos hermanos / programa entero) — el contexto va inline.
- Voz, multilingüe, offline.

## Riesgos / notas

- Mandar `correcta` al backend: mitigado por system prompt fuerte + el invariante
  del mock + que `correcta` nunca vuelve al front. Cuando haya Claude real, validar
  en smoke que no la filtra.
- Costo en modo real: acotado por modelo barato, `max_tokens`, recorte de historial
  y cap de mensajes. Revisar tope de uso de la API antes de quitar el flag.
