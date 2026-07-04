# Puntaje progresivo, sin repetidos y generación por banda — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la spec `docs/superpowers/specs/2026-07-03-puntaje-progresivo-y-generacion-por-banda.md`: motor de puntaje ELO-lite 0→100 por nodo, estados derivados con hito pegajoso (dominar exige ≥50 ejercicios), regla "nunca repetir un ejercicio a un chico", reposición automática del pool con tope diario, y generación de ejercicios por banda de grado.

**Architecture:** La lógica nueva es PURA y vive en `web/lib/dominio.ts` (motor + estados), `web/lib/practica.ts` (filtro de vistos) y `supabase/functions/generador-ejercicios/generar.ts` (bandas, estratos, mock) — todo unit-testeable con Node nativo. La página Practicar orquesta (replay del motor al cerrar sesión, filtro al cargar, disparo de reposición). Una Edge Function nueva `generador-ejercicios` genera pool inicial y lotes de reposición (mock por defecto; Claude real detrás del flag, key solo server-side).

**Tech Stack:** Next.js App Router + TypeScript (`web/`), Supabase (Postgres + Edge Functions Deno), tests `node --test` (Node ≥ 23, importa `.ts` directo).

## Global Constraints

- UI y textos en español rioplatense, cálido, para chicos. SOL nunca castiga.
- Tablas/columnas en `snake_case`.
- API key de Claude SOLO server-side (Edge Function). Nunca en el front.
- SOL genera; la app corrige (Regla 2). Pool en lotes, nunca un llamado a la API por click (Regla 3). Tope de uso (Regla 4).
- RLS intacta; no recolectar datos personales nuevos de menores (Regla 5).
- Tests por feature obligatorios; no commitear en rojo. Unit: `npm test` (raíz). Integración: `npm run test:db` (necesita envs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; idempotentes).
- Constantes de la spec: `K_ELO=8`, escala ELO `40`, bajar resta la mitad, `UMBRAL_DOMINIO=70`, `MIN_EJERCICIOS_DOMINIO=50`, pool inicial 3 por celda (36), lote de reposición 12, gatillo reposición < 16 sin ver, tope diario 20 lotes (240 ejercicios).
- Migraciones: la próxima es `0012` (la `0011` ya existe). `alumno_nodo.puntaje` YA existe (numeric, default 0): no crear.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `web/lib/dominio.ts` | Modificar | Motor ELO-lite + estados derivados. Muere la regla de ventana (`calcularEstado`, `puntajeNodo`, `VENTANA`, `MIN_DOMINIO`, `peso`). Queda `resolverEstado` (override). |
| `web/lib/practica.ts` | Modificar | `filtrarNoVistos` + umbral de reposición. `elegirEjercicios` no cambia. |
| `web/app/alumno/[programaId]/practicar/page.tsx` | Modificar | Cargar historial completo (vistos + ventana), filtrar pool, replay del motor al cerrar sesión, disparo de reposición, copy de pool agotado. |
| `supabase/functions/generador-ejercicios/generar.ts` | Modificar | Bandas de grado, celdas/estratos, lote priorizado por escasez, mock determinístico sin repetidos. |
| `supabase/functions/generador-ejercicios/index.ts` | Crear | Edge Function: pool inicial (docente) y reposición (alumno/docente), tope diario, mock default. |
| `supabase/migrations/0012_ejercicio_created_at.sql` | Crear | `created_at` en `ejercicio` para el tope diario. |
| `web/app/docente/autoria/page.tsx` | Modificar | Al publicar: generar pool inicial + copy "SOL está preparando…". |
| `web/lib/mapa-layout.ts` + `web/app/alumno/[programaId]/mapa/page.tsx` | Modificar | Gradiente del mapa por puntaje. |
| `tests/unit/dominio.test.mjs`, `tests/unit/practica.test.mjs`, `tests/unit/generar-ejercicios.test.mjs`, `tests/unit/mapa-layout.test.mjs` | Modificar | Tests de toda la lógica pura. |
| `tests/integration/generador-ejercicios.test.mjs` | Crear | Function end-to-end en mock + RLS. |
| `CLAUDE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md` | Modificar | Registrar el cambio. |

---

### Task 1: Motor ELO-lite en `web/lib/dominio.ts`

**Files:**
- Modify: `web/lib/dominio.ts`
- Test: `tests/unit/dominio.test.mjs`

**Interfaces:**
- Consumes: tipos existentes `RespuestaEval`, helper interno `esPrimerIntento` (`web/lib/dominio.ts:16`).
- Produces (Task 2 y 4 dependen de esto, firmas exactas):
  - `pesoTipo(tipo: string): number` — producir 2, ordenar 1.5, resto 1.
  - `esperado(puntaje: number, dificultad: number): number` — probabilidad 0..1.
  - `aplicarRespuesta(puntaje: number, r: RespuestaEval): number` — un paso del motor.
  - `puntajeSesion(inicial: number, cronologicas: RespuestaEval[]): number` — fold, redondeado a 2 decimales.
  - Constantes exportadas: `K_ELO = 8`, `ESCALA_ELO = 40`, `DIVISOR_BAJA = 2`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/unit/dominio.test.mjs` (sin tocar los tests viejos todavía; se retiran en la Task 4):

```js
import { pesoTipo, esperado, aplicarRespuesta, puntajeSesion, K_ELO } from '../../web/lib/dominio.ts';

test('esperado: con puntaje 0 casi no se espera acertar lo difícil', () => {
  assert.ok(esperado(0, 3) < 0.02); // nivel 75, 10^(75/40) enorme
  assert.ok(esperado(0, 1) > 0.15 && esperado(0, 1) < 0.3); // fácil: algo se espera
});

test('esperado: con puntaje alto lo fácil es casi seguro', () => {
  assert.ok(esperado(90, 1) > 0.95);
});

test('aplicarRespuesta: acertar difícil a nivel bajo suma mucho; fácil a nivel alto casi nada', () => {
  const saltoDificil = aplicarRespuesta(30, r(true, 0, 'producir', 3)) - 30;
  const saltoFacil = aplicarRespuesta(90, r(true, 0, 'reconocer', 1)) - 90;
  assert.ok(saltoDificil > 10, `esperaba > 10, dio ${saltoDificil}`); // K=8 × peso 2 × (~0.93)
  assert.ok(saltoFacil < 0.5, `esperaba < 0.5, dio ${saltoFacil}`);
});

test('aplicarRespuesta: asimetría — fallar resta la mitad de lo que sumaría acertar', () => {
  // A puntaje 50 con ejercicio de su nivel (dif 2 → nivel 50): esperado = 0.5.
  const sube = aplicarRespuesta(50, r(true, 0, 'reconocer', 2)) - 50; // +K×0.5
  const baja = 50 - aplicarRespuesta(50, r(false, 1, 'reconocer', 2)); // K×0.5/2
  assert.ok(Math.abs(sube - K_ELO * 0.5) < 0.01);
  assert.ok(Math.abs(baja - (K_ELO * 0.5) / 2) < 0.01);
});

test('aplicarRespuesta: acertar con reintentos mueve como fallo del primer intento (baja)', () => {
  const conReintento = aplicarRespuesta(50, r(true, 2, 'reconocer', 2));
  const falloSeco = aplicarRespuesta(50, r(false, 1, 'reconocer', 2));
  assert.equal(conReintento, falloSeco); // el primer intento falló en ambos
  assert.ok(conReintento < 50);
});

