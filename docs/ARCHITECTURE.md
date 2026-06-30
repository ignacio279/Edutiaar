# Arquitectura — EDUTIA

## Visión general

```
[ Frontend ]        [ Backend / datos ]              [ IA ]
  Vercel    ───────►  Supabase           ───────►   Claude API
  (web)               (Postgres + Auth                (Anthropic)
                       + Edge Functions)
```

- **Vercel** sirve el frontend (**Next.js** / App Router / React, en `web/`) bajo `www.edutia.ar` (`edutia.ar` redirige a `www`; el alias `edutiaar.vercel.app` sigue activo).
- **Supabase** es todo el backend: base de datos Postgres, autenticación (docente y alumno), y Edge Functions (lógica de servidor en TypeScript/Deno). Las APIs REST de cada tabla se generan automáticamente.
- **Claude API** es el cerebro de SOL. Se llama **desde una Edge Function de Supabase**, nunca desde el navegador.

## Flujo de una sesión de práctica

1. El alumno entra (login por avatar) → el front pide sus nodos y ejercicios a Supabase.
2. El front muestra un ejercicio (sacado del **pool** en la tabla `ejercicio`).
3. El chico responde → el front guarda la `respuesta` en Supabase.
4. La **app corrige** comparando contra `ejercicio.correcta` (sin llamar a la IA).
5. Al cerrar la sesión, la app actualiza `alumno_nodo` (estado del nodo de ese chico).

## SOL (el copiloto de IA)

SOL usa Claude para **dos cosas, y solo dos**:

1. **Dividir el programa en nodos.** Se le pasa el texto del `programa` a Claude y devuelve la lista de nodos, que se guardan en la tabla `nodo`. Se hace una vez por programa.
2. **Generar ejercicios.** Claude genera ejercicios de opción múltiple adaptados al nivel y a la **zona** del alumno (dato que viene de `escuela.zona`). Se generan en **lotes** y se guardan en `ejercicio` (pool).

**Lo que SOL NO hace:** corregir respuestas. Eso lo hace la app (comparación simple). Esto baja muchísimo el costo de la API.

### Dos caminos para la generación (división de nodos + ejercicios)

- **MVP local (hoy):** se generan con **scripts Node locales** (`scripts/dividir-nodos-local.mjs`, `scripts/generar-ejercicios-local.mjs`) que usan el **Claude Agent SDK** sobre la **suscripción de Claude Code del desarrollador** (sin API key, costo cero). Escriben el contenido real en Supabase con `service_role`. La lógica de prompt/validación es pura y compartida (`supabase/functions/dividir-nodos/dividir.ts`, `supabase/functions/generador-ejercicios/generar.ts`).
- **Producción (cuando haya API key):** las mismas piezas puras se invocan desde **Edge Functions** (`dividir-nodos` ya existe; `generador-ejercicios` queda por desplegar) con la **API key server-side**. La suscripción NO sirve para el backend desplegado (la Messages API necesita key con billing).
- El **diagnóstico por sesión** (`evaluar-sesion`) es runtime per-chico: corre en Edge Function (mock hasta tener key).

### Control de costos de la API

- Generar en lotes (pool), no uno por click.
- **Tope de uso** configurado.
- La **API key vive en la Edge Function** (variable de entorno del servidor), nunca expuesta.
- El costo de la API corre por cuenta de EDUTIA (cliente), con su propia cuenta.

## Seguridad

- **RLS (Row Level Security)** activado en todas las tablas: cada alumno ve solo sus datos; cada docente, solo sus alumnos.
- Son **menores**: no recolectar datos personales innecesarios; prever borrado/export de datos de un alumno.
- Secretos (API keys, claves de Supabase) en variables de entorno.

## Hosting y entornos

- Front en Vercel (deploy automático desde GitHub en cada push).
- Supabase: plan **Free** para desarrollo; **Pro ($25/mes)** en producción (evita la pausa por inactividad y suma backups). Con tope de gasto activado.