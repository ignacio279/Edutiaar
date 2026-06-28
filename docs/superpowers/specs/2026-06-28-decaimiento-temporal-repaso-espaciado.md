# Decaimiento temporal y repaso espaciado — Spec (Fase 2)

> Spec de diseño. Define **QUÉ** construir y por qué. No es plan de ejecución.
> Estado: **propuesta para Fase 2.** Depende de la Etapa 3 del MVP (regla de dominio del nodo) ya andando.
> Relacionados: Spec *Evaluación y dominio de nodos* (Etapa 3), `DATA_MODEL.md`, `DECISIONS.md`, `ROADMAP.md`, `ARCHITECTURE.md`.

## Resumen

Un nodo `dominado` **no queda dominado para siempre.** Si pasa el tiempo sin practicarlo, lo aprendido se afloja → el sistema lo marca **"para repasar"** y, cuando el chico lo repasa bien, lo vuelve a fijar y **espacia** cada vez más el próximo repaso.

Es la pata que faltaba a "nodos permanentes que mejoran **mes a mes**": el mapa no es una foto de marzo, sino algo vivo que se mantiene. Y es **repaso espaciado** clásico (Leitner/SM-2) pero simplificado y **suave**, pensado para chicos: nunca castiga, solo invita a refrescar.

Se apoya en la regla de dominio (Etapa 3): primero un nodo se **domina** (cobertura de formatos y dificultades, al primer intento, ventana reciente); recién entonces **empieza a decaer** con el tiempo.

## Decisiones (locks)

| # | Decisión | Por qué |
|---|---|---|
| DD1 | **El decaimiento es determinístico, en la app, sin IA.** Es tiempo + un calendario de repasos. | Mismo espíritu que D1 del spec de dominio: predecible para la maestra, gratis, sin mandar datos de menores a la IA. |
| DD2 | **El repaso es señal suave: nunca pierde `dominado` ni baja a `no_empezado`.** Solo agrega un flag "para repasar". | Cuidado emocional (D6): "ya lo sabías, mantengámoslo fresco", no "lo perdiste". |
| DD3 | **Intervalos espaciados que se expanden** al repasar bien (Leitner simplificado), calibrados a escala **mensual**. | Lo dominado de verdad necesita menos repaso con el tiempo; lo frágil, más seguido. |
| DD4 | **Aprobar un repaso exige re-demostrar en chico** (varios aciertos al primer intento, incluido `producir`), no un acierto suelto. | Mantiene la exigencia de cobertura del spec de dominio; un click con suerte no "refresca". |
| DD5 | **"Para repasar" (tiempo) y `a_reforzar` (está fallando ahora) son ejes distintos** y se componen. | Uno es "hace mucho que no lo tocás"; el otro es "te estás trabando hoy". No confundirlos. |
| DD6 | **La docente puede posponer (snooze) o saltar un repaso** (override, D7). | Conoce al chico; si no hace falta, manda ella. |
| DD7 | **Un repaso por sesión, no una avalancha.** La app intercala repasos de a poco. | Tras vacaciones, decenas de nodos quedan "para repasar" — no abrumar al chico ni a la maestra. |

## Cómo decae (calendario de repaso)

Cada nodo `dominado` lleva un **nivel de repaso** y una **fecha de próximo repaso**. Al dominar arranca en nivel 0; cada repaso aprobado sube de nivel y empuja la fecha más lejos.

Intervalos sugeridos (orientativos, a validar con la docente):

```
nivel 0 → 14 días
nivel 1 → 30 días
nivel 2 → 60 días
nivel 3 → 120 días   (tope)
```

- **Al dominar el nodo:** `repaso_nivel = 0`, `proximo_repaso_at = dominado_at + 14 días`.
- **Repaso APROBADO:** `repaso_nivel = min(nivel+1, 3)`; `proximo_repaso_at = hoy + intervalo(nivel nuevo)`. Cada vez que demuestra que lo retiene, lo vuelve a ver más tarde.
- **Repaso REPROBADO:** `repaso_nivel = max(nivel-1, 0)`; `proximo_repaso_at = hoy + intervalo(nivel nuevo)`. Vuelve antes, pero **sigue `dominado`** (no se castiga).

## Estado "para repasar"

No es un estado nuevo del enum (`estado` sigue siendo `dominado`). Es un **flag derivado**:

```
necesita_repaso = (estado == 'dominado')
                  AND (hoy >= proximo_repaso_at)
                  AND (sin acierto al primer intento en el nodo desde proximo_repaso_at)
```

(La última condición evita marcar "para repasar" a un nodo que el chico igual está practicando seguido.)

**Visual:** el nodo dominado se muestra con un detalle **tibio y amable** (ej. un ícono 🔄 / un brillo apagado), **distinto** del rojo de `a_reforzar`. "Para repasar" = "lo sabés, vamos a refrescarlo", no "estás mal".

**Opcional (visual):** una **vigencia 0–100** que baja suave a medida que se acerca `proximo_repaso_at`, para hacer un gradiente. Es decorativa; la regla de verdad es el flag `necesita_repaso`.

## Aprobar / reprobar un repaso

