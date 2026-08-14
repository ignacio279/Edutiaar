# Marco curricular NAP en el Observatorio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/admin/observatorio` muestre el desempeño de los alumnos por eje y tema de los NAP, comparable entre colegios, agregando solo lo que está dentro del marco.

**Architecture:** Un catálogo NAP en dos tablas (`nap_eje` → `nap_tema`) es la vara fija. Cada `nodo` de cada colegio se cuelga de un `nap_tema` (columna nullable: null = fuera del marco, no se muestra). `dividir-nodos` propone ese mapeo con Sonnet al publicar y el admin corrige lo dudoso. La agregación vive en `observatorio-logica.ts` como lógica pura testeada desde Node, y la Edge Function `admin-observatorio` la expone en una acción `desempeno`.

**Tech Stack:** Postgres (Supabase migrations), Deno (Edge Functions), Next.js App Router + React (front admin), `node --test` para unit, scripts Node para seed/backfill.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-14-marco-nap-observatorio-design.md`. Branch: `claude/marco-nap-observatorio`.
- **Regla 1:** la API key de Claude es server-side. Ninguna tarea la toca desde el front.
- **Regla 5 / anonimato:** ninguna respuesta de `admin-observatorio` puede llevar nombres ni ids de alumnos. `K_ANONIMATO = 5` se mantiene, ahora por tema.
- **Idioma:** tablas y columnas en `snake_case` español; UI y copy en español rioplatense.
- **Lógica pura sin imports de Deno/supabase** en `observatorio-logica.ts`, para que `node --test` la corra directo. Nada de `new Date()` adentro: el "ahora" entra por parámetro.
- **Cuatro materias del marco, exactas:** `Lengua`, `Matemática`, `Ciencias Naturales`, `Ciencias Sociales`.
- **Tests en verde antes de cada commit.** `npm test` corre todo el unit.
- **Migración nueva:** `0028_marco_nap.sql`. No editar migraciones ya aplicadas.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0028_marco_nap.sql` | Tablas del catálogo, columnas de mapeo en `nodo`, RLS server-only |
| `supabase/functions/_shared/nap.ts` | Catálogo NAP como dato (fuente única, espejado al front) |
| `web/lib/admin/nap.ts` | Espejo del anterior para el front, con test de paridad |
| `supabase/functions/admin-observatorio/observatorio-logica.ts` | Suma `desempenoPorEje` y sus tipos; pierde `topTemasQueCuestan` |
| `supabase/functions/admin-observatorio/index.ts` | Acción `desempeno`; se retira la acción `temas` |
| `supabase/functions/dividir-nodos/dividir.ts` | Catálogo en el prompt + validación del mapeo propuesto |
| `supabase/functions/dividir-nodos/index.ts` | Persiste `nap_tema_id` / `nap_confianza` al insertar nodos |
| `supabase/functions/admin-colegios/index.ts` | Acciones de la cola de revisión del mapeo |
| `web/app/admin/observatorio/page.tsx` | Sección "Desempeño por materia" |
| `web/app/admin/observatorio/revision/page.tsx` | Cola de revisión del mapeo |
| `scripts/backfill-nap.mjs` | Clasifica los nodos que ya existen |
| `scripts/seed-actividad.mjs` | Suma volumen y práctica en Matemática |
| `tests/unit/nap-desempeno.test.mjs` | Toda la lógica pura nueva |
| `tests/unit/nap-catalogo.test.mjs` | Paridad e integridad del catálogo |
| `tests/integration/nap-rls.test.mjs` | El catálogo no es legible por anon/authenticated |

---

### Task 1: Esquema del marco

**Files:**
- Create: `supabase/migrations/0028_marco_nap.sql`
- Test: `tests/integration/nap-rls.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: tablas `nap_eje(id, materia, nombre, orden)` y `nap_tema(id, eje_id, nombre, grado, orden)`; columnas `nodo.nap_tema_id uuid null`, `nodo.nap_confianza numeric null`, `nodo.nap_revisado boolean not null default false`.

- [ ] **Step 1: Escribir la migración**

```sql
-- EDUTIA — Marco curricular NAP: la vara fija contra la que el observatorio
-- mide el aprendizaje. Spec: docs/superpowers/specs/2026-08-14-marco-nap-observatorio-design.md
--
-- Server-only a propósito (RLS habilitada SIN policies): lo leen dividir-nodos
-- y las fns admin-* con service_role. La docente todavía no ve su tema NAP
-- (fuera de alcance) y el alumno nunca.

create table nap_eje (
  id uuid primary key default gen_random_uuid(),
  materia text not null check (materia in
    ('Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales')),
  nombre text not null,
  orden int not null default 0,
  unique (materia, nombre)
);
alter table nap_eje enable row level security;

create table nap_tema (
  id uuid primary key default gen_random_uuid(),
  eje_id uuid not null references nap_eje(id) on delete cascade,
  nombre text not null,
  grado int not null check (grado between 1 and 7),
  orden int not null default 0,
  unique (eje_id, nombre, grado)
);
alter table nap_tema enable row level security;
create index nap_tema_eje_idx on nap_tema (eje_id, grado);

-- El mapeo cuelga de nodo (D-NAP3): 1 nodo → 0 o 1 tema. NULL = fuera del
-- marco, y como el dashboard agrega POR nap_tema_id, lo no mapeado desaparece
-- solo (así "Ética no se muestra" no necesita código propio).
alter table nodo add column nap_tema_id uuid references nap_tema(id) on delete set null;
alter table nodo add column nap_confianza numeric check (nap_confianza is null or (nap_confianza >= 0 and nap_confianza <= 1));
alter table nodo add column nap_revisado boolean not null default false;
create index nodo_nap_tema_idx on nodo (nap_tema_id);
```

- [ ] **Step 2: Aplicar la migración**

```bash
supabase db push --project-ref yqzlekflztbuyuzwmnip
```

Si el push no está disponible, aplicar vía Management API y registrar la fila en `supabase_migrations.schema_migrations` (patrón documentado en la memoria del proyecto).

- [ ] **Step 3: Escribir el test de integración**

```js
// tests/integration/nap-rls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

