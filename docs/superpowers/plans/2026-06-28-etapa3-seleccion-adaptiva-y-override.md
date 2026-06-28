# Etapa 3 — Selección adaptiva + Override docente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la Etapa 3 del MVP — la selección de ejercicios pasa a ser personalizada (escalera de cobertura + dificultad adaptativa) y la docente puede fijar el estado de un nodo a mano (override que la regla respeta).

**Architecture:** Dos slices verticales independientes. (1) **SP-4d** vuelve `web/lib/practica.ts` personalizada: usa la historia reciente del chico en el nodo para empujar hacia formatos sin cubrir (`reconocer`→`producir`) y acercar la dificultad a un nivel adaptativo; lógica PURA y determinística, cero API. (2) **SP-4e** agrega override docente: columna `alumno_nodo.estado_override`, una policy RLS que deja a la docente escribir el `alumno_nodo` de sus alumnos, un helper puro `resolverEstado` que la regla respeta al cerrar sesión, y un control en el detalle del alumno.

**Tech Stack:** Next.js (App Router, TS) en `web/`; Supabase (Postgres + RLS, migraciones SQL); tests con `node --test` (unit `.mjs` importando `.ts` por strip-types nativo; integración contra Supabase real).

## Global Constraints

- **SOL no corrige; SOL genera.** La selección de ejercicios y el estado del nodo son lógica determinística de la app, cero llamadas a la API de Claude. (CLAUDE.md regla 2.)
- **Lógica pura sin DOM** en `web/lib/*.ts` para que sea unit-testeable; nada de fetch/React adentro de los módulos `lib`. (CLAUDE.md "Tests por feature".)
- **Cada feature lleva sus tests y se corren antes de commitear.** No commitear con tests en rojo. Unit → `tests/unit` (`npm test`). Integración (DB/RLS) → `tests/integration` (`npm run test:db`), idempotentes: crean y borran su propia data efímera, sin tocar la semilla.
- **Determinístico para tests estables:** toda selección/orden desempata por campos fijos (dificultad, luego `id`), nunca por azar.
- **RLS de menores:** cada alumno ve solo lo suyo; la docente solo a sus alumnos (`es_mi_alumno`). Una policy nueva no puede ensanchar eso. (CLAUDE.md regla 5.)
- **Nombres de tablas/columnas en español `snake_case`.** UI y textos en español rioplatense, cálido (es para chicos / la seño).
- **Next.js no estándar:** antes de tocar código de `web/`, leer la guía relevante en `web/node_modules/next/dist/docs/`. (web/AGENTS.md.)
- **Estados del nodo (enum `estado_nodo`):** `no_empezado | en_construccion | a_reforzar | dominado`.
- **Tipos de ejercicio (demanda creciente):** `reconocer | completar | ordenar | producir`.

---

## File Structure

**Slice SP-4d — Selección adaptiva (lógica pura + cableado en la página):**
- `web/lib/practica.ts` — *(modificar)* agrega `nivelAdaptativo`, `tiposPendientes`, tipo `HistorialEjercicio`; reescribe `elegirEjercicios` para usar historia. Sigue siendo pura.
- `tests/unit/practica.test.mjs` — *(modificar)* tests de los tres helpers nuevos + comportamiento de `elegirEjercicios` con historia.
- `web/app/alumno/[programaId]/practicar/page.tsx` — *(modificar)* antes de servir, fetchea la ventana reciente del nodo y se la pasa a `elegirEjercicios`.

**Slice SP-4e — Override docente:**
- `supabase/migrations/0010_alumno_nodo_override.sql` — *(crear)* columna `estado_override` + policies RLS para que la docente escriba `alumno_nodo` de sus alumnos.
- `web/lib/dominio.ts` — *(modificar)* agrega helper puro `resolverEstado` (la regla respeta el override).
- `tests/unit/dominio.test.mjs` — *(modificar)* tests de `resolverEstado`.
- `web/app/alumno/[programaId]/practicar/page.tsx` — *(modificar)* al cerrar sesión, lee `estado_override` y aplica `resolverEstado` antes del upsert.
- `web/app/docente/[alumnoId]/page.tsx` — *(modificar)* trae `nodo_id` + `estado_override`; agrega un control para fijar/auto el estado de cada nodo.
- `tests/integration/override-docente.test.mjs` — *(crear)* RLS: la docente puede fijar el estado de su alumno; un tercero no.

> **Nota de alcance (verificado, no construir):** el pool semilla (`scripts/seed-demo-lengua.mjs`) ya tiene variedad — tipos `reconocer/completar/ordenar/producir` y dificultades `1/2/3` — así que la escalera de cobertura tiene de dónde elegir y `dominado` es alcanzable. No hace falta resembrar.

