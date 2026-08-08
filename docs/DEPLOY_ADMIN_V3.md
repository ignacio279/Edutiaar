# Checklist de deploy — Dashboard admin v3

> Todo lo de esta rama está en el repo, pero **nada de esto toca la base ni las
> funciones en producción hasta correr estos pasos**. Orden importa.
> Spec: `superpowers/specs/2026-08-05-admin-dashboard-v3-design.md` · ADR-009.

## 1. Migraciones (en orden)

Aplicar contra el proyecto de Supabase (`yqzlekflztbuyuzwmnip`), vía MCP o CLI:

1. `supabase/migrations/0018_admin_dashboard.sql` — esquema transversal.
2. `supabase/migrations/0019_crm.sql` — notas y alertas atendidas.
3. `supabase/migrations/0020_anuncios.sql` — anuncios.

`0018` hace dos cosas que conviene mirar después de aplicar:
- `update escuela set estado = 'activo'` (backfill: la escuela semilla sigue
  operando igual que hoy).
- **Dropea las policies anon de `0004`** y las reemplaza por las vistas
  `escuela_publica` / `aula_publica`. Verificar que `/setup` sigue listando
  colegios y aulas (el front ya consulta las vistas).

## 2. Super-admin

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
ADMIN_EMAIL=jorge@edutia.ar ADMIN_PASSWORD='<una buena>' ADMIN_NOMBRE=Jorge \
node scripts/seed-admin.mjs
```
Idempotente. Crea el usuario de Auth y su fila en `plataforma_admin` con nivel
`super`. **No crea fila en `perfil`** (ADR-009): el admin no es docente.

## 3. Edge Functions

**Nuevas (11)** — `admin-colegios`, `admin-maestras`, `admin-accesos`,
`admin-features`, `admin-metricas`, `admin-costos`, `admin-crm`,
`admin-anuncios`, `admin-auditoria`, `admin-plataforma`, `admin-impersonar`.

**Modificadas (10)** — `sol`, `sol-chat`, `dividir-nodos`, `evaluar-sesion`,
`generador-ejercicios`, `luna-boletin`, `luna-chat`, `gestion-alumnos`,
`alumno-login`, `aula-students`. Todas dependen de `_shared/acceso.ts`,
`_shared/acceso-logica.ts`, `_shared/uso.ts`, `_shared/precios.ts`,
`_shared/admin.ts` y `_shared/auditoria.ts` — al deployar cualquiera se sube
`_shared` completo, así que **deployar las 21**.

Vía CLI (`supabase functions deploy <nombre> --use-api`) o MCP. `config.toml`
ya declara `verify_jwt = true` para las 11 nuevas.

> Pendiente arrastrado de LUNA: `luna-boletin` y `luna-chat` seguían debiendo el
> re-deploy con los prompts v2. Este deploy lo cubre.

## 4. Supabase Auth

Allow-listear la **redirect URL** del link de invitación
(`auth.admin.generateLink({type:'recovery'})`) que usan `admin-maestras` y
`admin-plataforma`. Sin esto el link muere en un error de redirect:
`https://www.edutia.ar/**` ya debería estar; verificarlo.

## 5. Smoke en producción

1. Entrar a `https://www.edutia.ar/admin/login` con el super-admin. Un docente
   logueado NO debe poder entrar (el layout lo saca).
2. Crear un colegio → nace en `trial` con 30 días y su fila de features.
3. Crear una maestra en ese colegio → copiar el link, abrirlo en incógnito y
   fijar contraseña.
4. Apagar LUNA en Features → en el panel de esa maestra el ítem LUNA
   **desaparece** (y entrar a mano muestra "no está habilitada").
5. Poner `trial_fin` en el pasado (Accesos) → banner de solo lectura; generar
   un boletín o un pool devuelve `trial_vencido`; **leer sigue andando**.
6. "+30 días" → todo vuelve a la normalidad.
7. Suspender el colegio → los chicos no entran (`colegio_suspendido` en
   `aula-students`).
8. Revisar `/admin/auditoria`: todos esos pasos tienen que estar registrados.
9. Después de un rato de uso real, `/admin/costos` debe mostrar filas
   (`uso_api` se llena con cada llamada a Claude).

## 6. Tests contra la DB real

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db
```
Idempotentes (crean y borran lo suyo). Ojo: los del generador **queman API
real** (~4-6 min). Los tests admin que pegan a las Edge Functions necesitan que
estén deployadas; si no, el assert muestra el body con el 404 para
diagnóstico.

## 7. Opcional — dominio propio

Mapear `admin.edutia.ar` en Vercel apuntando a la misma app. **No requiere
cambios de código**: la sección ya vive en `/admin`. Mientras tanto,
`www.edutia.ar/admin` funciona y no está linkeado desde ningún lado.