test('aplicarRespuesta: clamp a [0, 100]', () => {
  assert.equal(aplicarRespuesta(0, r(false, 1, 'reconocer', 1)), 0);
  assert.ok(aplicarRespuesta(99.9, r(true, 0, 'producir', 3)) <= 100);
});

test('puntajeSesion: replay determinístico en orden cronológico, redondeo a 2 decimales', () => {
  const rs = [r(true, 0, 'reconocer', 1), r(true, 0, 'completar', 2), r(false, 1, 'reconocer', 1)];
  const paso1 = aplicarRespuesta(0, rs[0]);
  const paso2 = aplicarRespuesta(paso1, rs[1]);
  const paso3 = aplicarRespuesta(paso2, rs[2]);
  assert.equal(puntajeSesion(0, rs), Math.round(paso3 * 100) / 100);
  assert.equal(puntajeSesion(0, []), 0); // sin respuestas, no se mueve
});

test('pesoTipo: producir 2, ordenar 1.5, resto 1', () => {
  assert.equal(pesoTipo('producir'), 2);
  assert.equal(pesoTipo('ordenar'), 1.5);
  assert.equal(pesoTipo('reconocer'), 1);
  assert.equal(pesoTipo('completar'), 1);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'aplicarRespuesta'` (o similar).

- [ ] **Step 3: Implementar el motor**

Agregar a `web/lib/dominio.ts` (después de `esPrimerIntento`, línea 16; NO tocar `peso`, `puntajeNodo` ni `calcularEstado` todavía):

```ts
// ── Motor ELO-lite (spec 2026-07-03-puntaje-progresivo) ───────────────────────
// El puntaje del nodo (0..100) se mueve con cada PRIMER intento: acertar algo
// más difícil que tu nivel suma mucho; acertar lo fácil casi nada; bajar resta
// la mitad (asimetría pro-motivación, DP3). Determinístico, sin IA (DP1).

export const K_ELO = 8; // paso base
export const ESCALA_ELO = 40; // sensibilidad de lo "esperado"
export const DIVISOR_BAJA = 2; // bajar cuesta la mitad que subir

// Peso por tipo (producir y ordenar valen más). La dificultad NO entra acá:
// ya entra vía `esperado` (si no, contaría doble).
export function pesoTipo(tipo: string): number {
  return tipo === 'producir' ? 2 : tipo === 'ordenar' ? 1.5 : 1;
}

// Probabilidad esperada de acertar al primer intento, según puntaje vs dificultad.
export function esperado(puntaje: number, dificultad: number): number {
  const nivel = dificultad * 25; // 1→25, 2→50, 3→75
  return 1 / (1 + Math.pow(10, (nivel - puntaje) / ESCALA_ELO));
}

// Un paso del motor. Solo el primer intento cuenta: acierto limpio = 1, el resto = 0
// (si acertó con reintentos, el primer intento igual falló).
export function aplicarRespuesta(puntaje: number, r: RespuestaEval): number {
  const resultado = esPrimerIntento(r) ? 1 : 0;
  let delta = K_ELO * pesoTipo(r.tipo) * (resultado - esperado(puntaje, r.dificultad));
  if (delta < 0) delta = delta / DIVISOR_BAJA;
  return Math.min(100, Math.max(0, puntaje + delta));
}

// Replay de una sesión completa (en orden cronológico) sobre el puntaje persistido.
export function puntajeSesion(inicial: number, cronologicas: RespuestaEval[]): number {
  const fin = cronologicas.reduce((p, r) => aplicarRespuesta(p, r), inicial);
  return Math.round(fin * 100) / 100;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (todos, incluidos los viejos de la regla de ventana que siguen vivos).

- [ ] **Step 5: Commit**

```bash
git add web/lib/dominio.ts tests/unit/dominio.test.mjs
git commit -m "feat: motor ELO-lite de puntaje progresivo por nodo"
```

---

### Task 2: Estados derivados con hito pegajoso y mínimo 50

**Files:**
- Modify: `web/lib/dominio.ts`
- Test: `tests/unit/dominio.test.mjs`

**Interfaces:**
- Consumes: `EstadoNodo`, `RespuestaEval`, `esPrimerIntento`, `PISO_REFORZAR`, `MIN_PRODUCIR`, `DIF_DIFICIL` (ya existen en `web/lib/dominio.ts`).
- Produces (Task 4 depende, firmas exactas):
  - `UMBRAL_DOMINIO = 70`, `MIN_EJERCICIOS_DOMINIO = 50` (exportadas).
  - `coberturaHistorica(todas: RespuestaEval[]): { producir: number; dificil: number }` — aciertos al primer intento, histórico completo.
  - `dosUltimasMal(cronologicas: RespuestaEval[]): boolean` — señal de la sesión.
  - `calcularEstadoProgresivo(args: { puntaje: number; totalRespondidos: number; cobertura: { producir: number; dificil: number }; dosUltimasMal: boolean; tasaSesion: number; estadoActual?: EstadoNodo }): EstadoNodo`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `tests/unit/dominio.test.mjs`:

```js
import { coberturaHistorica, dosUltimasMal, calcularEstadoProgresivo, UMBRAL_DOMINIO, MIN_EJERCICIOS_DOMINIO } from '../../web/lib/dominio.ts';

const base = { puntaje: 75, totalRespondidos: 55, cobertura: { producir: 3, dificil: 2 }, dosUltimasMal: false, tasaSesion: 0.9, estadoActual: 'en_construccion' };

test('estado: dominado con puntaje, cobertura y 50+ ejercicios', () => {
  assert.equal(calcularEstadoProgresivo(base), 'dominado');
});

test('estado: sin 50 ejercicios NO domina aunque sobre puntaje', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, totalRespondidos: 49 }), 'en_construccion');
  assert.equal(calcularEstadoProgresivo({ ...base, totalRespondidos: MIN_EJERCICIOS_DOMINIO }), 'dominado');
});

test('estado: sin cobertura NO domina (2 producir y 1 difícil al primer intento)', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, cobertura: { producir: 1, dificil: 2 } }), 'en_construccion');
  assert.equal(calcularEstadoProgresivo({ ...base, cobertura: { producir: 2, dificil: 0 } }), 'en_construccion');
});

test('estado: bajo el umbral de puntaje NO domina', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: UMBRAL_DOMINIO - 1 }), 'en_construccion');
});

test('estado: dominado es pegajoso — no baja aunque el puntaje caiga', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: 20, estadoActual: 'dominado', dosUltimasMal: true, tasaSesion: 0.1 }), 'dominado');
});

test('estado: a_reforzar por 2 fallos seguidos o sesión floja (si no domina)', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: 40, dosUltimasMal: true }), 'a_reforzar');
  assert.equal(calcularEstadoProgresivo({ ...base, puntaje: 40, tasaSesion: 0.4 }), 'a_reforzar');
});

test('estado: sin respuestas queda no_empezado', () => {
  assert.equal(calcularEstadoProgresivo({ ...base, totalRespondidos: 0, estadoActual: 'no_empezado' }), 'no_empezado');
});

test('coberturaHistorica: cuenta solo aciertos al primer intento', () => {
  const todas = [ft('producir', 3), ft('producir', 1), fail('producir', 3), ft('reconocer', 3)];
  assert.deepEqual(coberturaHistorica(todas), { producir: 2, dificil: 2 });
});

test('dosUltimasMal: mira las 2 últimas cronológicas', () => {
  assert.equal(dosUltimasMal([ft('reconocer', 1), fail('reconocer', 1), fail('reconocer', 1)]), true);
  assert.equal(dosUltimasMal([fail('reconocer', 1), fail('reconocer', 1), ft('reconocer', 1)]), false);
  assert.equal(dosUltimasMal([fail('reconocer', 1)]), false);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implementar**

Agregar a `web/lib/dominio.ts`:

```ts
// ── Estados derivados del puntaje (DP2) ───────────────────────────────────────
export const UMBRAL_DOMINIO = 70; // puntaje mínimo para dominar
export const MIN_EJERCICIOS_DOMINIO = 50; // constancia: ejercicios respondidos (DP4)

// Cobertura HISTÓRICA (todas las respuestas del chico en el nodo, no ventana):
// cuántos `producir` y cuántos difíciles acertó al primer intento.
export function coberturaHistorica(todas: RespuestaEval[]): { producir: number; dificil: number } {
  const limpios = todas.filter(esPrimerIntento);
  return {
    producir: limpios.filter((r) => r.tipo === 'producir').length,
    dificil: limpios.filter((r) => r.dificultad >= DIF_DIFICIL).length,
  };
}

// Señal "se está trabando AHORA": las 2 últimas respuestas de la sesión fallaron
// al primer intento. Recibe la sesión en orden cronológico.
export function dosUltimasMal(cronologicas: RespuestaEval[]): boolean {
  const n = cronologicas.length;
  if (n < 2) return false;
  return !esPrimerIntento(cronologicas[n - 1]) && !esPrimerIntento(cronologicas[n - 2]);
}

// Estado derivado del puntaje + señales. `dominado` es hito pegajoso (DP2):
// una vez alcanzado, solo lo tocan el override docente y el decaimiento (spec aparte).
export function calcularEstadoProgresivo(args: {
  puntaje: number;
  totalRespondidos: number;
  cobertura: { producir: number; dificil: number };
  dosUltimasMal: boolean;
  tasaSesion: number;
  estadoActual?: EstadoNodo;
}): EstadoNodo {
  const { puntaje, totalRespondidos, cobertura, estadoActual = 'no_empezado' } = args;
  if (estadoActual === 'dominado') return 'dominado'; // pegajoso
  if (totalRespondidos === 0) return 'no_empezado';
  const domina =
    puntaje >= UMBRAL_DOMINIO &&
    totalRespondidos >= MIN_EJERCICIOS_DOMINIO &&
    cobertura.producir >= MIN_PRODUCIR &&
    cobertura.dificil >= 1;
  if (domina) return 'dominado';
  if (args.dosUltimasMal || args.tasaSesion < PISO_REFORZAR) return 'a_reforzar';
  return 'en_construccion';
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/dominio.ts tests/unit/dominio.test.mjs
git commit -m "feat: estados derivados del puntaje con hito pegajoso y mínimo de 50 ejercicios"
```

---

### Task 3: Nunca repetir — filtro de vistos en `web/lib/practica.ts`

**Files:**
- Modify: `web/lib/practica.ts`
- Test: `tests/unit/practica.test.mjs`

**Interfaces:**
- Consumes: tipo `Ejercicio` (ya existe en `web/lib/practica.ts`).
- Produces (Task 4 y 7 dependen):
  - `UMBRAL_REPOSICION = 16` (exportada).
  - `filtrarNoVistos(pool: Ejercicio[], vistosIds: Iterable<string>): Ejercicio[]`.
  - `necesitaReposicion(noVistos: number): boolean` — `noVistos < UMBRAL_REPOSICION`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `tests/unit/practica.test.mjs`:

```js
import { filtrarNoVistos, necesitaReposicion, UMBRAL_REPOSICION } from '../../web/lib/practica.ts';

// helper local: ejercicio mínimo con id
const ejId = (id) => ({ id, enunciado: 'x', opciones: ['a', 'b'], correcta: 'a', dificultad: 1, tipo: 'reconocer' });

test('filtrarNoVistos: excluye lo ya respondido, conserva el resto y el orden', () => {
  const pool = [ejId('a'), ejId('b'), ejId('c')];
  assert.deepEqual(filtrarNoVistos(pool, ['b']).map((e) => e.id), ['a', 'c']);
  assert.deepEqual(filtrarNoVistos(pool, []).map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(filtrarNoVistos(pool, ['a', 'b', 'c']), []);
});

test('necesitaReposicion: dispara bajo el umbral', () => {
  assert.equal(necesitaReposicion(UMBRAL_REPOSICION), false);
  assert.equal(necesitaReposicion(UMBRAL_REPOSICION - 1), true);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implementar**

Agregar a `web/lib/practica.ts`:

```ts
// ── Nunca repetir (DP5) + gatillo de reposición (DP6) ─────────────────────────
// Un chico nunca vuelve a ver un ejercicio que ya respondió. El reintento
// inmediato dentro del ejercicio NO es repetición (es el mismo intento).

export const UMBRAL_REPOSICION = 16; // ~2 sesiones de margen sin ver

export function filtrarNoVistos(pool: Ejercicio[], vistosIds: Iterable<string>): Ejercicio[] {
  const vistos = new Set(vistosIds);
  return pool.filter((e) => !vistos.has(e.id));
}

export function necesitaReposicion(noVistos: number): boolean {
  return noVistos < UMBRAL_REPOSICION;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/practica.ts tests/unit/practica.test.mjs
git commit -m "feat: filtro de ejercicios nunca vistos y umbral de reposición"
```

---

### Task 4: Recablear Practicar al motor nuevo (y retirar la regla vieja)

**Files:**
- Modify: `web/app/alumno/[programaId]/practicar/page.tsx` (carga: líneas ~82-102; cierre: `guardarSesion`, líneas ~151-188; pantalla vacía: línea ~250)
- Modify: `web/lib/dominio.ts` (borrar regla vieja)
- Test: `tests/unit/dominio.test.mjs` (borrar tests de la regla vieja)

**Interfaces:**
- Consumes: Task 1 (`puntajeSesion`), Task 2 (`calcularEstadoProgresivo`, `coberturaHistorica`, `dosUltimasMal`), Task 3 (`filtrarNoVistos`), y `resolverEstado` (existente, no cambia).
- Produces: página que persiste `alumno_nodo.puntaje` como acumulador y `estado` derivado. Estado local nuevo: `poolAgotado: boolean` y `noVistosRef` (Task 7 los usa para reposición y copy).

- [ ] **Step 1: Reemplazar la carga (useEffect, líneas 82-99)**

Reemplazar la query de `respuesta` con `.limit(8)` y el `setEjercicios(...)` por: UNA query de todo el historial del chico en el nodo (sirve para vistos + ventana de adaptividad), filtrar el pool y guardar cuántos quedan:

```tsx
const { data } = await supabase
  .from('ejercicio')
  .select('id,enunciado,opciones,correcta,dificultad,tipo')
  .eq('nodo_id', nodoId);

let historial: HistorialEjercicio[] = [];
let vistos: string[] = [];
if (me) {
  const { data: todas } = await supabase
    .from('respuesta')
    .select('ejercicio_id, correcta, reintentos, created_at, ejercicio:ejercicio_id!inner(tipo,dificultad), sesion:sesion_id!inner(alumno_id,nodo_id)')
    .eq('sesion.nodo_id', nodoId)
    .eq('sesion.alumno_id', me.id)
    .order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (todas as any[]) || [];
  vistos = filas.map((x) => x.ejercicio_id);
  historial = filas.slice(0, 8).map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo, dificultad: x.ejercicio?.dificultad }));
}
const pool = (data as Ejercicio[]) || [];
const noVistos = filtrarNoVistos(pool, vistos);
setPoolAgotado(pool.length > 0 && noVistos.length === 0);
setEjercicios(elegirEjercicios(noVistos, historial));
```

Imports nuevos en el archivo: `filtrarNoVistos` desde `@/lib/practica`; `puntajeSesion, calcularEstadoProgresivo, coberturaHistorica, dosUltimasMal` desde `@/lib/dominio` (reemplazan a `calcularEstado`). Estado local nuevo junto a los `useState` existentes:

```tsx
const [poolAgotado, setPoolAgotado] = useState(false);
```

- [ ] **Step 2: Reemplazar el cálculo de estado en `guardarSesion` (líneas 167-183)**

Reemplazar la query de ventana `.limit(8)` + `calcularEstado` por: leer historial completo (ya incluye las respuestas recién insertadas), replay del motor y estado derivado:

```tsx
const { data: todasRaw } = await supabase
  .from('respuesta')
  .select('correcta, reintentos, ejercicio:ejercicio_id!inner(tipo,dificultad), sesion:sesion_id!inner(alumno_id,nodo_id)')
  .eq('sesion.nodo_id', nodoId)
  .eq('sesion.alumno_id', me.id);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const todas = ((todasRaw as any[]) || []).map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo, dificultad: x.ejercicio?.dificultad }));

const { data: an } = await supabase.from('alumno_nodo').select('estado, estado_override, puntaje').eq('alumno_id', me.id).eq('nodo_id', nodoId).maybeSingle();
const previo = an as { estado?: EstadoNodo; estado_override?: boolean; puntaje?: number } | null;

// Replay de la sesión (en orden cronológico) sobre el puntaje persistido.
const cronologicas = regs.map((x, i) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: ejercicios![i]?.tipo ?? 'reconocer', dificultad: ejercicios![i]?.dificultad ?? 1 }));
const nuevoPuntaje = puntajeSesion(Number(previo?.puntaje ?? 0), cronologicas);
const tasa = r.total ? r.aciertos / r.total : 0;
const estadoCalc = calcularEstadoProgresivo({
  puntaje: nuevoPuntaje,
  totalRespondidos: todas.length,
  cobertura: coberturaHistorica(todas),
  dosUltimasMal: dosUltimasMal(cronologicas),
  tasaSesion: tasa,
  estadoActual: previo?.estado || 'no_empezado',
});
const res = resolverEstado({ estado: estadoCalc, puntaje: nuevoPuntaje }, previo?.estado_override ?? false, previo?.estado || 'no_empezado');
```

El `upsert` que sigue (línea 180) queda igual (usa `res.estado` y `res.puntaje`).

Nota: `regs` está en orden cronológico (se van pusheando al responder) y `regs[i]` corresponde a `ejercicios[i]` — el flujo actual sirve los ejercicios en orden. Verificarlo al editar: si el componente permitiera saltear, mapear por `ejercicio_id` contra `ejercicios`.

- [ ] **Step 3: Copy de pool agotado (línea ~250)**

En la rama `ejercicios.length === 0`, distinguir con `poolAgotado`:

```tsx
if (ejercicios.length === 0) {
  return (
    /* mantener el layout existente de la rama, cambiando solo el <p>: */
    <p style={{ color: '#7A6F5F', fontWeight: 600, marginTop: 12 }}>
      {poolAgotado
        ? '¡Hiciste todos los ejercicios que había! SOL está preparando nuevos 🌱 Volvé en un ratito.'
        : `${nodoNombre || 'Este nodo'} todavía no tiene ejercicios.`}
    </p>
  );
}
```

- [ ] **Step 4: Retirar la regla vieja de `web/lib/dominio.ts`**

Borrar: `VENTANA`, `MIN_DOMINIO`, la función `peso`, `puntajeNodo` y `calcularEstado` (líneas 10-11, 17-26 y 28-54 del archivo original). Conservar: `EstadoNodo`, `RespuestaEval`, `esPrimerIntento`, `MIN_PRODUCIR`, `DIF_DIFICIL`, `PISO_REFORZAR`, `resolverEstado`, y todo lo de las Tasks 1-2. Actualizar el comentario de cabecera del archivo: la regla ahora es el motor progresivo (spec 2026-07-03).

En `tests/unit/dominio.test.mjs`: borrar los tests de `calcularEstado`/`puntajeNodo` y su import; conservar los de `resolverEstado` y los nuevos.

- [ ] **Step 5: Script one-off de compatibilidad — replay de puntajes existentes**

Los `puntaje` guardados hasta hoy son porcentajes de ventana, no acumuladores. La spec pide recalcularlos por replay del histórico (volumen chico: datos semilla). Crear `scripts/replay-puntajes.mjs`:

```js
// Replay ÚNICO de compatibilidad (spec 2026-07-03): recalcula alumno_nodo.puntaje
// con el motor ELO-lite sobre el histórico completo del chico en el nodo. Los
// estados NO se tocan (dominado es pegajoso hacia atrás). Idempotente.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/replay-puntajes.mjs
import { puntajeSesion } from '../web/lib/dominio.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const filas = await (await fetch(`${URL}/rest/v1/alumno_nodo?select=id,alumno_id,nodo_id`, { headers: H })).json();
for (const an of filas) {
  const resp = await (await fetch(
    `${URL}/rest/v1/respuesta?select=correcta,reintentos,created_at,ejercicio:ejercicio_id(tipo,dificultad),sesion:sesion_id!inner(alumno_id,nodo_id)&sesion.alumno_id=eq.${an.alumno_id}&sesion.nodo_id=eq.${an.nodo_id}&order=created_at.asc`,
    { headers: H },
  )).json();
  const cronologicas = resp.map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo ?? 'reconocer', dificultad: x.ejercicio?.dificultad ?? 1 }));
  const puntaje = puntajeSesion(0, cronologicas);
  await fetch(`${URL}/rest/v1/alumno_nodo?id=eq.${an.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ puntaje }) });
  console.log(`✓ alumno ${an.alumno_id.slice(0, 8)} nodo ${an.nodo_id.slice(0, 8)} → ${puntaje}`);
}
console.log('Listo.');
```

Correrlo UNA vez contra el proyecto (con los envs) después de deployar este cambio del front. Queda en `scripts/` por si hace falta re-correrlo (es idempotente).

- [ ] **Step 6: Verificar unit + build**

Run: `npm test`
Expected: PASS.

Run: `cd web && npm run lint && npm run build && cd ..`
Expected: build OK, sin referencias a `calcularEstado`/`puntajeNodo`.

- [ ] **Step 7: Commit**

```bash
git add web/lib/dominio.ts web/app/alumno/\[programaId\]/practicar/page.tsx tests/unit/dominio.test.mjs scripts/replay-puntajes.mjs
git commit -m "feat: Practicar usa el motor progresivo, nunca repite ejercicios y retira la regla de ventana"
```

---

### Task 5: Bandas de grado, estratos y mock sin repetidos en `generar.ts`

**Files:**
- Modify: `supabase/functions/generador-ejercicios/generar.ts`
- Test: `tests/unit/generar-ejercicios.test.mjs`

**Interfaces:**
- Consumes: `TIPOS`, `TipoEjercicio`, `EjercicioGen`, `parseEjercicios`, `cubreDominio` (existentes en el archivo).
- Produces (Task 6 depende, firmas exactas):
  - `type Banda = 'chiquitos' | 'medianos' | 'grandes'`; `bandaDeGrado(grado: number): Banda`; `ESTILO_BANDA: Record<Banda, string>`.
  - `type Celda = { tipo: TipoEjercicio; dificultad: number }`; `CELDAS: Celda[]` (12 = 4 tipos × 3 dificultades); `POR_CELDA_INICIAL = 3`; `LOTE_REPOSICION = 12`.
  - `celdasIniciales(): Array<Celda & { n: number }>` — 3 por celda (36).
  - `celdasParaLote(sinVerPorCelda: Map<string, number>, lote?: number): Array<Celda & { n: number }>` — prioriza escasez; clave del map: `` `${tipo}|${dificultad}` ``.
  - `claveCelda(c: Celda): string`.
  - `mockEjercicios(nodoId: string, nodoNombre: string, celdas: Array<Celda & { n: number }>, desde?: number): EjercicioGen[]` — determinístico, enunciados únicos por índice.
  - `construirPromptEjercicios` gana un 6º parámetro opcional `celdas?: Array<Celda & { n: number }>` (pide cantidades exactas por estrato) y agrega la línea de estilo de banda al system.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `tests/unit/generar-ejercicios.test.mjs`:

```js
import {
  bandaDeGrado, ESTILO_BANDA, CELDAS, celdasIniciales, celdasParaLote, claveCelda,
  mockEjercicios, construirPromptEjercicios, POR_CELDA_INICIAL, LOTE_REPOSICION,
} from '../../supabase/functions/generador-ejercicios/generar.ts';

test('bandaDeGrado: 1-2 chiquitos, 3-4 medianos, 5-7 grandes', () => {
  assert.equal(bandaDeGrado(1), 'chiquitos');
  assert.equal(bandaDeGrado(2), 'chiquitos');
  assert.equal(bandaDeGrado(3), 'medianos');
  assert.equal(bandaDeGrado(4), 'medianos');
  assert.equal(bandaDeGrado(5), 'grandes');
  assert.equal(bandaDeGrado(7), 'grandes');
});

test('celdas: 12 combinaciones tipo × dificultad; inicial trae 3 por celda', () => {
  assert.equal(CELDAS.length, 12);
  const ini = celdasIniciales();
  assert.equal(ini.reduce((s, c) => s + c.n, 0), 12 * POR_CELDA_INICIAL);
  assert.ok(ini.every((c) => c.n === POR_CELDA_INICIAL));
});

test('celdasParaLote: reparte el lote priorizando las celdas con menos sin-ver', () => {
  // todas las celdas con 5 sin ver, salvo producir|3 con 0 → producir|3 recibe más
  const sinVer = new Map(CELDAS.map((c) => [claveCelda(c), 5]));
  sinVer.set('producir|3', 0);
  const lote = celdasParaLote(sinVer, LOTE_REPOSICION);
  assert.equal(lote.reduce((s, c) => s + c.n, 0), LOTE_REPOSICION);
  const prod3 = lote.find((c) => c.tipo === 'producir' && c.dificultad === 3);
  assert.ok(prod3 && prod3.n >= 2, 'la celda más escasa recibe más ejercicios');
});

test('celdasParaLote: determinístico', () => {
  const sinVer = new Map(CELDAS.map((c) => [claveCelda(c), 2]));
  assert.deepEqual(celdasParaLote(sinVer, 12), celdasParaLote(sinVer, 12));
});

test('mockEjercicios: respeta celdas, enunciados únicos y correcta entre las opciones', () => {
  const celdas = [{ tipo: 'producir', dificultad: 3, n: 2 }, { tipo: 'reconocer', dificultad: 1, n: 1 }];
  const a = mockEjercicios('nodo-1', 'Vocales', celdas, 0);
  assert.equal(a.length, 3);
  assert.ok(a.every((e) => e.opciones.includes(e.correcta)));
  assert.equal(a.filter((e) => e.tipo === 'producir' && e.dificultad === 3).length, 2);
  // `desde` distinto → enunciados distintos (nunca repetidos aunque se repongan lotes)
  const b = mockEjercicios('nodo-1', 'Vocales', celdas, a.length);
  const enunciados = new Set([...a, ...b].map((e) => e.enunciado));
  assert.equal(enunciados.size, 6);
});

test('construirPromptEjercicios: incluye estilo de banda y cantidades por celda', () => {
  const { system, user } = construirPromptEjercicios('Lengua', 2, 'Vocales', '', 6, [{ tipo: 'producir', dificultad: 3, n: 2 }]);
  assert.ok(system.includes(ESTILO_BANDA.chiquitos));
  assert.ok(user.includes('2 de tipo "producir" con dificultad 3'));
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: FAIL — exports inexistentes.

- [ ] **Step 3: Implementar**

Agregar a `supabase/functions/generador-ejercicios/generar.ts`:

```ts
// ── Bandas de grado (DP7): la banda fija CÓMO se redacta; el puntaje del chico
// fija QUÉ dificultad se le sirve. Cero datos nuevos del menor.
export type Banda = 'chiquitos' | 'medianos' | 'grandes';

export function bandaDeGrado(grado: number): Banda {
  if (grado <= 2) return 'chiquitos';
  if (grado <= 4) return 'medianos';
  return 'grandes';
}

export const ESTILO_BANDA: Record<Banda, string> = {
  chiquitos: 'Consignas de UNA oración corta y directa, vocabulario cotidiano de un chico de 1° o 2° grado, opciones bien distintas entre sí.',
  medianos: 'Consignas de una o dos oraciones, vocabulario escolar de 3° o 4° grado.',
  grandes: 'Consignas que pueden llevar más de una oración, vocabulario rico de 5° a 7° grado, distractores finos que obligan a pensar.',
};

// ── Estratos del pool (DP6): celda = tipo × dificultad. ──────────────────────
export type Celda = { tipo: TipoEjercicio; dificultad: number };

export const POR_CELDA_INICIAL = 3; // pool inicial: 3 × 12 celdas = 36
export const LOTE_REPOSICION = 12;

export const CELDAS: Celda[] = TIPOS.flatMap((tipo) => [1, 2, 3].map((dificultad) => ({ tipo, dificultad })));

export const claveCelda = (c: Celda): string => `${c.tipo}|${c.dificultad}`;

export function celdasIniciales(): Array<Celda & { n: number }> {
  return CELDAS.map((c) => ({ ...c, n: POR_CELDA_INICIAL }));
}

// Reparte un lote priorizando las celdas con menos ejercicios sin ver para el
// chico (spec: "priorizando los estratos que escaseen"). Determinístico.
export function celdasParaLote(sinVerPorCelda: Map<string, number>, lote = LOTE_REPOSICION): Array<Celda & { n: number }> {
  const estado = CELDAS.map((c) => ({ ...c, n: 0, sinVer: sinVerPorCelda.get(claveCelda(c)) ?? 0 }));
  for (let i = 0; i < lote; i++) {
    estado.sort((a, b) => a.sinVer + a.n - (b.sinVer + b.n) || a.dificultad - b.dificultad || a.tipo.localeCompare(b.tipo));
    estado[0].n++;
  }
  return estado.filter((c) => c.n > 0).map(({ tipo, dificultad, n }) => ({ tipo, dificultad, n }));
}

// Mock determinístico (sin IA): enunciados únicos vía índice `desde` para que la
// reposición NUNCA genere un enunciado repetido (DP5), aún en modo mock.
export function mockEjercicios(nodoId: string, nodoNombre: string, celdas: Array<Celda & { n: number }>, desde = 0): EjercicioGen[] {
  const out: EjercicioGen[] = [];
  let i = desde;
  for (const c of celdas) {
    for (let k = 0; k < c.n; k++) {
      i++;
      const correcta = `Respuesta ${i}`;
      out.push({
        nodo_id: nodoId,
        enunciado: `(${i}) Práctica de ${nodoNombre}: elegí la opción correcta (${c.tipo}, nivel ${c.dificultad}).`,
        opciones: [correcta, `Distractor ${i}A`, `Distractor ${i}B`, `Distractor ${i}C`],
        correcta,
        dificultad: c.dificultad,
        tipo: c.tipo,
      });
    }
  }
  return out;
}
```

Y modificar `construirPromptEjercicios`: nueva firma `(materia, grado, nodoNombre, nodoDescripcion, n = 6, celdas?)`. Cambios exactos: en el array del `system`, después de la línea de "Generás ejercicios de OPCIÓN MÚLTIPLE…", insertar `ESTILO_BANDA[bandaDeGrado(grado)]`. Y el `user` pasa a:

```ts
const pedido = celdas && celdas.length
  ? `Generá EXACTAMENTE: ${celdas.map((c) => `${c.n} de tipo "${c.tipo}" con dificultad ${c.dificultad}`).join(', ')}.`
  : `Generá ${n} ejercicios para este nodo.`;
const user = `Nodo: "${nodoNombre}"${nodoDescripcion ? ` — ${nodoDescripcion}` : ''}.\n${pedido}`;
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (incluidos los tests viejos de `parseEjercicios`/`cubreDominio` y el uso con 5 args del script local `scripts/generar-ejercicios-local.mjs`, que sigue compilando porque `celdas` es opcional).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generador-ejercicios/generar.ts tests/unit/generar-ejercicios.test.mjs
git commit -m "feat: bandas de grado, estratos del pool y mock sin repetidos para el generador"
```

---

### Task 6: Migración 0012 + Edge Function `generador-ejercicios`

**Files:**
- Create: `supabase/migrations/0012_ejercicio_created_at.sql`
- Create: `supabase/functions/generador-ejercicios/index.ts`
- Test: `tests/integration/generador-ejercicios.test.mjs`

**Interfaces:**
- Consumes: Task 5 (`celdasIniciales`, `celdasParaLote`, `claveCelda`, `mockEjercicios`, `construirPromptEjercicios`, `parseEjercicios`, `LOTE_REPOSICION`), `cors`/`json` de `../_shared/cors.ts` (patrón de `dividir-nodos/index.ts`).
- Produces: Function con contrato (Task 7 depende):
  - Body `{ programa_id, mock? }` → **pool inicial**: para cada nodo del programa sin ejercicios, inserta 36 estratificados. Solo la docente dueña (`sol_materia.docente_id`). Respuesta `{ generados: number }`.
  - Body `{ nodo_id, mock? }` → **reposición**: inserta un lote de 12 priorizando celdas escasas para el usuario que llama. Docente dueña o alumno de la escuela con la materia publicada. Respuesta `{ generados: number }`.
  - Tope diario (Regla 4): si hoy ya se insertaron ≥ `TOPE_EJERCICIOS_DIA = 240` ejercicios, responde 429 `{ error: 'tope_diario' }`.

- [ ] **Step 1: Migración**

`supabase/migrations/0012_ejercicio_created_at.sql`:

```sql
-- created_at en ejercicio: lo usa el tope diario de generación (Regla 4).
alter table ejercicio add column if not exists created_at timestamptz not null default now();
```

Aplicar en el proyecto (MCP `mcp__supabase__apply_migration` con nombre `0012_ejercicio_created_at`, o `supabase db push`).

- [ ] **Step 2: Escribir el test de integración que falla**

`tests/integration/generador-ejercicios.test.mjs` — seguir el patrón exacto de `tests/integration/dividir-nodos.test.mjs` (helpers `nuevoDocente`, `callFnAuth`, `srHeaders`, `skip` si faltan envs, limpieza al final). Esqueleto completo:

```js
// Tests de integración del generador de ejercicios (pool inicial + reposición).
// Corren en modo MOCK → NO necesitan ANTHROPIC_API_KEY. Idempotentes. npm run test:db
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = (URL && ANON && SR) ? false : 'faltan envs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY';

// … copiar de dividir-nodos.test.mjs: ESCUELA, rnd, srHeaders, callFnAuth, nuevoDocente, borrado …

test('pool inicial: 36 ejercicios estratificados por nodo, solo docente dueña', { skip }, async () => {
  const doc = await nuevoDocente();
  // 1. crear materia+programa+sol_materia+nodo vía dividir-nodos (mock) — reutiliza la function ya deployada
  const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestGen ${rnd()}`, grado: 2, contenido: 'vocales', mock: true }, doc.access_token);
  const { programa_id, nodos } = await div.json();
  // 2. pool inicial
  const r = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token);
  assert.equal(r.status, 200);
  const { generados } = await r.json();
  assert.equal(generados, nodos.length * 36);
  // 3. estratos: el nodo tiene 3 por celda (12 celdas)
  const ej = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=tipo,dificultad`, { headers: srHeaders() })).json();
  assert.equal(ej.length, 36);
  assert.equal(ej.filter((e) => e.tipo === 'producir' && e.dificultad === 3).length, 3);
  // 4. otro docente NO puede
  const intruso = await nuevoDocente();
  const rx = await callFnAuth('generador-ejercicios', { programa_id, mock: true }, intruso.access_token);
  assert.equal(rx.status, 403);
  // …limpieza: borrar ejercicios, nodos, sol_materia, programa, materia, docentes…
});

test('reposición: agrega 12 sin repetir enunciados', { skip }, async () => {
  const doc = await nuevoDocente();
  const div = await callFnAuth('dividir-nodos', { materia_nombre: `TestRep ${rnd()}`, grado: 2, contenido: 'vocales', mock: true }, doc.access_token);
  const { programa_id, nodos } = await div.json();
  await callFnAuth('generador-ejercicios', { programa_id, mock: true }, doc.access_token); // pool inicial: 36
  const r1 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, doc.access_token);
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).generados, 12);
  const r2 = await callFnAuth('generador-ejercicios', { nodo_id: nodos[0].id, mock: true }, doc.access_token);
  assert.equal((await r2.json()).generados, 12);
  const filas = await (await fetch(`${URL}/rest/v1/ejercicio?nodo_id=eq.${nodos[0].id}&select=enunciado`, { headers: srHeaders() })).json();
  assert.equal(filas.length, 36 + 12 + 12);
  assert.equal(new Set(filas.map((f) => f.enunciado)).size, filas.length); // DP5: ni un enunciado repetido
  // …limpieza igual que el test anterior…
});
```

Completar la limpieza copiando el patrón de borrado de `dividir-nodos.test.mjs`.

Run: `npm run test:db`
Expected: FAIL — 404 (function no existe).

- [ ] **Step 3: Implementar la Edge Function**

`supabase/functions/generador-ejercicios/index.ts` (mismo esqueleto de auth que `dividir-nodos/index.ts`):

```ts
// generador-ejercicios (spec 2026-07-03): pool inicial estratificado al publicar y
// reposición automática cuando a un chico se le acaba lo no visto (DP5/DP6).
// Mock por defecto (sin gastar); modo real detrás del flag con la key SOLO server-side.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import {
  celdasIniciales, celdasParaLote, claveCelda, mockEjercicios,
  construirPromptEjercicios, parseEjercicios, LOTE_REPOSICION,
} from './generar.ts';
import type { Celda, EjercicioGen } from './generar.ts';

const MODELO = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;
const TOPE_EJERCICIOS_DIA = 240; // Regla 4: 20 lotes de 12 por día, global

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const srKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'no_autenticado' }, 401);

    const sb = createClient(url, srKey);
    const { data: perfil } = await sb.from('perfil').select('rol, escuela_id').eq('id', user.id).single();
    if (!perfil) return json({ error: 'sin_perfil' }, 403);

    const { programa_id, nodo_id, mock } = await req.json();
    if (!programa_id && !nodo_id) return json({ error: 'datos_faltantes' }, 400);

    // Tope diario (Regla 4).
    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
    const { count: generadosHoy } = await sb.from('ejercicio').select('id', { count: 'exact', head: true }).gte('created_at', hoy.toISOString());
    if ((generadosHoy ?? 0) >= TOPE_EJERCICIOS_DIA) return json({ error: 'tope_diario' }, 429);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    const usarMock = mock || !key;

    // Generación de un lote para un nodo (mock o Claude), validado.
    async function generarLote(nodo: { id: string; nombre: string; descripcion: string | null }, materia: string, grado: number, celdas: Array<Celda & { n: number }>, desde: number): Promise<EjercicioGen[]> {
      if (usarMock) return mockEjercicios(nodo.id, nodo.nombre, celdas, desde);
      const { system, user: userMsg } = construirPromptEjercicios(materia, grado, nodo.nombre, nodo.descripcion ?? '', 0, celdas);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODELO, max_tokens: MAX_TOKENS, system, messages: [{ role: 'user', content: userMsg }] }),
      });
      if (!r.ok) throw new Error(`claude_${r.status}: ${await r.text()}`);
      const data = await r.json();
      const texto = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
      return parseEjercicios(JSON.parse(texto.slice(texto.indexOf('['), texto.lastIndexOf(']') + 1)), nodo.id);
    }

    // Datos del programa (materia + grado) — común a los dos modos.
    async function datosPrograma(progId: string) {
      const { data } = await sb.from('programa').select('grado, materia:materia_id(nombre)').eq('id', progId).single();
      return { grado: (data as { grado: number }).grado, materia: ((data as { materia?: { nombre?: string } }).materia?.nombre) ?? 'la materia' };
    }

    let generados = 0;

    if (programa_id) {
      // ── POOL INICIAL: solo la docente dueña del programa. ──────────────────
      const { data: sm } = await sb.from('sol_materia').select('docente_id').eq('programa_id', programa_id).maybeSingle();
      if (!sm || sm.docente_id !== user.id) return json({ error: 'solo_docente_duena' }, 403);
      const { materia, grado } = await datosPrograma(programa_id);
      const { data: nodos } = await sb.from('nodo').select('id, nombre, descripcion').eq('programa_id', programa_id).order('orden');
      for (const nodo of nodos ?? []) {
        const { count } = await sb.from('ejercicio').select('id', { count: 'exact', head: true }).eq('nodo_id', nodo.id);
        if ((count ?? 0) > 0) continue; // idempotente: no duplicar pools
        const lote = await generarLote(nodo, materia, grado, celdasIniciales(), 0);
        const { error } = await sb.from('ejercicio').insert(lote);
        if (error) throw error;
        generados += lote.length;
      }
    } else {
      // ── REPOSICIÓN: docente dueña O alumno de la escuela (materia publicada). ─
      const { data: nodo } = await sb.from('nodo').select('id, nombre, descripcion, programa_id').eq('id', nodo_id).single();
      if (!nodo) return json({ error: 'nodo_inexistente' }, 404);
      const { data: sm } = await sb.from('sol_materia').select('docente_id, escuela_id, estado').eq('programa_id', nodo.programa_id).maybeSingle();
      const esDuena = sm?.docente_id === user.id;
      const esAlumnoDeLaEscuela = perfil.rol === 'alumno' && sm?.estado === 'publicado' && sm?.escuela_id === perfil.escuela_id;
      if (!esDuena && !esAlumnoDeLaEscuela) return json({ error: 'sin_permiso' }, 403);

      const { materia, grado } = await datosPrograma(nodo.programa_id);
      // Sin-ver por celda PARA ESTE USUARIO: pool del nodo menos lo que ya respondió.
      const { data: pool } = await sb.from('ejercicio').select('id, tipo, dificultad').eq('nodo_id', nodo.id);
      const { data: vistosRaw } = await sb
        .from('respuesta')
        .select('ejercicio_id, sesion:sesion_id!inner(alumno_id, nodo_id)')
        .eq('sesion.nodo_id', nodo.id)
        .eq('sesion.alumno_id', user.id);
      const vistos = new Set((vistosRaw ?? []).map((v: { ejercicio_id: string }) => v.ejercicio_id));
      const sinVer = new Map<string, number>();
      for (const e of pool ?? []) {
        if (vistos.has(e.id)) continue;
        const k = claveCelda(e as Celda);
        sinVer.set(k, (sinVer.get(k) ?? 0) + 1);
      }
      const lote = await generarLote(nodo, materia, grado, celdasParaLote(sinVer, LOTE_REPOSICION), (pool ?? []).length);
      const { error } = await sb.from('ejercicio').insert(lote);
      if (error) throw error;
      generados = lote.length;
    }

    return json({ generados });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
```

- [ ] **Step 4: Deployar y correr integración**

Run: `supabase functions deploy generador-ejercicios` (o MCP `mcp__supabase__deploy_edge_function`).
Run: `npm run test:db`
Expected: PASS (los tests nuevos y los existentes).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_ejercicio_created_at.sql supabase/functions/generador-ejercicios/index.ts tests/integration/generador-ejercicios.test.mjs
git commit -m "feat: Edge Function generador-ejercicios con pool inicial, reposición y tope diario"
```

---

### Task 7: Cablear el front — publicar genera el pool, Practicar repone

**Files:**
- Modify: `web/app/docente/autoria/page.tsx` (función `publicar`, líneas ~122-130)
- Modify: `web/app/alumno/[programaId]/practicar/page.tsx` (useEffect de carga, tras el filtro de la Task 4)

**Interfaces:**
- Consumes: contrato de la Task 6 (`{ programa_id, mock }` y `{ nodo_id, mock }` → `{ generados }`), `necesitaReposicion` de la Task 3. En autoría, el patrón de llamada con `fetch` + `session.access_token` ya existe en `generar()` (líneas 65-70); `programaId` está en el estado del componente.
- Produces: publicar deja la materia con pool listo; Practicar dispara reposición sola.

- [ ] **Step 1: Autoría — generar pool al publicar**

En `publicar()` de `web/app/docente/autoria/page.tsx`, después del update a `publicado` exitoso (tras la línea `setEstado('publicado')`), llamar a la function y ajustar el toast:

```tsx
toast('¡Publicado! SOL está preparando los ejercicios… 🌱');
const { data: { session } } = await supabase.auth.getSession();
const r = await fetch(`${URL}/functions/v1/generador-ejercicios`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ programa_id: programaId, mock: true }),
});
const j = await r.json().catch(() => ({}));
toast(r.ok ? `¡Listo! SOL preparó ${j.generados ?? 0} ejercicios.` : 'La materia quedó publicada, pero los ejercicios no salieron. Probá publicar de nuevo.');
```

(Reemplaza el toast actual `'¡Publicado! Ya lo pueden practicar.'`. Mantener `setBusy` alrededor de todo el flujo.)

- [ ] **Step 2: Practicar — disparo de reposición**

En el useEffect de carga (código de la Task 4), después de `const noVistos = filtrarNoVistos(pool, vistos);`, agregar el disparo fire-and-forget:

```tsx
if (me && necesitaReposicion(noVistos.length)) {
  supabase.functions.invoke('generador-ejercicios', { body: { nodo_id: nodoId, mock: true } }).catch(() => {});
}
```

Import: `necesitaReposicion` desde `@/lib/practica`. El chico no espera: sigue con lo que hay (si no hay nada, ve el copy de pool agotado de la Task 4 y el lote queda listo para la próxima).

- [ ] **Step 3: Verificar**

Run: `npm test && cd web && npm run lint && npm run build && cd ..`
Expected: PASS / build OK.

Smoke manual (contra el proyecto real, modo mock): en `/docente/autoria` crear una materia de prueba, publicar → verificar en la tabla `ejercicio` que cada nodo tiene 36 filas; entrar como alumno, practicar el nodo hasta que queden < 16 sin ver → verificar que aparece un lote nuevo de 12. Borrar la materia de prueba al final.

- [ ] **Step 4: Commit**

```bash
git add web/app/docente/autoria/page.tsx web/app/alumno/\[programaId\]/practicar/page.tsx
git commit -m "feat: publicar genera el pool inicial y Practicar repone ejercicios solo"
```

---

### Task 8: Gradiente del mapa por puntaje

**Files:**
- Modify: `web/lib/mapa-layout.ts`
- Modify: `web/app/alumno/[programaId]/mapa/page.tsx` (líneas 16, 41-47 y donde se llame `estadoColor`)
- Test: `tests/unit/mapa-layout.test.mjs`

**Interfaces:**
- Consumes: `COLORES`, `estadoColor`, `EstadoNodo` (existentes en `web/lib/mapa-layout.ts`).
- Produces: `mezclarColor(a: string, b: string, t: number): string` (hex `#rrggbb`) y `colorNodo(estado: string | null | undefined, puntaje?: number): string`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `tests/unit/mapa-layout.test.mjs`:

