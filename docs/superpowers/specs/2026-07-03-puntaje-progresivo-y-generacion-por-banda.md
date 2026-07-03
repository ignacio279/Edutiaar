# Puntaje progresivo, ejercicios sin repetir y generación por banda — Spec (Fase 2)

> Spec de diseño. Define **QUÉ** construir y por qué. No es plan de ejecución.
> Estado: **propuesta.** Evoluciona la regla de dominio de la Etapa 3.
> Relacionados: `2026-06-28-evaluacion-y-dominio-de-nodos.md` (regla actual), `2026-06-28-decaimiento-temporal-repaso-espaciado.md` (eje tiempo, sigue válida), `DATA_MODEL.md`, `DECISIONS.md`.

## Resumen

El nodo deja de saltar entre estados por una foto de la ventana reciente y pasa a tener un **puntaje progresivo 0→100**: el chico arranca en 0 y el puntaje crece (o baja) ejercicio a ejercicio, según **qué tan difícil era** y **cómo le fue**. Los estados (`dominado`, `a_reforzar`, …) dejan de ser la verdad principal: se **derivan** del puntaje y de señales de conducta. `Dominado` queda como **hito pegajoso** que exige, además de puntaje y cobertura, **haber hecho al menos 50 ejercicios** del nodo.

Regla dura nueva: **un chico nunca vuelve a ver un ejercicio que ya respondió.** El pool sigue siendo compartido entre chicos, pero se **repone solo** cuando a alguien se le acaba lo no visto.

La generación de ejercicios se adapta con dos ejes que ya tenemos: el **grado** (banda madurativa del prompt: vocabulario, largo de consigna) y el **puntaje** del chico (qué dificultad servirle). **Sin datos personales nuevos del menor** (Regla 5).

## Decisiones (locks)

| # | Decisión | Por qué |
|---|---|---|
| DP1 | **El puntaje es determinístico, en la app, sin IA** (ELO-lite). | Mismo espíritu que la regla actual: predecible para la maestra, gratis, unit-testeable, sin mandar datos de menores a la IA. |
| DP2 | **Estados derivados del puntaje + señales; `dominado` es hito pegajoso.** Una vez alcanzado no se pierde por fallar; solo lo tocan el override docente y el decaimiento temporal (spec aparte). | El puntaje refleja la realidad (baja si falla); el logro no se le quita al chico (cuidado emocional, D5). |
| DP3 | **Asimetría pro-motivación: bajar cuesta la mitad que subir.** | Un par de días malos no derrumban semanas de laburo. |
| DP4 | **Dominar exige ≥ 50 ejercicios respondidos en el nodo** (además de puntaje y cobertura). | Dominar tiene que costar constancia, no una tarde inspirada. Constante configurable. |
| DP5 | **Un chico nunca repite un ejercicio ya respondido.** El reintento inmediato dentro del ejercicio no cuenta como repetición. Repetir **entre** chicos sí vale (pool compartido). | Repetir memoriza la respuesta, no el contenido. |
| DP6 | **Pool compartido con reposición automática batcheada** cuando a un chico le queda poco sin ver, con **tope de uso diario** (Regla 4). | Consecuencia de DP4+DP5: hacen falta 50+ ejercicios por nodo y creciendo. Lotes async mantienen el costo controlado (Regla 3: nunca un llamado por click). |
| DP7 | **Generación por banda de grado, no por edad.** Bandas 1°-2°, 3°-4°, 5°-7° sobre `programa.grado`. | La edad real es un dato personal más de un menor (Regla 5) y la seño tendría que mantenerlo. El grado ya existe y fija la banda madurativa; el puntaje cubre el ritmo individual (sobreedad incluida). |

## Motor de puntaje (ELO-lite)

Cada nodo de cada chico tiene `puntaje` 0..100, arranca en 0. Al cerrar la sesión, cada respuesta de la sesión lo mueve, en orden:

```
nivel_ejercicio = dificultad × 25        (1→25, 2→50, 3→75)
esperado        = 1 / (1 + 10^((nivel_ejercicio − puntaje) / 40))
resultado       = 1 si acertó al PRIMER intento; 0 si falló al primer intento
delta           = K × peso_tipo × (resultado − esperado)
                  si delta < 0 → delta = delta / 2          (DP3, asimetría)
puntaje_nuevo   = clamp(puntaje + delta, 0, 100)
```