Cuando un nodo está "para repasar", la app le sirve unos ejercicios de ese nodo (ver "Servir ejercicios" del spec de dominio: la escalera empuja formatos/dificultades). Sobre esa **ventana corta de repaso**:

- **Aprobado:** ≥ **3 aciertos al primer intento** en el nodo, con ≥ **1 de tipo `producir`**. Más liviano que dominar (ya lo dominó); confirma retención + cobertura mínima.
- **Reprobado:** no llega a eso, o **2 fallos seguidos** al primer intento.

Composición con `a_reforzar` (DD5): si mientras repasa **empieza a fallar feo** (regla del spec de dominio: 2 fallos seguidos / sesión < 50%), el nodo cae a `a_reforzar` — señal "se está trabando **ahora**" — ortogonal al repaso. El decaimiento mira el tiempo; `a_reforzar` mira el rendimiento actual.

## Cambios en el modelo de datos

**`alumno_nodo`** — agregar (todo nullable; solo aplica a nodos que llegaron a `dominado`):

| Columna | Tipo | Notas |
|---|---|---|
| `dominado_at` | timestamptz | cuándo se dominó (arranca el reloj de decaimiento) |
| `repaso_nivel` | int | caja de Leitner / índice de intervalo (default 0) |
| `proximo_repaso_at` | timestamptz | cuándo toca repasar |

`necesita_repaso` **no es columna**: se deriva comparando `now()` con `proximo_repaso_at` al leer (mapa/panel). Sin cron necesario. *(Opcional: un job mensual que materialice la lista "para repasar" del panel, si conviene por performance.)*

No toca `respuesta` ni `ejercicio` (el `tipo` ya lo agrega el spec de dominio).

## Cuándo corre cada cosa

1. **Al dominar un nodo:** setear `dominado_at`, `repaso_nivel = 0`, `proximo_repaso_at = +14d`. (Determinístico, gratis.)
2. **Al cerrar una sesión** que tocó un nodo dominado que estaba "para repasar": evaluar aprobado/reprobado y **reprogramar** `repaso_nivel` + `proximo_repaso_at`.
3. **Al leer el mapa / el panel:** derivar `necesita_repaso` (now vs `proximo_repaso_at`). Sin IA, sin job.

## Panel de la docente

Nueva vista derivada: **"Para repasar este mes"** — lista de `(alumno, nodo)` con `necesita_repaso = true`, ordenada por más atrasado / nivel más bajo. Encaja con el histórico mes a mes y le da a la maestra una agenda concreta de repaso. La docente puede **posponer** o **saltar** un ítem (DD6).

## Ejemplo trabajado (Mateo, nodo "Vocales")

- **15/03** — Mateo **domina** "Vocales". `repaso_nivel = 0`, próximo repaso **29/03**.
- **29/03 → hoy** sin tocar el nodo → el mapa lo muestra **"para repasar"** (🔄, suave).
- **02/04** — practica: 3 aciertos al primer intento, 1 `producir` → **repaso aprobado**. Sube a `repaso_nivel = 1`, próximo repaso **+30 días → 02/05**.
- **02/05** vuelve a quedar "para repasar". Esta vez falla el repaso → baja a `repaso_nivel = 0`, vuelve a verlo en **14 días**. Sigue `dominado` todo el tiempo; nunca se lo castiga.

Resultado: el nodo "respira" — se mantiene vivo mes a mes, con repasos cada vez más espaciados si Mateo lo retiene.

## Versión simple (fallback)

Si en la validación la maestra prefiere algo más sencillo: **un solo intervalo fijo** (ej. repasar todo nodo dominado a los **30 días**), sin niveles que se expanden. Conserva lo esencial (lo dominado se refresca), pierde el espaciado adaptativo.

## Casos borde

- **Vacaciones / sin conexión largo:** al volver, muchos nodos quedan "para repasar" → DD7: la app intercala **un repaso por sesión** y el panel prioriza; no se le tiran todos juntos al chico.
- **Nodo nunca dominado:** no decae (el decaimiento solo aplica a `dominado`).
- **El chico practica un nodo dominado por gusto:** se mantiene fresco, `proximo_repaso_at` se corre; no aparece "para repasar".
- **Override docente:** posponer = empujar `proximo_repaso_at`; saltar = marcar el nodo como no-repaso hasta que ella quiera.
- **El decaimiento nunca baja `dominado`, ni el puntaje histórico, ni vuelve a `no_empezado`** (DD2).

## Qué resuelve

Cierra el ítem **"Decaimiento temporal / repaso espaciado"** que el spec de *Evaluación y dominio de nodos* dejó abierto para Fase 2. Convierte el mapa en algo permanente que **mejora mes a mes**, con repaso espaciado suave.

## A validar / abierto

- Los **intervalos** (14/30/60/120) y el umbral de aprobar repaso (≥3, ≥1 `producir`), con la docente.
- Si "para repasar" **se ve bien sin asustar** (color/ícono) y se distingue claro de `a_reforzar`.
- **Lazy vs job mensual** para el panel (performance).
- Encaje con el **diagnóstico cualitativo de SOL** (Fase 2): un nodo que se reprueba al repasar podría disparar diagnóstico ("le costó retener X").