test('el catálogo NAP no es legible por anon', async () => {
  for (const tabla of ['nap_eje', 'nap_tema']) {
    const r = await fetch(`${URL}/rest/v1/${tabla}?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const cuerpo = await r.json();
    // RLS sin policies: 200 con [] o 401/403. Lo que NO puede pasar es que
    // devuelva filas.
    const filas = Array.isArray(cuerpo) ? cuerpo : [];
    assert.equal(filas.length, 0, `${tabla} filtró filas a anon`);
  }
});
```

Agregar en el mismo archivo el test del guard, que el spec pide y que protege la acción nueva de la Task 4:

```js
test('admin-observatorio sigue exigiendo un admin', async () => {
  const r = await fetch(`${URL}/functions/v1/admin-observatorio`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'desempeno', materia: 'Matemática', grado: 4 }),
  });
  assert.ok(r.status === 401 || r.status === 403, `esperaba 401/403, vino ${r.status}`);
});
```

- [ ] **Step 4: Correr los tests**

Run: `npm run test:db -- --test-name-pattern="NAP|admin-observatorio"`
Expected: PASS (necesita `SUPABASE_URL` y `SUPABASE_ANON_KEY`). El test del guard queda rojo hasta la Task 4 si se corre antes: es el orden esperado.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_marco_nap.sql tests/integration/nap-rls.test.mjs
git commit -m "feat(nap): esquema del marco curricular y mapeo en nodo"
```

---

### Task 2: Cargar el catálogo NAP

> **GATE — requiere fuente oficial.** El catálogo tiene que salir de las resoluciones del Consejo Federal de Educación (NAP de Nivel Primario). **No transcribir de memoria ni pedirle la lista a un modelo.** Antes de arrancar esta tarea, conseguir los PDF oficiales y tenerlos a la vista. Si no están disponibles todavía, **saltear a la Task 3**: las tareas 3, 4 y 8 no dependen del contenido del catálogo, solo del esquema.

**Files:**
- Create: `supabase/functions/_shared/nap.ts`
- Create: `web/lib/admin/nap.ts`
- Create: `tests/unit/nap-catalogo.test.mjs`
- Create: `scripts/seed-nap.mjs`

**Interfaces:**
- Consumes: tablas de Task 1.
- Produces: `CATALOGO_NAP: EjeNap[]` donde `EjeNap = { materia: string; nombre: string; orden: number; temas: { nombre: string; grado: number; orden: number }[] }`. `scripts/seed-nap.mjs` lo inserta idempotentemente.

- [ ] **Step 1: Escribir el test de integridad del catálogo (antes que el catálogo)**

```js
// tests/unit/nap-catalogo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO_NAP, MATERIAS_NAP } from '../../supabase/functions/_shared/nap.ts';
import { CATALOGO_NAP as ESPEJO } from '../../web/lib/admin/nap.ts';

test('las materias son exactamente las cuatro del marco', () => {
  assert.deepEqual([...MATERIAS_NAP].sort(),
    ['Ciencias Naturales', 'Ciencias Sociales', 'Lengua', 'Matemática'].sort());
});

test('todo eje declara una materia del marco y al menos un tema', () => {
  assert.ok(CATALOGO_NAP.length > 0, 'catálogo vacío');
  for (const eje of CATALOGO_NAP) {
    assert.ok(MATERIAS_NAP.includes(eje.materia), `materia fuera del marco: ${eje.materia}`);
    assert.ok(eje.temas.length > 0, `eje sin temas: ${eje.nombre}`);
    for (const t of eje.temas) {
      assert.ok(t.grado >= 1 && t.grado <= 7, `grado inválido en ${t.nombre}`);
      assert.ok(t.nombre.trim().length > 0, 'tema sin nombre');
    }
  }
});

test('no hay ejes duplicados por materia+nombre', () => {
  const claves = CATALOGO_NAP.map((e) => `${e.materia}|${e.nombre}`);
  assert.equal(new Set(claves).size, claves.length, 'eje duplicado');
});

test('no hay temas duplicados dentro de un eje y grado', () => {
  for (const eje of CATALOGO_NAP) {
    const claves = eje.temas.map((t) => `${t.nombre}|${t.grado}`);
    assert.equal(new Set(claves).size, claves.length, `tema duplicado en ${eje.nombre}`);
  }
});

test('el espejo del front es idéntico al del server', () => {
  assert.deepEqual(ESPEJO, CATALOGO_NAP);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/unit/nap-catalogo.test.mjs`
Expected: FAIL — no existe `_shared/nap.ts`.

- [ ] **Step 3: Transcribir el catálogo desde la fuente oficial**

Crear `supabase/functions/_shared/nap.ts` con esta forma exacta, completando los ejes y temas **leídos del documento oficial**:

```ts
// Catálogo NAP (Núcleos de Aprendizajes Prioritarios, Nivel Primario) — la vara
// fija del observatorio. Transcrito de las resoluciones del Consejo Federal de
// Educación; NO generado por un modelo. Espejado en web/lib/admin/nap.ts (test
// de paridad en tests/unit/nap-catalogo.test.mjs).
export const MATERIAS_NAP = ['Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales'] as const;

export type TemaNap = { nombre: string; grado: number; orden: number };
export type EjeNap = { materia: string; nombre: string; orden: number; temas: TemaNap[] };

export const CATALOGO_NAP: EjeNap[] = [
  // Ejemplo de la forma esperada — reemplazar por la transcripción real:
  // {
  //   materia: 'Matemática', nombre: 'Número y operaciones', orden: 0,
  //   temas: [{ nombre: 'Fracciones de uso frecuente', grado: 4, orden: 0 }],
  // },
];
```

Copiar el archivo a `web/lib/admin/nap.ts` (mismo contenido, encabezado que aclara que es el espejo).

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/unit/nap-catalogo.test.mjs`
Expected: PASS.

- [ ] **Step 5: Escribir el seed idempotente**

```js
// scripts/seed-nap.mjs — carga el catálogo NAP en la base. Idempotente:
// upsert por (materia, nombre) en eje y (eje_id, nombre, grado) en tema.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-nap.mjs
import { CATALOGO_NAP } from '../supabase/functions/_shared/nap.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan envs'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

for (const eje of CATALOGO_NAP) {
  const r = await fetch(`${URL}/rest/v1/nap_eje?on_conflict=materia,nombre`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ materia: eje.materia, nombre: eje.nombre, orden: eje.orden }]),
  });
  const [fila] = await r.json();
  if (!fila?.id) { console.error('eje falló:', eje.nombre, fila); process.exit(1); }
  const temas = eje.temas.map((t) => ({ eje_id: fila.id, nombre: t.nombre, grado: t.grado, orden: t.orden }));
  const rt = await fetch(`${URL}/rest/v1/nap_tema?on_conflict=eje_id,nombre,grado`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(temas),
  });
  if (!rt.ok) { console.error('temas fallaron:', eje.nombre, await rt.text()); process.exit(1); }
  console.log(`✓ ${eje.materia} — ${eje.nombre} (${temas.length} temas)`);
}
```

- [ ] **Step 6: Correrlo y verificar contra la base**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-nap.mjs
# Correrlo DOS veces: la segunda no debe duplicar nada.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/nap.ts web/lib/admin/nap.ts scripts/seed-nap.mjs tests/unit/nap-catalogo.test.mjs
git commit -m "feat(nap): catálogo curricular transcrito de los NAP oficiales"
```

---

### Task 3: Lógica pura de agregación

**Files:**
- Modify: `supabase/functions/admin-observatorio/observatorio-logica.ts`
- Test: `tests/unit/nap-desempeno.test.mjs`

**Interfaces:**
- Consumes: `K_ANONIMATO`, `pct`, `num` de `observatorio-logica.ts`.
- Produces:

```ts
export type NodoNap = { id: string; nap_tema_id?: string | null };
export type TemaCat = { id: string; eje_id: string; nombre: string; grado: number; orden: number };
export type EjeCat = { id: string; materia: string; nombre: string; orden: number };
export type AlumnoNodoNap = { alumno_id: string; nodo_id: string; puntaje?: number | null; estado?: string | null };

export type TemaDesempeno = {
  temaId: string; tema: string;
  alumnos: number; respuestas: number;
  precision: number | null; dominioPromedio: number | null; dominados: number | null;
  colegiosConTema: number; colegiosTotal: number;
  muestraInsuficiente: boolean;
};
export type EjeDesempeno = {
  ejeId: string; eje: string;
  alumnos: number;
  precision: number | null; dominioPromedio: number | null; dominados: number | null;
  colegiosConTema: number; colegiosTotal: number;
  muestraInsuficiente: boolean;
  temas: TemaDesempeno[];
};

export function desempenoPorEje(
  datos: {
    sesiones: SesionObs[];
    alumnoNodo: AlumnoNodoNap[];
    nodos: NodoNap[];
    ejes: EjeCat[];
    temas: TemaCat[];
    escuelaDeAlumno: Map<string, string | null | undefined>;
    provinciaDeAlumno: Map<string, string | null | undefined>;
  },
  filtro: { materia: string; grado: number; provincia?: string },
  k?: number,
): EjeDesempeno[];
```

**Diferencia clave con `agregarPorMateria`:** las filas nacen del **catálogo**, no de las sesiones. Un tema del marco que nadie practicó aparece igual, con `alumnos: 0` — que un tema no se esté enseñando es información (spec, sección Errores).

- [ ] **Step 1: Escribir los tests que fallan**

```js
// tests/unit/nap-desempeno.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desempenoPorEje, K_ANONIMATO } from '../../supabase/functions/admin-observatorio/observatorio-logica.ts';

// Catálogo mínimo: 1 eje de Matemática 4° con 2 temas.
const EJES = [{ id: 'e1', materia: 'Matemática', nombre: 'Número y operaciones', orden: 0 }];
const TEMAS = [
  { id: 't1', eje_id: 'e1', nombre: 'Fracciones', grado: 4, orden: 0 },
  { id: 't2', eje_id: 'e1', nombre: 'Suma y resta', grado: 4, orden: 1 },
];
// n1 → t1, n2 → t2, n3 fuera del marco.
const NODOS = [
  { id: 'n1', nap_tema_id: 't1' },
  { id: 'n2', nap_tema_id: 't2' },
  { id: 'n3', nap_tema_id: null },
];

// k alumnos de una escuela, todos con sesión en el nodo dado.
const sesiones = (n, prefijo, nodo, escuela, aciertos = 7, total = 10) =>
  Array.from({ length: n }, (_, i) => ({
    alumno_id: `${prefijo}${i}`, nodo_id: nodo, aciertos, total, escuela_id: escuela,
  }));
const mapaEscuela = (...grupos) => {
  const m = new Map();
  for (const [n, prefijo, escuela] of grupos) {
    for (let i = 0; i < n; i++) m.set(`${prefijo}${i}`, escuela);
  }
  return m;
};
const base = (extra = {}) => ({
  sesiones: [], alumnoNodo: [], nodos: NODOS, ejes: EJES, temas: TEMAS,
  escuelaDeAlumno: new Map(), provinciaDeAlumno: new Map(), ...extra,
});

test('un tema del catálogo sin práctica aparece igual, con 0 alumnos', () => {
  const [eje] = desempenoPorEje(base(), { materia: 'Matemática', grado: 4 });
  assert.equal(eje.temas.length, 2);
  assert.deepEqual(eje.temas.map((t) => t.tema), ['Fracciones', 'Suma y resta']);
  assert.equal(eje.temas[0].alumnos, 0);
  assert.equal(eje.temas[0].precision, null);
});

test('los nodos fuera del marco no entran en ningún agregado', () => {
  const datos = base({
    sesiones: sesiones(6, 'a', 'n3', 'esc1'), // nodo sin tema NAP
    escuelaDeAlumno: mapaEscuela([6, 'a', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  assert.equal(eje.alumnos, 0, 'un nodo sin nap_tema_id no debe sumar');
});

test('un tema con menos de k alumnos no publica métricas', () => {
  const datos = base({
    sesiones: sesiones(K_ANONIMATO - 1, 'a', 'n1', 'esc1'),
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO - 1, 'a', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.muestraInsuficiente, true);
  assert.equal(t1.precision, null);
  assert.equal(t1.dominioPromedio, null);
  assert.equal(t1.alumnos, K_ANONIMATO - 1, 'el conteo de volumen sí se muestra');
});

test('con k alumnos o más publica precisión y dominio', () => {
  const datos = base({
    sesiones: sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 7, 10),
    alumnoNodo: Array.from({ length: K_ANONIMATO }, (_, i) => ({
      alumno_id: `a${i}`, nodo_id: 'n1', puntaje: 60, estado: i === 0 ? 'dominado' : 'en_progreso',
    })),
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.muestraInsuficiente, false);
  assert.equal(t1.precision, 70);
  assert.equal(t1.dominioPromedio, 60);
  assert.equal(t1.dominados, 20, '1 de 5 alumnos dominó → 20%');
});

test('cobertura: solo cuentan los colegios que dan el tema, y nunca como cero', () => {
  // esc1 practica t1; esc2 solo practica t2. t1 debe decir "1 de 2 colegios"
  // y su promedio NO debe diluirse con esc2.
  const datos = base({
    sesiones: [
      ...sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 9, 10),
      ...sesiones(K_ANONIMATO, 'b', 'n2', 'esc2', 3, 10),
    ],
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1'], [K_ANONIMATO, 'b', 'esc2']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.colegiosConTema, 1);
  assert.equal(t1.colegiosTotal, 2);
  assert.equal(t1.precision, 90, 'esc2 no da el tema: no diluye');
});

test('un nodo publicado pero nunca practicado no cuenta como dar el tema', () => {
  const datos = base({
    alumnoNodo: [{ alumno_id: 'z0', nodo_id: 'n1', puntaje: 50, estado: 'en_progreso' }],
    escuelaDeAlumno: mapaEscuela([1, 'z', 'esc9']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.colegiosConTema, 0, 'sin sesiones no hay tema dado');
});

test('el eje pondera por alumnos con dato, solo sobre temas que pasan k', () => {
  // t1: 10 alumnos al 90%. t2: 4 alumnos (bajo k) al 10% → no debe mover el eje.
  const datos = base({
    sesiones: [
      ...sesiones(10, 'a', 'n1', 'esc1', 9, 10),
      ...sesiones(4, 'b', 'n2', 'esc1', 1, 10),
    ],
    escuelaDeAlumno: mapaEscuela([10, 'a', 'esc1'], [4, 'b', 'esc1']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4 });
  assert.equal(eje.precision, 90, 'el tema bajo k queda fuera del promedio del eje');
});

test('el filtro de provincia acota por la provincia del alumno', () => {
  const datos = base({
    sesiones: [
      ...sesiones(K_ANONIMATO, 'a', 'n1', 'esc1', 9, 10),
      ...sesiones(K_ANONIMATO, 'b', 'n1', 'esc2', 1, 10),
    ],
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1'], [K_ANONIMATO, 'b', 'esc2']),
    provinciaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'Neuquén'], [K_ANONIMATO, 'b', 'Chaco']),
  });
  const [eje] = desempenoPorEje(datos, { materia: 'Matemática', grado: 4, provincia: 'Neuquén' });
  const t1 = eje.temas.find((t) => t.temaId === 't1');
  assert.equal(t1.precision, 90);
  assert.equal(t1.colegiosTotal, 1, 'Chaco queda fuera del universo');
});

test('otro grado o materia no devuelve filas', () => {
  const vacio = desempenoPorEje(base(), { materia: 'Lengua', grado: 4 });
  assert.deepEqual(vacio, []);
  const otroGrado = desempenoPorEje(base(), { materia: 'Matemática', grado: 7 });
  assert.deepEqual(otroGrado, []);
});

test('ninguna respuesta lleva ids ni nombres de alumnos', () => {
  const datos = base({
    sesiones: sesiones(K_ANONIMATO, 'a', 'n1', 'esc1'),
    escuelaDeAlumno: mapaEscuela([K_ANONIMATO, 'a', 'esc1']),
  });
  const salida = JSON.stringify(desempenoPorEje(datos, { materia: 'Matemática', grado: 4 }));
  assert.equal(/"a\d"/.test(salida), false, 'se filtró un alumno_id');
  assert.equal(salida.includes('esc1'), false, 'se filtró un escuela_id');
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `node --test tests/unit/nap-desempeno.test.mjs`
Expected: FAIL con "desempenoPorEje is not a function".

- [ ] **Step 3: Implementar `desempenoPorEje`**

Agregar al final de `observatorio-logica.ts`. La escuela del alumno se lee **siempre** del mapa `escuelaDeAlumno`, nunca de un campo de la sesión.

```ts
// Desempeño contra el marco NAP (D-NAP1..D-NAP8). A diferencia de
// agregarPorMateria, las filas nacen del CATÁLOGO y no de las sesiones: un tema
// del marco que nadie practicó aparece igual, en cero — que un tema no se esté
// enseñando es información. Los nodos con nap_tema_id null quedan afuera de
// todo (así lo que está fuera del marco desaparece sin regla especial).
export function desempenoPorEje(
  datos: {
    sesiones: SesionObs[];
    alumnoNodo: AlumnoNodoNap[];
    nodos: NodoNap[];
    ejes: EjeCat[];
    temas: TemaCat[];
    escuelaDeAlumno: Map<string, string | null | undefined>;
    provinciaDeAlumno: Map<string, string | null | undefined>;
  },
  filtro: { materia: string; grado: number; provincia?: string },
  k: number = K_ANONIMATO,
): EjeDesempeno[] {
  const { sesiones, alumnoNodo, nodos, ejes, temas, escuelaDeAlumno, provinciaDeAlumno } = datos;
  const pasaFiltro = (alumnoId: string) =>
    !filtro.provincia || provinciaDeAlumno.get(alumnoId) === filtro.provincia;

  const ejesMateria = ejes.filter(
    (e) => normalizarTema(e.materia) === normalizarTema(filtro.materia),
  );
  if (ejesMateria.length === 0) return [];
  const ejeIds = new Set(ejesMateria.map((e) => e.id));
  const temasFiltro = temas.filter((t) => t.grado === filtro.grado && ejeIds.has(t.eje_id));
  if (temasFiltro.length === 0) return [];

  // nodo → tema. Un nodo sin nap_tema_id no entra al mapa y por lo tanto no
  // existe para el resto de la función.
  const temaDeNodo = new Map<string, string>();
  for (const n of nodos) if (n.nap_tema_id) temaDeNodo.set(n.id, n.nap_tema_id);

  // Universo: colegios con actividad en el filtro (denominador de la cobertura).
  const colegiosUniverso = new Set<string>();
  type Acum = { alumnos: Set<string>; escuelas: Set<string>; aciertos: number; total: number; puntajes: number[]; dominados: Set<string> };
  const nuevo = (): Acum => ({ alumnos: new Set(), escuelas: new Set(), aciertos: 0, total: 0, puntajes: [], dominados: new Set() });
  const porTema = new Map<string, Acum>();

  for (const s of sesiones) {
    if (!s.nodo_id || !pasaFiltro(s.alumno_id)) continue;
    const temaId = temaDeNodo.get(s.nodo_id);
    const escuela = escuelaDeAlumno.get(s.alumno_id);
    if (escuela) colegiosUniverso.add(escuela);
    if (!temaId) continue;
    let a = porTema.get(temaId);
    if (!a) { a = nuevo(); porTema.set(temaId, a); }
    a.alumnos.add(s.alumno_id);
    if (escuela) a.escuelas.add(escuela);
    a.aciertos += num(s.aciertos);
    a.total += num(s.total);
  }

  // Dominio y estado: SOLO sobre temas que ya tienen sesiones (D-NAP5: un nodo
  // publicado y nunca practicado no cuenta como dar el tema).
  for (const an of alumnoNodo) {
    if (!pasaFiltro(an.alumno_id)) continue;
    const temaId = temaDeNodo.get(an.nodo_id);
    if (!temaId) continue;
    const a = porTema.get(temaId);
    if (!a) continue;
    if (typeof an.puntaje === 'number' && Number.isFinite(an.puntaje)) a.puntajes.push(an.puntaje);
    if (an.estado === 'dominado') a.dominados.add(an.alumno_id);
  }

  const colegiosTotal = colegiosUniverso.size;
  const promedio = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;

  const filasDeEje = (ejeId: string): TemaDesempeno[] =>
    temasFiltro
      .filter((t) => t.eje_id === ejeId)
      .sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre, 'es'))
      .map((t) => {
        const a = porTema.get(t.id) ?? nuevo();
        const insuficiente = a.alumnos.size < k;
        return {
          temaId: t.id,
          tema: t.nombre,
          alumnos: a.alumnos.size,
          respuestas: a.total,
          precision: insuficiente ? null : pct(a.aciertos, a.total),
          dominioPromedio: insuficiente ? null : promedio(a.puntajes),
          dominados: insuficiente ? null : Math.round((a.dominados.size / a.alumnos.size) * 100),
          colegiosConTema: a.escuelas.size,
          colegiosTotal,
          muestraInsuficiente: insuficiente,
        };
      });

  // El eje pondera por alumnos con dato, SOLO sobre los temas que pasaron k
  // (un tema suprimido no puede mover el titular).
  const ponderar = (ts: TemaDesempeno[], campo: 'precision' | 'dominioPromedio' | 'dominados') => {
    let peso = 0, suma = 0;
    for (const t of ts) {
      const v = t[campo];
      if (v === null) continue;
      suma += v * t.alumnos;
      peso += t.alumnos;
    }
    return peso ? Math.round(suma / peso) : null;
  };

  return ejesMateria
    .sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre, 'es'))
    .map((e) => {
      const ts = filasDeEje(e.id);
      const publicables = ts.filter((t) => !t.muestraInsuficiente);
      const alumnos = new Set<string>();
      for (const t of temasFiltro.filter((t) => t.eje_id === e.id)) {
        for (const al of porTema.get(t.id)?.alumnos ?? []) alumnos.add(al);
      }
      const escuelas = new Set<string>();
      for (const t of temasFiltro.filter((t) => t.eje_id === e.id)) {
        for (const es of porTema.get(t.id)?.escuelas ?? []) escuelas.add(es);
      }
      return {
        ejeId: e.id,
        eje: e.nombre,
        alumnos: alumnos.size,
        precision: ponderar(publicables, 'precision'),
        dominioPromedio: ponderar(publicables, 'dominioPromedio'),
        dominados: ponderar(publicables, 'dominados'),
        colegiosConTema: escuelas.size,
        colegiosTotal,
        muestraInsuficiente: publicables.length === 0,
        temas: ts,
      };
    });
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `node --test tests/unit/nap-desempeno.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Correr todo el unit para verificar que no se rompió nada**

Run: `npm test`
Expected: PASS (503 + los nuevos).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-observatorio/observatorio-logica.ts tests/unit/nap-desempeno.test.mjs
git commit -m "feat(nap): agregación de desempeño por eje y tema del marco"
```

---

### Task 4: Acción `desempeno` en la Edge Function

**Files:**
- Modify: `supabase/functions/admin-observatorio/index.ts`
- Modify: `supabase/functions/admin-observatorio/observatorio-logica.ts` (retirar `topTemasQueCuestan`)
- Modify: `tests/unit/admin-observatorio.test.mjs` (retirar sus tests)

**Interfaces:**
- Consumes: `desempenoPorEje` de Task 3.
- Produces: `POST {accion:'desempeno', materia, grado, provincia?, rango_dias?}` → `{rango_dias, ejes: EjeDesempeno[]}`.

- [ ] **Step 1: Agregar la acción**

En el `switch (accion)`, antes del `default`:

```ts
      // Desempeño contra el marco NAP (D-NAP1..D-NAP8). `grado` OBLIGATORIO:
      // los temas de los NAP se definen por grado, mezclarlos juntaría
      // contenidos distintos bajo un mismo nombre.
      case 'desempeno': {
        const materia = body?.materia;
        if (!noVacio(materia)) return json({ error: 'falta_materia' }, 400);
        const grado = body?.grado;
        if (!Number.isInteger(grado) || grado < 1 || grado > 7) {
          return json({ error: 'grado_invalido' }, 400);
        }
        const provincia = body?.provincia;
        if (provincia !== undefined && provincia !== null && !esProvinciaValida(provincia)) {
          return json({ error: 'provincia_invalida' }, 400);
        }
        const [escuelas, alumnos, sesiones, nodos, alumnoNodo, ejes, temas] = await Promise.all([
          traerEscuelas(), traerAlumnos(), traerSesiones(), traerNodosNap(),
          traerAlumnoNodo(), traerEjes(materia), traerTemas(materia, grado),
        ]);
        const incluidos = soloIncluidos(sesiones, alumnos);
        const ejesOut = desempenoPorEje(
          {
            sesiones: incluidos,
            alumnoNodo,
            nodos,
            ejes,
            temas,
            escuelaDeAlumno: armarEscuelaDeAlumno(alumnos),
            provinciaDeAlumno: armarProvinciaDeAlumno(escuelas, alumnos),
          },
          { materia, grado, provincia: esProvinciaValida(provincia) ? provincia : undefined },
        );
        return json({ rango_dias: rango, ejes: ejesOut });
      }
```

Agregar los helpers `traerNodosNap` (`nodo` con `id, nap_tema_id`), `traerAlumnoNodo` (`alumno_id, nodo_id, puntaje, estado`), `traerEjes`, `traerTemas` y `armarEscuelaDeAlumno`, siguiendo el patrón de los `traer*` que ya están (con `MAX_FILAS`).

- [ ] **Step 2: Retirar `topTemasQueCuestan` y la acción `temas`**

Borrar de `observatorio-logica.ts`: `topTemasQueCuestan`, `TemaAgregado`, `MIN_RESPUESTAS_TEMA`, `TOP_TEMAS`. Borrar el `case 'temas'` de `index.ts`. Borrar sus tests de `tests/unit/admin-observatorio.test.mjs` y el import correspondiente.

`normalizarTema` **se conserva**: `indexarCurriculo` la usa para agrupar materias case-insensitive.

- [ ] **Step 3: Correr el unit**

Run: `npm test`
Expected: PASS. Si falla por un import de algo borrado, arreglar el import — no reintroducir la función.

- [ ] **Step 4: Deployar y probar contra la base real**

```bash
supabase functions deploy admin-observatorio --project-ref yqzlekflztbuyuzwmnip --use-api
```

Con un token de admin:

```bash
curl -s "$SUPABASE_URL/functions/v1/admin-observatorio" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $JWT_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"accion":"desempeno","materia":"Matemática","grado":4,"rango_dias":90}'
```

Expected: 200 con `{"ejes":[...]}`. Con el catálogo cargado pero sin práctica en Matemática, los temas salen en cero — es la conducta correcta.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-observatorio tests/unit/admin-observatorio.test.mjs
git commit -m "feat(nap): acción desempeno y retiro del top de temas aproximado"
```

---

### Task 5: Clasificador en `dividir-nodos`

**Files:**
- Modify: `supabase/functions/dividir-nodos/dividir.ts`
- Modify: `supabase/functions/dividir-nodos/index.ts`
- Test: `tests/unit/dividir-nap.test.mjs`

**Interfaces:**
- Consumes: `CATALOGO_NAP` (Task 2), columnas de Task 1.
- Produces: `NodoGen` gana `nap_tema_id: string | null` y `nap_confianza: number | null`. Nueva función pura `catalogoParaPrompt(materia: string, grado: number, temas: {id,nombre,eje}[]): string`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
// tests/unit/dividir-nap.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDivision, catalogoParaPrompt } from '../../supabase/functions/dividir-nodos/dividir.ts';

const TEMAS = [
  { id: 't1', nombre: 'Fracciones de uso frecuente', eje: 'Número y operaciones' },
  { id: 't2', nombre: 'Figuras planas', eje: 'Geometría y medida' },
];

test('catalogoParaPrompt lista los temas con su id y su eje', () => {
  const txt = catalogoParaPrompt('Matemática', 4, TEMAS);
  assert.ok(txt.includes('t1'));
  assert.ok(txt.includes('Fracciones de uso frecuente'));
  assert.ok(txt.includes('Número y operaciones'));
});

test('parseDivision acepta el mapeo cuando el tema existe', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'Fracciones', orden: 0, nap_tema_id: 't1', nap_confianza: 0.9 }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, 't1');
  assert.equal(d.nodos[0].nap_confianza, 0.9);
});

test('parseDivision acepta null: el clasificador puede decir que no sabe', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'Ética y convivencia', orden: 0, nap_tema_id: null }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, null);
  assert.equal(d.nodos[0].nap_confianza, null);
});

test('parseDivision descarta un tema inventado en vez de guardarlo', () => {
  const d = parseDivision(
    { nodos: [{ nombre: 'X', orden: 0, nap_tema_id: 'inventado', nap_confianza: 1 }] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_tema_id, null, 'un id fuera del catálogo cae a null');
  assert.equal(d.nodos[0].nap_confianza, null);
});

test('parseDivision acota la confianza a 0..1 y tolera basura', () => {
  const d = parseDivision(
    { nodos: [
      { nombre: 'A', orden: 0, nap_tema_id: 't1', nap_confianza: 5 },
      { nombre: 'B', orden: 1, nap_tema_id: 't2', nap_confianza: 'alta' },
    ] },
    'Matemática', 4, TEMAS,
  );
  assert.equal(d.nodos[0].nap_confianza, 1);
  assert.equal(d.nodos[1].nap_confianza, null);
});

test('sin catálogo, la división sigue funcionando y el mapeo queda null', () => {
  const d = parseDivision({ nodos: [{ nombre: 'A', orden: 0 }] }, 'Ética', 4, []);
  assert.equal(d.nodos[0].nap_tema_id, null);
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `node --test tests/unit/dividir-nap.test.mjs`
Expected: FAIL — `catalogoParaPrompt` no existe.

- [ ] **Step 3: Implementar en `dividir.ts`**

- `NodoGen` suma `nap_tema_id: string | null` y `nap_confianza: number | null`.
- `catalogoParaPrompt(materia, grado, temas)` devuelve una lista `- <id> · <eje> → <nombre>` con encabezado.
- `parseDivision(input, materia, grado, temas)`: cuarto parámetro con default `[]`. Por nodo, acepta `nap_tema_id` **solo si el id está en `temas`**; cualquier otra cosa cae a `null`. `nap_confianza` se acota con `Math.min(1, Math.max(0, n))` y solo si es número finito; si el tema quedó en `null`, la confianza también.
- En `TOOL_GUARDAR_DIVISION`, agregar al schema de cada nodo `nap_tema_id` (string, nullable) y `nap_confianza` (number 0..1).
- En `construirPromptDivision`, sumar el bloque del catálogo con la instrucción explícita: **"Si un nodo no corresponde con claridad a ninguno de estos temas, devolvé `nap_tema_id: null`. Es preferible dejarlo sin clasificar antes que forzar un encaje."**

- [ ] **Step 4: Correr para verificar que pasan**

Run: `node --test tests/unit/dividir-nap.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Persistir el mapeo en `index.ts`**

Traer los temas del grado y materia antes de llamar a Claude, pasarlos a `construirPromptDivision` y a `parseDivision`, y sumarlos al insert:

```ts
    const filas = division.nodos.map((n) => ({
      programa_id: programa!.id,
      nombre: n.nombre,
      orden: n.orden,
      descripcion: n.descripcion,
      nap_tema_id: n.nap_tema_id,
      nap_confianza: n.nap_confianza,
    }));
```

- [ ] **Step 6: Deployar y probar de punta a punta**

```bash
supabase functions deploy dividir-nodos --project-ref yqzlekflztbuyuzwmnip --use-api
```

Publicar una materia de prueba desde `/docente/autoria` y verificar en la base que los nodos quedaron con `nap_tema_id`. **Gasta API real** (Sonnet): una sola corrida.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/dividir-nodos tests/unit/dividir-nap.test.mjs
git commit -m "feat(nap): dividir-nodos propone el tema del marco al publicar"
```

---

### Task 6: Backfill de los nodos existentes

**Files:**
- Create: `scripts/backfill-nap.mjs`

**Interfaces:**
- Consumes: `catalogoParaPrompt` y el prompt de Task 5.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Escribir el script**

Idempotente: selecciona `nodo` con `nap_tema_id is null and nap_revisado = false`, los agrupa por `programa_id` (una llamada a Claude por programa, no por nodo), y actualiza. Imprime un resumen por programa: cuántos mapeó y cuántos quedaron sin tema. Acepta `--dry-run` que muestra lo que haría sin escribir.

- [ ] **Step 2: Correrlo en dry-run**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... \
  node scripts/backfill-nap.mjs --dry-run
```

Expected: lista los ~40 nodos y el tema propuesto para cada uno, sin escribir.

- [ ] **Step 3: Revisar la propuesta a ojo**

Leer la salida del dry-run. Si más de un tercio queda sin tema, el problema es el catálogo o el prompt, no los datos: parar y revisar antes de escribir.

- [ ] **Step 4: Correrlo de verdad y verificar**

```bash
node scripts/backfill-nap.mjs
```

Verificar en la base: `select count(*) from nodo where nap_tema_id is not null;`

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-nap.mjs
git commit -m "feat(nap): backfill del mapeo para los nodos ya publicados"
```

---

### Task 7: Cola de revisión del mapeo

**Files:**
- Modify: `supabase/functions/admin-colegios/index.ts`
- Create: `web/app/admin/observatorio/revision/page.tsx`
- Modify: `web/app/admin/nav.ts`

**Interfaces:**
- Consumes: columnas de Task 1.
- Produces: acciones `nap_revision_listar` → `{nodos: [{id, nombre, colegio, materia, grado, nap_tema_id, nap_confianza, temas_posibles}]}` y `nap_revision_fijar` `{nodo_id, nap_tema_id|null}` → `{ok:true}`.

- [ ] **Step 1: Agregar las acciones a la Edge Function**

`nap_revision_listar`: nodos con `nap_revisado = false` y (`nap_tema_id is null` o `nap_confianza < 0.7`), con su colegio, materia y grado, más los temas del catálogo de esa materia y grado para poblar el selector. `nap_revision_fijar`: setea `nap_tema_id` y `nap_revisado = true`, y **audita** (`registrarAuditoria`, como toda mutación admin).

- [ ] **Step 2: Escribir la pantalla**

Lista agrupada por colegio y materia. Por fila: nombre del nodo, el tema propuesto con su confianza, un `<select>` con los temas de esa materia y grado más la opción "Fuera del marco", y un botón "Confirmar". Usa los tokens de `web/lib/admin/tema.ts` y el patrón de las pantallas admin existentes.

- [ ] **Step 3: Sumarla al nav**

En `web/app/admin/nav.ts`, entrada bajo el grupo `vision`, junto a Observatorio, con el conteo de pendientes como badge (mismo patrón que Pases en el grupo `custodia`).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: limpio.

Smoke: abrir `/admin/observatorio/revision`, confirmar un nodo, y verificar en la base que quedó `nap_revisado = true` y que desapareció de la lista.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-colegios web/app/admin/observatorio/revision web/app/admin/nav.ts
git commit -m "feat(nap): cola de revisión del mapeo en el panel admin"
```

---

### Task 8: Pantalla "Desempeño por materia"

**Files:**
- Modify: `web/app/admin/observatorio/page.tsx`

**Interfaces:**
- Consumes: acción `desempeno` de Task 4; `MATERIAS_NAP` de Task 2.
- Produces: nada.

- [ ] **Step 1: Reemplazar el drill-down viejo**

Borrar el estado `celda`/`temas`/`cargandoTemas` y su panel. En su lugar, la sección nueva con: cuatro chips de materia (de `MATERIAS_NAP`), un selector de grado (1 a 7) y el selector de provincia que ya existe.

- [ ] **Step 2: Dibujar las filas**

Una fila por eje: nombre, número grande de dominio, barra, y la cobertura como `3 de 5 colegios`. Click en el eje despliega sus temas con el mismo formato, indentados. Celda sin muestra suficiente → "muestra insuficiente" en vez del número, con el gris de `ADMIN.neutro`. Tema con `alumnos: 0` → "sin datos todavía".

**La cobertura va siempre visible al lado del número** (D-NAP5). No es decoración: sin ella, un tema que da un solo colegio se lee como dato provincial.

Estado vacío obligatorio: si `ejes` vuelve vacío, la sección dice que **todavía no hay catálogo cargado para esa materia y grado** y no un error genérico — es la diferencia entre "falta cargar los NAP" y "algo se rompió", y el que la va a leer no puede distinguirlas solo. Mismo criterio que `web/lib/setup.ts`, que distingue cargando / error / vacío.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: limpio.

- [ ] **Step 4: Smoke visual**

Abrir `/admin/observatorio` con un admin real, elegir Matemática 4°, y confirmar: se ven los ejes, se despliegan los temas, y las celdas chicas dicen "muestra insuficiente".

- [ ] **Step 5: Commit**

```bash
git add web/app/admin/observatorio/page.tsx
git commit -m "feat(nap): desempeño por eje y tema en el observatorio"
```

---

### Task 9: Datos de demostración

**Files:**
- Modify: `scripts/seed-actividad.mjs`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Extender el seed**

Agregar al colegio demo alumnos suficientes por grado para pasar `k=5` con margen (8 por grado), y sembrar práctica en **Lengua y Matemática** — hoy Matemática tiene 40 nodos y cero sesiones, por eso no aparece en ningún agregado. Repartir la práctica entre varios temas para que haya filas con datos y filas en cero, que es como se va a ver en la realidad.

**Los umbrales de anonimato no se tocan.** Se arregla el dato, no la vara.

- [ ] **Step 2: Correrlo**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-actividad.mjs
```

- [ ] **Step 3: Verificar de punta a punta**

Abrir `/admin/observatorio` → Matemática, cada grado sembrado. Confirmar que hay ejes con número real, temas con cobertura "N de M colegios", y al menos una celda en "muestra insuficiente" (que el k sigue vivo).

- [ ] **Step 4: Correr todo**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-actividad.mjs
git commit -m "feat(nap): volumen y práctica en Matemática para la demo"
```

---

## Notas de secuencia

- **La Task 2 es la única bloqueada por material externo** (los NAP oficiales). Las tareas 3, 4 y 8 dependen del *esquema*, no del *contenido* del catálogo: si las fuentes tardan, se puede avanzar con ellas y volver.
- Las tareas 5 y 6 **gastan API real** (Sonnet). La 6 tiene `--dry-run` justamente para no gastar dos veces.
- La Task 4 borra `topTemasQueCuestan`. Si algo más lo importa, aparece en `npm test` — no reintroducirlo, arreglar el consumidor.