---

## Slice SP-4d — Selección de ejercicios adaptiva + cobertura

### Task 1: Helper `nivelAdaptativo` (dificultad adaptativa, pura)

**Files:**
- Modify: `web/lib/practica.ts`
- Test: `tests/unit/practica.test.mjs`

**Interfaces:**
- Consumes: tipo `Ejercicio` ya exportado de `practica.ts` (`{ id, enunciado, opciones, correcta, dificultad, tipo }`).
- Produces:
  - `export type HistorialEjercicio = { correcta: boolean; reintentos: number; tipo: string; dificultad: number }` — una respuesta previa del chico en el nodo; **el array va del más reciente al más viejo**.
  - `export const ORDEN_TIPO = ['reconocer','completar','ordenar','producir'] as const`
  - `export function nivelAdaptativo(historial: HistorialEjercicio[], pool: Ejercicio[]): number` — dificultad objetivo, clamp a [min,max] del pool.

- [ ] **Step 1: Write the failing test**

En `tests/unit/practica.test.mjs`, agregá al final (y al tope, junto a los imports, sumá `nivelAdaptativo` y, si hiciera falta, `ORDEN_TIPO` al `import` desde `'../../web/lib/practica.ts'`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nivelAdaptativo } from '../../web/lib/practica.ts';

// pool con dificultades 1..3 (como la semilla)
const pool = [
  { id: 'a', enunciado: '', opciones: [], correcta: '', dificultad: 1, tipo: 'reconocer' },
  { id: 'b', enunciado: '', opciones: [], correcta: '', dificultad: 2, tipo: 'completar' },
  { id: 'c', enunciado: '', opciones: [], correcta: '', dificultad: 3, tipo: 'producir' },
];
const ft = (tipo, dif) => ({ correcta: true, reintentos: 0, tipo, dificultad: dif });
const fail = (tipo, dif) => ({ correcta: false, reintentos: 1, tipo, dificultad: dif });

test('nivelAdaptativo: sin historia arranca en la dificultad más baja del pool', () => {
  assert.equal(nivelAdaptativo([], pool), 1);
});

test('nivelAdaptativo: racha de >=2 al primer intento sube el nivel', () => {
  // más reciente primero: dos aciertos al 1er intento en dif 2 => sube a 3
  assert.equal(nivelAdaptativo([ft('completar', 2), ft('reconocer', 2)], pool), 3);
});

test('nivelAdaptativo: dos fallos seguidos al 1er intento bajan el nivel', () => {
  assert.equal(nivelAdaptativo([fail('producir', 3), fail('producir', 3)], pool), 2);
});

test('nivelAdaptativo: clamp al máximo del pool (no se va de 3)', () => {
  assert.equal(nivelAdaptativo([ft('producir', 3), ft('producir', 3)], pool), 3);
});