- **K = 8** (paso base). **peso_tipo**: `producir` 2, `ordenar` 1.5, resto 1 (igual que hoy).
- **Solo el primer intento mueve el puntaje.** Acertar tras reintentos = neutro (no suma ni resta); el fallo ya restó al primer intento.
- Intuición: acertar algo **más difícil que tu nivel** suma mucho; acertar algo fácil teniendo puntaje alto suma ~0 (no se infla moliendo lo fácil); fallar algo muy difícil casi no resta; fallar algo fácil sí es señal.
- Para la seño en una oración: *"gana más puntos cuanto más difícil es lo que logra; perder con algo muy difícil casi no resta"*.
- **Pura y replayable**: `puntaje_nuevo = fold(respuestas)`. Vive en `web/lib/dominio.ts`, unit-testeada. La IA no interviene (DP1).

Constantes (`K`, escala 40, pesos, asimetría) configurables y **a validar con la docente**; la FORMA no cambia.

## Estados derivados

`alumno_nodo.estado` se sigue persistiendo (el override, el decaimiento y el panel lo usan), pero ahora lo **calcula el puntaje + señales**, al cerrar la sesión:

| Estado | Condición |
|---|---|
| `no_empezado` | Sin respuestas en el nodo. |
| `dominado` | `puntaje ≥ 70` **y** cobertura histórica al primer intento (≥ 2 `producir`, ≥ 1 de dificultad 3) **y** `respuestas_distintas ≥ 50` (DP4). **Pegajoso**: una vez alcanzado, no se pierde por puntaje (DP2). |
| `a_reforzar` | Señal de conducta ACTUAL, igual que hoy: 2 fallos seguidos al primer intento, o sesión < 50 % de aciertos. No es banda de puntaje: significa "se está trabando ahora". No aplica sobre `dominado`. |
| `en_construccion` | El resto. |

- **Cobertura sigue siendo requisito de `dominado`**: evita llegar a 70 a fuerza de opción múltiple fácil.
- `MIN_EJERCICIOS_DOMINIO = 50`, `UMBRAL_DOMINIO = 70`: constantes configurables, a validar con la docente.
- **Override docente intacto** (`resolverEstado`, D6/D7): la seño puede marcar dominado a un chico que ya trae el tema sabido, sin hacerlo moler 50 ejercicios.
- **Spec de decaimiento intacta**: opera sobre `dominado` exactamente como está escrita.

## Nunca repetir ejercicios (DP5)

- `elegirEjercicios` (en `web/lib/practica.ts`) **excluye los ejercicios que el chico ya respondió** en el nodo. La tabla `respuesta` ya registra `ejercicio_id` por sesión del alumno: los "vistos" se **derivan**, sin columna nueva.
- El pool es compartido: que Mateo haya hecho el ejercicio 7 no se lo quita a Juana.
- El reintento inmediato (contestó mal y prueba de nuevo en el momento) es parte del flujo del ejercicio, **no** una repetición.
- La escalera de cobertura y la dificultad adaptativa actuales siguen igual, aplicadas sobre el pool filtrado.

## Pool con reposición automática (DP6)

- **Al publicar una materia**: pool inicial estratificado por nodo, ~3 ejercicios por celda dificultad (1-3) × tipo (reconocer, completar, ordenar, producir) ≈ **36 por nodo**.
- **Reposición**: al cerrar sesión (o al cargar Practicar), si al chico le quedan **< 16 ejercicios sin ver** en el nodo (≈ 2 sesiones), se dispara async la generación de un lote nuevo (~12, priorizando los estratos que escaseen para ese chico). El chico no espera: sigue con lo que hay.
- **Tope de uso (Regla 4)**: máximo de lotes de reposición por día (constante, p. ej. 20 por escuela). Superado el tope, la reposición espera al día siguiente.
- **Pool agotado** (caso raro: se consumió todo antes de reponer): pantalla amable — *"SOL está preparando ejercicios nuevos para este tema"* — y la app ofrece practicar otro nodo. Nunca un error pelado ni un ejercicio repetido.
- El pool **crece con los años**: los repasos espaciados también consumen ejercicios nuevos. Filas de texto en Postgres: almacenamiento despreciable.

## Generación por banda de grado (DP7)

La "skill" de generación es una **plantilla versionada en código** (`supabase/functions/generador-ejercicios/generar.ts`), no datos en la DB. Tres bandas sobre `programa.grado`:

| Banda | Grados | La plantilla ajusta |
|---|---|---|
| Chiquitos | 1°-2° | Consignas de una oración corta, vocabulario cotidiano, más `reconocer`/`completar`, opciones bien distintas entre sí. |
| Medianos | 3°-4° | Consignas de 1-2 oraciones, vocabulario escolar, mezcla pareja de tipos. |
| Grandes | 5°-7° | Consignas más largas, vocabulario rico, más `ordenar`/`producir`, distractores más finos. |