```js
import { mezclarColor, colorNodo, COLORES } from '../../web/lib/mapa-layout.ts';

test('mezclarColor: extremos y punto medio', () => {
  assert.equal(mezclarColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(mezclarColor('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mezclarColor('#000000', '#ffffff', 0.5), '#808080');
});

test('colorNodo: en_construccion se acerca al color de dominado según el puntaje', () => {
  assert.equal(colorNodo('en_construccion', 0), mezclarColor(COLORES.en_construccion, COLORES.dominado, 0));
  assert.equal(colorNodo('en_construccion', 100), mezclarColor(COLORES.en_construccion, COLORES.dominado, 1));
});

test('colorNodo: dominado, a_reforzar y no_empezado conservan su color pleno', () => {
  assert.equal(colorNodo('dominado', 40), COLORES.dominado);
  assert.equal(colorNodo('a_reforzar', 80), COLORES.a_reforzar);
  assert.equal(colorNodo('no_empezado', 0), COLORES.no_empezado);
  assert.equal(colorNodo(undefined, undefined), COLORES.no_empezado);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `web/lib/mapa-layout.ts`, línea 6: exportar la paleta (hoy es `const` privada — el test y el gradiente la necesitan):

```ts
export const COLORES: Record<EstadoNodo, string> = {
```

Y agregar después de `estadoColor`:

```ts
// Mezcla lineal de dos colores hex (#rrggbb). t en [0,1].
export function mezclarColor(a: string, b: string, t: number): string {
  const ca = a.replace('#', ''), cb = b.replace('#', '');
  const canal = (i: number) => Math.round(parseInt(ca.slice(i, i + 2), 16) * (1 - t) + parseInt(cb.slice(i, i + 2), 16) * t);
  return `#${[0, 2, 4].map((i) => canal(i).toString(16).padStart(2, '0')).join('')}`;
}

// Color del nodo en el mapa: los estados con significado propio (dominado,
// a_reforzar, no_empezado) mantienen su color; en_construccion es un GRADIENTE
// que se acerca al verde de dominado a medida que crece el puntaje del motor.
export function colorNodo(estado: string | null | undefined, puntaje = 0): string {
  if (estado === 'en_construccion') {
    return mezclarColor(COLORES.en_construccion, COLORES.dominado, Math.min(100, Math.max(0, puntaje)) / 100);
  }
  return estadoColor(estado);
}
```

- [ ] **Step 4: Cablear el mapa**

En `web/app/alumno/[programaId]/mapa/page.tsx`:
- Línea 16: `type NodoVista = { id: string; nombre: string; orden: number; estado: string; puntaje: number };`
- Línea 41: la query pasa a `.select('nodo_id,estado,puntaje')` y el map de la línea 44 guarda `{ estado: r.estado, puntaje: Number(r.puntaje) || 0 }`; la línea 47 arma `estado: …, puntaje: estadoPorNodo.get(n.id)?.puntaje ?? 0`.
- Línea 102: `const color = estadoColor(n.estado);` → `const color = colorNodo(n.estado, n.puntaje);` (import `colorNodo` desde `@/lib/mapa-layout`; si `estadoColor` queda sin otros usos en la página, quitar su import).

- [ ] **Step 5: Verificar**

Run: `npm test && cd web && npm run lint && npm run build && cd ..`
Expected: PASS / build OK.

- [ ] **Step 6: Commit**

```bash
git add web/lib/mapa-layout.ts web/app/alumno/\[programaId\]/mapa/page.tsx tests/unit/mapa-layout.test.mjs
git commit -m "feat: gradiente del mapa según el puntaje progresivo del nodo"
```

---

### Task 9: Documentación

**Files:**
- Modify: `CLAUDE.md` (sección "Estado actual")
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Actualizar docs**

- `CLAUDE.md` → agregar al "Estado actual" un párrafo: motor de puntaje progresivo ELO-lite implementado (spec `2026-07-03-…`), estados derivados con hito pegajoso y mínimo 50 ejercicios, nunca-repetir + reposición automática (`generador-ejercicios`, migración `0012`), generación por banda de grado. Modo mock sigue por defecto hasta la API key.
- `docs/DECISIONS.md` → nueva entrada ADR corta: "Puntaje progresivo reemplaza la regla de ventana" con puntero a la spec y los locks DP1-DP7.
- `docs/ROADMAP.md` → en Fase 2, marcar/agregar el ítem correspondiente con referencia a la spec.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/DECISIONS.md docs/ROADMAP.md
git commit -m "docs: registra el motor de puntaje progresivo y la reposición del pool"
```

---

## Orden y dependencias

```
T1 → T2 → T4 ← T3          (motor → estados → página ← filtro)
T5 → T6 → T7               (lógica pura → function → cableado front)
T1 → T8                    (gradiente usa el puntaje persistido)
T9 al final
```

T1-T4 y T5-T6 son cadenas independientes entre sí; se pueden trabajar en paralelo si se ejecuta con subagentes.

## Verificación final (después de T9)

1. `npm test` → todo verde.
2. `npm run test:db` (con envs) → todo verde.
3. `cd web && npm run build` → OK.
4. Smoke manual del flujo entero en mock: autoría → publicar (pool 36/nodo) → alumno practica (nunca repite, puntaje sube en `alumno_nodo`, mapa con gradiente) → agotar hasta <16 → reposición +12 → override docente sigue funcionando.
