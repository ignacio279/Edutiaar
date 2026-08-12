# Checklist de deploy — Fase "Alumno golondrina"

> Continúa el deploy del admin v3 y del Observatorio (`DEPLOY_ADMIN_V3.md` y
> `DEPLOY_OBSERVATORIO_AVISOS.md` van primero si aún no se corrieron). Todo
> **en orden**. Spec: `superpowers/specs/2026-08-10-alumno-golondrina-design.md` · ADR-011.

## 1. Migraciones (0022 → 0027, EN ORDEN)

| # | Qué hace | Backfill |
|---|---|---|
| `0022_matricula_estado_alumno.sql` | `matricula` + `perfil.estado` + máquina de estados + RPCs `matricula_abrir`/`matricula_cerrar` + triggers `matricula_sync`/`perfil_guard` | una matrícula activa por alumno con escuela; huérfanos → `en_transito` |
| `0023_consentimiento_transferencia.sql` | `consentimiento` + `transferencia` (CHECK duro) + `plataforma_config` + `matricula_abrir` v2 | deuda `pendiente_regularizar` por alumno |
| `0024_arco.sql` | `arco_caso` + `perfil.excluido_procesamiento` + `perfil_guard` v2 + RPC `arco_set_exclusion` | — |
| `0025_instituciones.sql` | `institucion` + `escuela.institucion_id` + `institucion_admin` | — |
| `0026_licencias.sql` | `licencia` + `licencia_asignacion` + guard de cupos + `acceso_calcular` v2 | una licencia por colegio (trial→`prueba`, resto→`activa`) |
| `0027_transferencia_lockout.sql` | lockout del link público (`intentos_fallidos`, `bloqueada_hasta`) | — |

**Verificación post-migración** (SQL, deben dar 0 diferencias):
```sql
-- caché == matrícula activa
select count(*) from perfil p join matricula m on m.alumno_id = p.id and m.fecha_fin is null
where p.escuela_id is distinct from m.escuela_id or p.aula_id is distinct from m.aula_id
   or p.docente_id is distinct from m.docente_id or p.grado is distinct from m.grado;
-- alumnos con escuela sin matrícula activa
select count(*) from perfil where rol='alumno' and escuela_id is not null
  and not exists (select 1 from matricula m where m.alumno_id = perfil.id and m.fecha_fin is null);
-- una licencia por colegio
select count(*) from escuela e where not exists (select 1 from licencia l where l.escuela_id = e.id);
```

## 2. Edge Functions

**Nuevas (6):** `gestion-transferencias`, `transferencia-confirmar`
(**pública**: deployar con `--no-verify-jwt` / respetar `config.toml`),
`gestion-consentimientos`, `admin-arco`, `admin-instituciones`,
`institucion-panel`.
**Modificadas (3):** `gestion-alumnos` (matrícula en vez de borrado),
`admin-jobs` (expirar transferencias), `admin-observatorio` (filtro de
oposición ARCO).

Cualquier deploy sube `_shared/` completo (incluye `matricula-logica.ts` y el
`verificarAdminInstitucion` de `admin.ts`), pero hay que deployar **las 9**
para que cada una tome su código. `config.toml` ya declara los `verify_jwt`.

## 3. Front (Vercel)

Deploy normal de `web/`. Rutas nuevas: `/transferir/[id]` (pública, la
familia), `/docente/transferencias`, `/admin/transferencias`, `/admin/arco`,
`/admin/instituciones`, `/admin/licencias`, `/institucion` (login propio).

## 4. Seeds (opcional, demo)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-golondrina.mjs
```
Crea la Fundación Semillas (2 colegios, pool con cupos), Wanda (historial en
2 colegios), Simón (en tránsito + transferencia pendiente — imprime el link
de demo) y un caso ARCO ejecutado. Admin de institución:
`coordinacion@semillas.org.ar` / `semillas123`.

## 5. Smoke del ciclo completo

1. Como docente origen: generar un pase (link) para un alumno propio.
2. Abrir el link sin sesión → confirmar como la familia (adulto + vínculo).
3. Verificar: consentimiento `vigente` creado, matrícula vieja cerrada
   (docente origen ya no ve el legajo vivo; sus boletines siguen), matrícula
   nueva activa sin aula.
4. Como docente destino: "Llegadas" → activar (aula + grado + PIN) → el
   alumno entra con el código del aula nueva y su recorrido completo.
5. Reusar el link → `ya_resuelta`. 5 tokens malos → bloqueo 15 min.
6. `/admin/arco`: exportar legajo, y cancelación de un alumno de prueba
   (dry-run → confirmar con super) → solo quedan `arco_caso` y auditoría.
7. `/institucion`: el admin de institución ve SOLO agregados de sus colegios;
   cualquier fn `admin-*` de plataforma le da 403.

## 6. Tests de integración contra la DB real

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db
```
Incluye: `matricula.test.mjs` (ciclo de vida + guard), `transferencias.test.mjs`
(token/lockout/CHECK), `arco.test.mjs` (cancelación end-to-end),
`instituciones.test.mjs` (cruces que deben fallar + licencias).