- La banda fija **cómo se redacta**; el puntaje del chico fija **qué dificultad se le sirve**. Ejes independientes.
- Los ejemplos de la zona (`perfil.ejemplos_zona`) siguen entrando al prompt como hoy.
- Cero datos nuevos del menor: todo sale de `programa.grado`.

## Cambios en el modelo de datos

**`alumno_nodo`** — el `puntaje` deja de ser derivado de la ventana y pasa a ser el **acumulador persistido** (si la columna no existe, migración para agregarla; default 0).

Nada más. "Vistos" se deriva de `respuesta`; la banda se deriva de `programa.grado`; el tope diario de reposición se cuenta consultando los lotes generados en el día (o una tabla mínima de contador si la consulta resulta cara — decisión de implementación).

**Compatibilidad**: los puntajes existentes se recalculan por replay del histórico (datos semilla, poco volumen). Los nodos ya `dominado` conservan el hito (pegajoso hacia atrás también).

## Cuándo corre cada cosa

1. **Al cerrar sesión**: replay de las respuestas de la sesión sobre el puntaje → nuevo `puntaje` + estado derivado → `alumno_nodo`. Determinístico, gratis.
2. **Al cargar Practicar**: filtrar vistos, elegir del pool (escalera + dificultad adaptativa, como hoy). Si quedan < 16 sin ver → disparar reposición async.
3. **Al publicar materia**: generación del pool inicial estratificado por nodo.

## Ejemplo trabajado (Mateo, nodo "Vocales", 2° grado)

- Arranca en **0**. Primera sesión: acierta 5 fáciles al primer intento → cada acierto suma 4-6 puntos (mucho al principio, menos a medida que sube) → termina ~**27**.
- Tercera sesión: acierta 2 de dificultad 2 y 1 `producir` difícil → el `producir` difícil, inesperado a su nivel, suma ~15 él solo → **55**.
- Sexta sesión: día malo, falla 3 fáciles → cada fallo resta ~3.5 (la mitad, por la asimetría) → **58 → 47**. El mapa lo muestra; nadie lo reta.
- Sesión 7: llega a **73** de puntaje con 52 ejercicios hechos y cobertura completa → **`dominado`** 🎉. Hito pegajoso: la semana siguiente falla varios y el puntaje baja a 65 — el nodo sigue `dominado`, la seño ve el puntaje bajar y el decaimiento/repaso se encarga del mantenimiento.
- Nunca vio dos veces el mismo ejercicio: cuando le quedaban 14 sin ver, SOL ya había generado 12 nuevos.

## Casos borde

- **Chico que ya sabe el tema**: 50 ejercicios igual (constancia) o la seño lo marca `dominado` por override — su llamada.
- **Pool agotado sin reposición** (tope diario alcanzado / falla de generación): mensaje amable + otro nodo. Nunca repetir.
- **Fallo de la generación async**: reintento en la próxima sesión; el chico nunca ve el error.
- **`a_reforzar` sobre puntaje alto no dominado**: puede pasar (viene bien y se traba) — correcto: la señal es "ahora", el puntaje es trayectoria.
- **Retroactivo**: nodos hoy `dominado` con menos de 50 ejercicios conservan el hito (no se castiga hacia atrás).

## Qué NO cambia

- Tablas `respuesta` y `ejercicio`, RLS, roles.
- Regla 2: SOL genera, la app corrige.
- Spec de decaimiento temporal / repaso espaciado: válida tal cual (opera sobre `dominado`).
- Escalera de cobertura y dificultad adaptativa al servir ejercicios.
- Override docente (`estado_override`).

## Tests (obligatorios, Regla de trabajo)

- **Unit** (`tests/unit`): motor ELO-lite (sube/baja, asimetría, esperado por dificultad, clamp, neutro con reintentos, replay determinístico); estados derivados (bandas, pegajoso, cobertura, mínimo 50); filtro de vistos en `elegirEjercicios`; umbral de reposición.
- **Integración** (`tests/integration`): reposición end-to-end (mock), tope diario, RLS de las piezas nuevas. Idempotentes, con datos efímeros.

## A validar / abierto

- Constantes con la docente: K=8, escala 40, asimetría ÷2, umbral 70, mínimo 50, lote 12, gatillo 16, tope diario.
- Si el mapa muestra además el **camino al dominio** (ej. "34 de 50 ejercicios") o solo el gradiente.
- Contador de tope diario: consulta vs tabla mínima (performance, decisión de implementación).
- Cómo conviven reposición y modo mock mientras no haya API key (el mock puede generar lotes sintéticos para no bloquear el desarrollo).
