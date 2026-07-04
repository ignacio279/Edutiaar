# Decisiones técnicas (ADRs) — EDUTIA

> Un ADR registra una decisión, su contexto y sus consecuencias, para que más adelante nadie pregunte "¿quién decidió esto y por qué?".

## ADR-001 — Stack: Vercel + Supabase + Claude API
**Contexto:** el frontend ya existe como sitio estático; hace falta backend, base, login e IA, con poco presupuesto.
**Decisión:** front en Vercel; backend/base/auth/funciones en Supabase; SOL con la API de Claude desde Edge Functions.
**Consecuencias:** muy poca infraestructura para mantener; gratis para desarrollar. No sirve para procesos backend de larga duración (no se necesitan en el MVP).

## ADR-002 — SOL genera, la app corrige
**Contexto:** llamar a la IA por cada respuesta sería caro y frágil.
**Decisión:** Claude se usa solo para **generar** ejercicios y **dividir** el programa en nodos. La **corrección** (correcta/incorrecta, tiempo, reintentos, patrones) la hace la app contra `ejercicio.correcta`.
**Consecuencias:** costo de API mucho menor y predecible; la app funciona aunque la IA esté lenta; los ejercicios son de opción múltiple (no texto libre) en el MVP.

## ADR-003 — Pool de ejercicios
**Contexto:** generar un ejercicio nuevo por cada click multiplica el costo.
**Decisión:** generar ejercicios en lotes por nodo/nivel y guardarlos en `ejercicio`; servirlos desde ahí.
**Consecuencias:** menos llamadas a la API; hay que manejar cuándo regenerar el pool.

## ADR-004 — Separar nodo (plantilla) de alumno_nodo (estado)
**Contexto:** los nodos base son iguales por grado, pero el estado es único de cada chico.
**Decisión:** `nodo` guarda la plantilla (compartida); `alumno_nodo` guarda el estado por (alumno × nodo).
**Consecuencias:** modelo limpio y extensible; el mapa de cada chico se pinta desde `alumno_nodo`.

## ADR-005 — API key de Claude del lado del servidor
**Contexto:** una key en el navegador se puede robar.
**Decisión:** la key vive en la Edge Function de Supabase (variable de entorno); el front nunca la ve.
**Consecuencias:** seguro; toda llamada a Claude pasa por el servidor.

## ADR-006 — Frontend en Vercel
**Contexto:** se evaluó Netlify vs Vercel; el front no usa Next.js.
**Decisión:** Vercel (preferencia del equipo). El backend vive en Supabase igual, así que la elección del host del front no afecta la arquitectura de datos.
**Consecuencias:** deploy automático desde GitHub; ninguna dependencia fuerte con el host.

## ADR-007 — Login del alumno endurecido (aula + Edge Function + creds opacas)
**Contexto:** el login por avatar + PIN de 4 dígitos con `signInWithPassword` directo y email adivinable (`mateo@edutia.local`) es fuerza-bruteable (10.000 combinaciones contra una cuenta conocida). Datos de menores → hace falta defensa en capas.
**Decisión:** el login del alumno pasa por una **Edge Function** (`alumno-login`), nunca `signInWithPassword` directo. Capas:
1. **Secreto de aula** (lo configura la seño 1 vez en el device) → sin él ni se listan los avatares (`aula-students`).
2. **PIN por chico** (4 dígitos) con **bloqueo tras 5 intentos** (15 min), enforced en un RPC `SECURITY DEFINER`.
3. **Credenciales opacas**: email aleatorio + password Auth random guardado server-only en `alumno_cred`; el browser nunca las ve.
Tablas server-only (`aula_secreto`, `alumno_cred`, `intento_login`) con RLS y **sin policies** + RPCs con `EXECUTE` revocado a `anon`/`authenticated` (solo `service_role`). La docente sigue con email+contraseña directo.
**Consecuencias:** fuerza bruta inviable (gateada por secreto de aula + lockout); no se puede saltear la Edge Function ni pegarle directo a Auth con un email adivinable. Introduce el concepto `aula` (estructurado para multi-escuela en Fase 2) y la primera Edge Function (que se reutiliza para SOL en Etapa 2). El secreto de aula vive en `localStorage` del device (secreto compartido de aula, no por chico). Hardening futuro: throttle por-aula al adivinar el secreto.

## ADR-008 — Puntaje progresivo (ELO-lite) reemplaza la regla de ventana
**Contexto:** la regla de dominio de la Etapa 3 (`calcularEstado`/`puntajeNodo`, ventana de las últimas respuestas) resolvía OPEN-1, pero saltaba de estado según una foto reciente y no dejaba margen para "cuánto le costó" ni para nunca repetir ejercicios a medida que el pool crece. Spec completa: `docs/superpowers/specs/2026-07-03-puntaje-progresivo-y-generacion-por-banda.md`.
**Decisión:** cada `alumno_nodo` acumula un **puntaje 0→100** con un motor ELO-lite determinístico (`web/lib/dominio.ts`), sin IA. Los estados se derivan del puntaje + señales de conducta; `dominado` es un **hito pegajoso**. Locks de la spec (DP1-DP7): **DP1** puntaje determinístico en la app, sin IA; **DP2** estados derivados, `dominado` pegajoso (solo lo tocan el override docente y el decaimiento); **DP3** asimetría pro-motivación (bajar cuesta la mitad que subir); **DP4** dominar exige ≥ 50 ejercicios respondidos, además de puntaje y cobertura; **DP5** un chico nunca repite un ejercicio ya respondido (el pool sigue compartido entre chicos); **DP6** pool compartido con reposición automática batcheada y tope de uso diario; **DP7** generación por banda de grado (1°-2° / 3°-4° / 5°-7°), no por edad — evita datos personales nuevos del menor.
**Consecuencias:** la regla de ventana anterior (`calcularEstado`, `puntajeNodo`, `VENTANA`, `MIN_DOMINIO`) queda **retirada**; `resolverEstado` (override docente) y la spec de decaimiento temporal siguen intactas y operan igual sobre el puntaje/estado nuevo. El mapa del alumno gana un gradiente por puntaje. Resuelve **OPEN-1** y **OPEN-3** (la reposición fija cuándo se regenera el pool); cierra el ítem correspondiente de Fase 2.

---

## Preguntas abiertas (a decidir)

### OPEN-1 (resuelta) — Regla de "dominio" de un nodo
¿Qué hace que un nodo pase de `en_construccion` a `dominado`? Definida primero como regla de ventana (`2026-06-28-evaluacion-y-dominio-de-nodos.md`) y evolucionada a puntaje progresivo → **ADR-008**. Las constantes exactas (umbral 70, mínimo 50 ejercicios, K=8) siguen a validar con la docente, pero la decisión de diseño está cerrada.

### OPEN-2 — Cómo se "carga" el programa en el MVP
En el MVP el programa de Lengua lo carga el equipo (datos semilla), no la docente. Falta definir el formato exacto del texto que se le pasa a Claude para que lo divida bien en nodos.

### OPEN-3 (resuelta) — Frecuencia de regeneración del pool
Cada cuánto se generan ejercicios nuevos por nodo (para que no se repitan siempre los mismos) sin disparar el costo. → **ADR-008**: pool inicial estratificado al publicar + reposición automática batcheada cuando a un chico le queda poco sin ver, con tope diario.