test('nivelAdaptativo: clamp al mínimo del pool (no baja de 1)', () => {
  assert.equal(nivelAdaptativo([fail('reconocer', 1), fail('reconocer', 1)], pool), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `nivelAdaptativo` no existe (`SyntaxError: ... does not provide an export named 'nivelAdaptativo'`).

- [ ] **Step 3: Write minimal implementation**

En `web/lib/practica.ts`, agregá debajo del tipo `RespuestaReg`:

```ts
export const ORDEN_TIPO = ['reconocer', 'completar', 'ordenar', 'producir'] as const;

// Una respuesta previa del chico en el nodo (más reciente primero).
export type HistorialEjercicio = { correcta: boolean; reintentos: number; tipo: string; dificultad: number };

const esPrimerIntento = (h: HistorialEjercicio) => h.correcta && h.reintentos === 0;

// Dificultad objetivo (adaptativa): sube con racha de aciertos al 1er intento, baja si los 2
// más recientes fallaron. Arranca en la dificultad más baja del pool. Clamp a [min,max] del pool.
export function nivelAdaptativo(historial: HistorialEjercicio[], pool: Ejercicio[]): number {
  const difs = pool.map((e) => e.dificultad);
  const min = difs.length ? Math.min(...difs) : 1;
  const max = difs.length ? Math.max(...difs) : 1;
  if (historial.length === 0) return min;
  const ultimaDif = historial[0].dificultad;
  let racha = 0;
  for (const h of historial) { if (esPrimerIntento(h)) racha++; else break; }
  const dosUltimasMal = historial.length >= 2 && !esPrimerIntento(historial[0]) && !esPrimerIntento(historial[1]);
  let nivel = ultimaDif;
  if (racha >= 2) nivel = ultimaDif + 1;
  else if (dosUltimasMal) nivel = ultimaDif - 1;
  return Math.min(max, Math.max(min, nivel));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — los 5 tests de `nivelAdaptativo` en verde, el resto sin romper.

- [ ] **Step 5: Commit**

```bash
git add web/lib/practica.ts tests/unit/practica.test.mjs
git commit -m "feat(practica): nivelAdaptativo — dificultad sube con racha, baja con fallos (SP-4d)"
```

---

### Task 2: Helper `tiposPendientes` (escalera de cobertura, puro)

**Files:**
- Modify: `web/lib/practica.ts`
- Test: `tests/unit/practica.test.mjs`

**Interfaces:**
- Consumes: `HistorialEjercicio`, `ORDEN_TIPO` (Task 1).
- Produces: `export function tiposPendientes(historial: HistorialEjercicio[]): string[]` — los tipos que el chico **todavía no demostró al primer intento**, en orden de demanda creciente.

- [ ] **Step 1: Write the failing test**

Agregá a `tests/unit/practica.test.mjs` (sumá `tiposPendientes` al import existente de `practica.ts`):

```js
import { tiposPendientes } from '../../web/lib/practica.ts';

test('tiposPendientes: sin historia, faltan los 4 tipos en orden de demanda', () => {
  assert.deepEqual(tiposPendientes([]), ['reconocer', 'completar', 'ordenar', 'producir']);
});

test('tiposPendientes: un acierto al 1er intento saca ese tipo de pendientes', () => {
  assert.deepEqual(tiposPendientes([ft('reconocer', 1)]), ['completar', 'ordenar', 'producir']);
});

test('tiposPendientes: acertar con reintento NO cuenta como cubierto', () => {
  const conReintento = { correcta: true, reintentos: 1, tipo: 'reconocer', dificultad: 1 };
  assert.deepEqual(tiposPendientes([conReintento]), ['reconocer', 'completar', 'ordenar', 'producir']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `tiposPendientes` no existe.

- [ ] **Step 3: Write minimal implementation**

En `web/lib/practica.ts`, debajo de `nivelAdaptativo`:

```ts
// Tipos que el chico todavía NO demostró al primer intento, en orden de demanda creciente
// (reconocer→producir). Es la "escalera de cobertura": empuja hacia lo que le falta cubrir.
export function tiposPendientes(historial: HistorialEjercicio[]): string[] {
  const dominados = new Set(historial.filter(esPrimerIntento).map((h) => h.tipo));
  return ORDEN_TIPO.filter((t) => !dominados.has(t));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — los 3 tests nuevos en verde.

- [ ] **Step 5: Commit**

```bash
git add web/lib/practica.ts tests/unit/practica.test.mjs
git commit -m "feat(practica): tiposPendientes — escalera de cobertura por tipo (SP-4d)"
```

---

### Task 3: Reescribir `elegirEjercicios` (cobertura + adaptiva)

**Files:**
- Modify: `web/lib/practica.ts:23-25` (la función actual)
- Test: `tests/unit/practica.test.mjs` (actualizar los tests viejos de `elegirEjercicios`)

**Interfaces:**
- Consumes: `nivelAdaptativo`, `tiposPendientes`, `ORDEN_TIPO`, `HistorialEjercicio` (Tasks 1–2).
- Produces: `export function elegirEjercicios(pool: Ejercicio[], historial?: HistorialEjercicio[], max?: number): Ejercicio[]` — **firma nueva**: el 2º parámetro pasa a ser `historial` (default `[]`) y `max` pasa a 3º (default 8). Prioriza tipos pendientes; dentro de eso, dificultad cercana al nivel adaptativo; desempata determinístico.

- [ ] **Step 1: Update the failing test**

En `tests/unit/practica.test.mjs`, reemplazá el/los test(s) viejos de `elegirEjercicios` por estos (el viejo asumía sort puro por dificultad y firma `(pool, max)` — cambió):

```js
import { elegirEjercicios } from '../../web/lib/practica.ts';

const ej = (id, tipo, dif) => ({ id, enunciado: '', opciones: [], correcta: '', dificultad: dif, tipo });

test('elegirEjercicios sin historia: arranca por reconocer fácil (cobertura + nivel mínimo)', () => {
  const pool = [ej('p', 'producir', 3), ej('r', 'reconocer', 1), ej('c', 'completar', 2)];
  const out = elegirEjercicios(pool, [], 3);
  assert.equal(out[0].id, 'r'); // reconocer es el primer tipo pendiente, dif cercana al nivel min
});

test('elegirEjercicios: si ya domina reconocer, prioriza el próximo tipo pendiente', () => {
  const pool = [ej('r', 'reconocer', 1), ej('c', 'completar', 2), ej('p', 'producir', 3)];
  const historia = [ft('reconocer', 1)]; // reconocer ya cubierto
  const out = elegirEjercicios(pool, historia, 3);
  assert.notEqual(out[0].tipo, 'reconocer'); // ya no lo prioriza
});

test('elegirEjercicios: determinístico — mismo input, mismo orden', () => {
  const pool = [ej('b', 'reconocer', 2), ej('a', 'reconocer', 2)];
  assert.deepEqual(
    elegirEjercicios(pool, [], 2).map((x) => x.id),
    elegirEjercicios(pool, [], 2).map((x) => x.id),
  );
});

test('elegirEjercicios: corta en max', () => {
  const pool = [ej('a', 'reconocer', 1), ej('b', 'completar', 1), ej('c', 'ordenar', 1)];
  assert.equal(elegirEjercicios(pool, [], 2).length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `elegirEjercicios` todavía ordena solo por dificultad y/o trata el 2º arg como `max`; los nuevos asserts de prioridad por tipo fallan.

- [ ] **Step 3: Write the new implementation**

En `web/lib/practica.ts`, reemplazá la función `elegirEjercicios` actual (líneas ~23-25) por:

```ts
// Sirve hasta `max` ejercicios del pool, personalizados a la historia del chico en el nodo:
// (1) ESCALERA DE COBERTURA: prioriza los tipos que le faltan demostrar (reconocer→producir).
// (2) DIFICULTAD ADAPTATIVA: dentro de eso, acerca la dificultad al nivel adaptativo (sube si
//     viene acertando, baja si falla). Determinístico (tests estables): desempata por dificultad e id.
export function elegirEjercicios(pool: Ejercicio[], historial: HistorialEjercicio[] = [], max = 8): Ejercicio[] {
  const nivel = nivelAdaptativo(historial, pool);
  const pendientes = tiposPendientes(historial);
  const prioridadTipo = (t: string) => {
    const i = pendientes.indexOf(t);
    return i === -1 ? ORDEN_TIPO.length : i; // pendientes primero, en orden de demanda
  };
  return [...pool]
    .sort(
      (a, b) =>
        prioridadTipo(a.tipo) - prioridadTipo(b.tipo) ||
        Math.abs(a.dificultad - nivel) - Math.abs(b.dificultad - nivel) ||
        a.dificultad - b.dificultad ||
        a.id.localeCompare(b.id),
    )
    .slice(0, max);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — todo `practica.test.mjs` en verde (helpers + `elegirEjercicios`).

- [ ] **Step 5: Commit**

```bash
git add web/lib/practica.ts tests/unit/practica.test.mjs
git commit -m "feat(practica): elegirEjercicios personalizado — cobertura + dificultad adaptativa (SP-4d)"
```

---

### Task 4: Cablear la historia en la página de práctica

**Files:**
- Modify: `web/app/alumno/[programaId]/practicar/page.tsx:38-50` (el `useEffect` que carga ejercicios) y el `import` de `practica`.

**Interfaces:**
- Consumes: `elegirEjercicios(pool, historial, max)` (Task 3), tipo `HistorialEjercicio`.
- Produces: nada nuevo exportado; la página ahora sirve ejercicios según la historia del chico en el nodo.

> Antes de tocar la página, leé la guía de data-fetching en `web/node_modules/next/dist/docs/` (web/AGENTS.md). Esta es una página cliente (`'use client'`) que ya usa el cliente JS de Supabase; seguimos ese patrón.

- [ ] **Step 1: Update the import**

En `web/app/alumno/[programaId]/practicar/page.tsx` línea 11, agregá `type HistorialEjercicio`:

```ts
import { elegirEjercicios, resumen, type Ejercicio, type RespuestaReg, type HistorialEjercicio } from '@/lib/practica';
```

- [ ] **Step 2: Fetch la ventana reciente antes de servir**

Reemplazá el cuerpo del `useEffect` de carga (líneas ~40-48) por esto — agrega el fetch de las últimas 8 respuestas del chico en ese nodo y se las pasa a `elegirEjercicios`:

```ts
    (async () => {
      const { data: nodo } = await supabase.from('nodo').select('nombre').eq('id', nodoId).single();
      setNodoNombre((nodo as { nombre?: string } | null)?.nombre || '');
      const { data } = await supabase
        .from('ejercicio')
        .select('id,enunciado,opciones,correcta,dificultad,tipo')
        .eq('nodo_id', nodoId);

      // Historia reciente del chico en el nodo (más reciente primero) → escalera + adaptiva.
      let historial: HistorialEjercicio[] = [];
      if (me) {
        const { data: win } = await supabase
          .from('respuesta')
          .select('correcta, reintentos, created_at, ejercicio:ejercicio_id!inner(tipo,dificultad), sesion:sesion_id!inner(alumno_id,nodo_id)')
          .eq('sesion.nodo_id', nodoId)
          .eq('sesion.alumno_id', me.id)
          .order('created_at', { ascending: false })
          .limit(8);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        historial = ((win as any[]) || []).map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo, dificultad: x.ejercicio?.dificultad }));
      }
      setEjercicios(elegirEjercicios((data as Ejercicio[]) || [], historial));
    })();
```

Y agregá `me` a las deps del `useEffect` (línea ~50) para que recargue cuando el alumno esté listo:

```ts
  }, [nodoId, me]);
```

- [ ] **Step 3: Verificación manual del build/tipos**

Run: `cd web && npx tsc --noEmit`
Expected: sin errores de tipo en `practicar/page.tsx` (el import de `HistorialEjercicio` y el `.map` tipan bien).

> Esta tarea es cableado de UI sobre lógica ya unit-testeada (Tasks 1–3); su red de seguridad automatizada es la cobertura de `elegirEjercicios`. La verificación end-to-end (un chico practica y el set se adapta) va en el smoke manual del cierre (Task 9).

- [ ] **Step 4: Commit**

```bash
git add web/app/alumno/[programaId]/practicar/page.tsx
git commit -m "feat(practica): servir ejercicios según la historia del chico en el nodo (SP-4d)"
```

---

## Slice SP-4e — Override docente del estado

### Task 5: Migración — columna `estado_override` + RLS docente

**Files:**
- Create: `supabase/migrations/0010_alumno_nodo_override.sql`

**Interfaces:**
- Produces: columna `alumno_nodo.estado_override boolean not null default false`; policies `alumno_nodo_docente_update` y `alumno_nodo_docente_insert` (la docente escribe el `alumno_nodo` de **sus** alumnos vía `es_mi_alumno`). Las policies viejas del alumno-dueño siguen vigentes (permisivas → se suman con OR).

- [ ] **Step 1: Escribir la migración**

Creá `supabase/migrations/0010_alumno_nodo_override.sql`:

```sql
-- 0010: Override docente del estado del nodo (Etapa 3 / SP-4e, spec evaluacion-y-dominio-de-nodos D6).
-- La docente puede FIJAR el estado de un nodo a mano; la regla determinística lo respeta
-- (no lo pisa en el próximo cierre de sesión). Marca cuál alumno_nodo está fijado.

alter table alumno_nodo
  add column if not exists estado_override boolean not null default false;

-- La docente puede escribir el alumno_nodo de SUS alumnos (es_mi_alumno). Se suma (OR) a la
-- policy del alumno-dueño ya existente (0002). No ensancha: solo sus propios alumnos.
create policy alumno_nodo_docente_update on alumno_nodo for update to authenticated
  using (es_mi_alumno(alumno_id)) with check (es_mi_alumno(alumno_id));
create policy alumno_nodo_docente_insert on alumno_nodo for insert to authenticated
  with check (es_mi_alumno(alumno_id));
```

- [ ] **Step 2: Aplicar la migración**

Run (CLI local, si está el stack levantado): `cd /Users/ignacio/Edutiaar && supabase db push`
— o, si trabajás contra el proyecto remoto vía MCP, aplicá el mismo SQL con `apply_migration` (name: `0010_alumno_nodo_override`).
Expected: migración aplicada sin error; `alumno_nodo` ahora tiene `estado_override`.

- [ ] **Step 3: Verificar columna y policies**

Run: `supabase db push` ya validó el SQL. Verificá con una consulta:
```sql
select column_name from information_schema.columns where table_name='alumno_nodo' and column_name='estado_override';
select policyname from pg_policies where tablename='alumno_nodo' order by policyname;
```
Expected: aparece `estado_override`; entre las policies están `alumno_nodo_docente_update` y `alumno_nodo_docente_insert`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_alumno_nodo_override.sql
git commit -m "feat(db): alumno_nodo.estado_override + RLS docente para override (SP-4e)"
```

---

### Task 6: Helper puro `resolverEstado` (la regla respeta el override)

**Files:**
- Modify: `web/lib/dominio.ts`
- Test: `tests/unit/dominio.test.mjs`

**Interfaces:**
- Consumes: `EstadoNodo`, el `{ estado, puntaje }` que ya devuelve `calcularEstado`.
- Produces: `export function resolverEstado(calculo: { estado: EstadoNodo; puntaje: number }, override: boolean, estadoManual: EstadoNodo): { estado: EstadoNodo; puntaje: number }` — si `override`, devuelve el `estadoManual` (conserva el `puntaje` calculado para el gradiente); si no, devuelve el `calculo` tal cual.

- [ ] **Step 1: Write the failing test**

Agregá a `tests/unit/dominio.test.mjs` (sumá `resolverEstado` al import de `dominio.ts`):

```js
import { resolverEstado } from '../../web/lib/dominio.ts';

test('resolverEstado: sin override devuelve el cálculo de la regla', () => {
  const calculo = { estado: 'en_construccion', puntaje: 40 };
  assert.deepEqual(resolverEstado(calculo, false, 'dominado'), calculo);
});

test('resolverEstado: con override gana el estado manual de la docente, pero conserva el puntaje', () => {
  const calculo = { estado: 'a_reforzar', puntaje: 55 };
  assert.deepEqual(resolverEstado(calculo, true, 'dominado'), { estado: 'dominado', puntaje: 55 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `resolverEstado` no existe.

- [ ] **Step 3: Write minimal implementation**

En `web/lib/dominio.ts`, al final del archivo:

```ts
// Override docente (D6): si la seño fijó el estado a mano, la regla lo respeta — devuelve el
// estado manual y conserva el puntaje calculado (sigue alimentando el gradiente del mapa).
export function resolverEstado(
  calculo: { estado: EstadoNodo; puntaje: number },
  override: boolean,
  estadoManual: EstadoNodo,
): { estado: EstadoNodo; puntaje: number } {
  return override ? { estado: estadoManual, puntaje: calculo.puntaje } : calculo;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — los 2 tests nuevos en verde.

- [ ] **Step 5: Commit**

```bash
git add web/lib/dominio.ts tests/unit/dominio.test.mjs
git commit -m "feat(dominio): resolverEstado — la regla respeta el override docente (SP-4e)"
```

---

### Task 7: Respetar el override al cerrar sesión

**Files:**
- Modify: `web/app/alumno/[programaId]/practicar/page.tsx:77-84` (lectura de `alumno_nodo` + upsert dentro de `guardarSesion`)

**Interfaces:**
- Consumes: `resolverEstado` (Task 6), columna `estado_override` (Task 5).
- Produces: nada nuevo; el cierre de sesión ahora no pisa el estado si está fijado.

- [ ] **Step 1: Update el import de dominio**

En `web/app/alumno/[programaId]/practicar/page.tsx` línea 12:

```ts
import { calcularEstado, resolverEstado, type EstadoNodo } from '@/lib/dominio';
```

- [ ] **Step 2: Leer el override y aplicarlo antes del upsert**

Reemplazá las líneas que leen `alumno_nodo` y hacen el upsert (≈ 77-84) por:

```ts
      const { data: an } = await supabase.from('alumno_nodo').select('estado, estado_override').eq('alumno_id', me.id).eq('nodo_id', nodoId).maybeSingle();
      const previo = an as { estado?: EstadoNodo; estado_override?: boolean } | null;
      const tasa = r.total ? r.aciertos / r.total : 0;
      const calculo = calcularEstado(ventana, tasa, previo?.estado || 'no_empezado');
      const res = resolverEstado(calculo, previo?.estado_override ?? false, previo?.estado || 'no_empezado');
      await supabase.from('alumno_nodo').upsert(
        { alumno_id: me.id, nodo_id: nodoId, estado: res.estado, puntaje: res.puntaje, actualizado_at: new Date().toISOString() },
        { onConflict: 'alumno_id,nodo_id' },
      );
      setNuevoEstado(res.estado);
```

> El upsert **no** toca `estado_override` (lo maneja solo la docente en Task 8), así que el flag sobrevive a los cierres de sesión.

- [ ] **Step 3: Verificación de tipos**

Run: `cd web && npx tsc --noEmit`
Expected: sin errores; `resolverEstado` tipa con `{ estado, puntaje }`.

- [ ] **Step 4: Commit**

```bash
git add web/app/alumno/[programaId]/practicar/page.tsx
git commit -m "feat(practica): el cierre de sesión respeta el override docente (SP-4e)"
```

---

### Task 8: Control de override en el detalle del alumno (docente)

**Files:**
- Modify: `web/app/docente/[alumnoId]/page.tsx`

**Interfaces:**
- Consumes: policy `alumno_nodo_docente_update`/`_insert` y columna `estado_override` (Task 5).
- Produces: en cada fila de nodo, un `<select>` que fija el estado (`estado_override = true`) o lo devuelve a automático (`estado_override = false`).

> Leé la guía de Client Components / event handlers en `web/node_modules/next/dist/docs/` antes de tocar (web/AGENTS.md). La página ya es cliente.

- [ ] **Step 1: Traer `nodo_id` y `estado_override` en el fetch**

En el `useEffect`, ampliá el select y el tipo de fila. Cambiá el tipo `NodoEstado` (línea ~15) y el fetch de `alumno_nodo` (≈ 44-49):

```ts
type NodoEstado = { nodo_id: string; estado: string; override: boolean; nombre: string };
```

```ts
      const { data: an } = await supabase
        .from('alumno_nodo')
        .select('nodo_id, estado, estado_override, nodo:nodo_id(nombre)')
        .eq('alumno_id', alumnoId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNodos(((an as any[]) || []).map((r) => ({ nodo_id: r.nodo_id, estado: r.estado, override: r.estado_override, nombre: r.nodo?.nombre ?? 'Nodo' })));
```

- [ ] **Step 2: Handler para fijar/auto el estado**

Agregá dentro del componente (antes del `return`):

```ts
  async function fijarEstado(nodoId: string, valor: string) {
    // valor 'auto' = devolver a la regla; cualquier otro = override docente
    const override = valor !== 'auto';
    const estado = override ? valor : (nodos.find((n) => n.nodo_id === nodoId)?.estado ?? 'no_empezado');
    await supabase.from('alumno_nodo').upsert(
      { alumno_id: alumnoId, nodo_id: nodoId, estado, estado_override: override },
      { onConflict: 'alumno_id,nodo_id' },
    );
    setNodos((prev) => prev.map((n) => (n.nodo_id === nodoId ? { ...n, estado, override } : n)));
  }
```

- [ ] **Step 3: Render del control en cada fila**

En el `.map` de nodos (≈ 85-91), agregá el `<select>` después del label del estado:

```tsx
            {nodos.map((n) => (
              <div key={n.nodo_id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 14, padding: '10px 14px' }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: estadoColor(n.estado), flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: QUICK, fontWeight: 700, color: '#3A332A' }}>{n.nombre}</span>
                <span style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>{ESTADO_LABEL[n.estado] ?? n.estado}{n.override ? ' ·fijado' : ''}</span>
                <select
                  value={n.override ? n.estado : 'auto'}
                  onChange={(e) => fijarEstado(n.nodo_id, e.target.value)}
                  style={{ fontFamily: NUNITO, fontWeight: 700, fontSize: 13, color: '#3A332A', border: '1.5px solid #EFE3CE', borderRadius: 10, padding: '4px 8px', background: '#FBF4E6' }}
                  aria-label={`Fijar estado de ${n.nombre}`}
                >
                  <option value="auto">Auto (según práctica)</option>
                  <option value="no_empezado">Sin empezar</option>
                  <option value="en_construccion">En camino</option>
                  <option value="a_reforzar">A reforzar</option>
                  <option value="dominado">Lo domina</option>
                </select>
              </div>
            ))}
```

- [ ] **Step 4: Verificación de tipos + manual**

Run: `cd web && npx tsc --noEmit`
Expected: sin errores.
Manual (en el smoke de Task 9): la seño abre el detalle de un alumno, fija un nodo en "Lo domina", recarga → sigue fijado; lo vuelve a "Auto" → vuelve a regir la regla en la próxima práctica.

- [ ] **Step 5: Commit**

```bash
git add web/app/docente/[alumnoId]/page.tsx
git commit -m "feat(docente): override del estado de nodo desde el detalle del alumno (SP-4e)"
```

---

### Task 9: Test de integración RLS del override + smoke del loop

**Files:**
- Create: `tests/integration/override-docente.test.mjs`

**Interfaces:**
- Consumes: policies de Task 5. Patrón de los tests existentes en `tests/integration/` (cliente service-role para sembrar/limpiar; cliente anon/usuario para probar la policy). Mirá `tests/integration/dominio.test.mjs` y `security.test.mjs` como molde.

- [ ] **Step 1: Escribir el test idempotente**

Creá `tests/integration/override-docente.test.mjs` siguiendo el molde de `tests/integration/dominio.test.mjs` (mismos envs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; crea su propia escuela/docente/alumno/nodo efímeros y los borra en un `after`). El test debe verificar:

```js
// Pseudocontrato del test (adaptar al molde real de dominio.test.mjs):
// 1. Sembrar (service role): escuela, docente D, alumno A (de D), nodo N, alumno_nodo(A,N) estado 'en_construccion'.
// 2. Como docente D (sesión autenticada): upsert alumno_nodo(A,N) { estado:'dominado', estado_override:true } → OK.
//    assert: la fila quedó estado='dominado', estado_override=true.
// 3. Como un SEGUNDO docente X (no dueño de A): el mismo upsert → debe FALLAR/0 filas (RLS lo bloquea).
// 4. Limpiar todo lo sembrado en un after().
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test:db`
Expected: PASS — la docente dueña puede fijar el estado; el tercero no. Sin residuos en la DB.

- [ ] **Step 3: Smoke manual del loop completo**

Con el stack/Vercel andando, recorré el loop end-to-end (mismas credenciales del ROADMAP):
1. Alumno (aula `CERRO-3A`, PIN de seed) practica un nodo → al avanzar acertando seguido, el set siguiente debe traer tipos más exigentes / dificultad más alta (escalera + adaptiva).
2. Al cerrar, el mapa cambia de color solo.
3. La seño (`ana@edutia.ar` / `edutia123`) abre el detalle del alumno → fija ese nodo en otro estado → recarga, sigue fijado → el alumno vuelve a practicar y el estado fijado NO se pisa.
4. La seño lo vuelve a "Auto" → la próxima práctica vuelve a regir la regla.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/override-docente.test.mjs
git commit -m "test(override): RLS — la docente fija el estado de su alumno, un tercero no (SP-4e)"
```

---

### Task 10: Cerrar Etapa 3 en los docs

**Files:**
- Modify: `docs/ROADMAP.md` (Etapa 3 y bloque Fase 2 SOL)
- Modify: `CLAUDE.md` (sección "Estado actual")
- Modify: memoria `fase2-estado.md` si corresponde

- [ ] **Step 1: Marcar Etapa 3 completa en ROADMAP**

En `docs/ROADMAP.md`, tildá los 5 items de "Etapa 3" (incluido "Dificultad adaptativa") y agregá una línea de slice nueva en el bloque Fase 2 SOL:

```markdown
- [x] **SP-4d — Selección adaptiva + cobertura.** `elegirEjercicios` usa la historia del chico: escalera de cobertura por tipo (`reconocer`→`producir`) + dificultad adaptativa. Cierra el último checkbox de Etapa 3.
- [x] **SP-4e — Override docente.** La seño fija el estado de un nodo a mano (`alumno_nodo.estado_override`, migración `0010`); la regla lo respeta. UI en `/docente/[alumnoId]`.
```

Y actualizá la línea de estado (≈ línea 5-7) para reflejar **Etapa 3 cerrada**.

- [ ] **Step 2: Actualizar CLAUDE.md**

En la sección "Estado actual" de `CLAUDE.md`, sumá SP-4d/SP-4e y la migración `0010`; sacá "override docente del estado" de los pendientes de Fase 2 y "dificultad adaptativa" de lo que falte. Dejá explícito que sigue el **modo mock** (falta API key) como único blocker grande restante.

- [ ] **Step 3: Verificar tests verdes en frío**

Run: `npm test && npm run test:db`
Expected: todo verde (unit + integración). No commitear si hay rojo.

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md CLAUDE.md
git commit -m "docs: Etapa 3 cerrada — SP-4d selección adaptiva + SP-4e override docente"
```

---

## Self-Review

**1. Spec coverage** (`2026-06-28-evaluacion-y-dominio-de-nodos.md` + ROADMAP Etapa 3):
- ROADMAP E3 item "Dificultad adaptativa (sube si acierta, baja si falla)" → Tasks 1, 3, 4. ✅
- Spec "Servir ejercicios (la escalera)" — empujar hacia formatos/dificultades sin cubrir → Tasks 2, 3, 4. ✅
- Spec D6 "Override de la docente" → Tasks 5–9. ✅
- ROADMAP E3 items 1/2/3/5 (corrige, sesión, regla nodo, mapa pinta) → ya construidos (SP-4a/b/c); no se re-implementan, sí se preservan (Task 7 mantiene el upsert; Task 9 smoke). ✅
- Spec D5 "a_reforzar nunca retrocede" / "dominado sticky" → intacto: Task 7 sigue pasando `estadoActual` a `calcularEstado`. ✅
- **Fuera de alcance, declarado:** decaimiento temporal / repaso espaciado (spec aparte, Fase 2); generador IA real + diagnóstico real (bloqueados por API key — modo mock). No están en este plan a propósito.

**2. Placeholder scan:** sin TBD/TODO; todo step de código trae el código; el único pseudocódigo es el *contrato* del test de integración (Task 9 Step 1), que remite al molde real `dominio.test.mjs` existente — intencional, porque el andamiaje de sembrado/limpieza se copia del molde del repo, no se inventa.

**3. Type consistency:**
- `HistorialEjercicio` (Task 1) usado igual en Tasks 3 y 4. ✅
- `nivelAdaptativo(historial, pool)` y `tiposPendientes(historial)` — firmas idénticas donde se llaman. ✅
- `elegirEjercicios(pool, historial?, max?)` — nueva firma respetada en Task 4 (call con 2 args) y tests Task 3. ✅
- `resolverEstado(calculo, override, estadoManual)` (Task 6) llamado igual en Task 7. ✅
- `estado_override` (col, Task 5) leída/escrita consistente en Tasks 7 y 8. ✅
