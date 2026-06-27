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

---

## Preguntas abiertas (a decidir)

### OPEN-1 — Regla de "dominio" de un nodo
¿Qué hace que un nodo pase de `en_construccion` a `dominado`? ¿Cantidad de aciertos seguidos, un puntaje, un umbral por dificultad? Define toda la lógica de la Etapa 3. **A definir con el cliente / la docente antes de la Etapa 3.**

### OPEN-2 — Cómo se "carga" el programa en el MVP
En el MVP el programa de Lengua lo carga el equipo (datos semilla), no la docente. Falta definir el formato exacto del texto que se le pasa a Claude para que lo divida bien en nodos.

### OPEN-3 — Frecuencia de regeneración del pool
Cada cuánto se generan ejercicios nuevos por nodo (para que no se repitan siempre los mismos) sin disparar el costo.