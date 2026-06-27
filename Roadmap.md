# Roadmap — EDUTIA (Fase 1 / MVP)

> Regla: **slices verticales.** Cada etapa termina en algo demostrable. Cada etapa (1–4) coincide con un hito que se le cobra al cliente. No diseñar etapas futuras en detalle: diseñar lo justo para la etapa actual.

## Etapa 0 — Setup (el terreno)
- [ ] Crear las tablas en Supabase (ver `DATA_MODEL.md`).
- [ ] Activar **RLS** en todas las tablas.
- [ ] Crear repo en GitHub y subir el frontend existente.
- [ ] Conectar el repo a **Vercel** y deployar (la web carga online).
- [ ] Guardar claves como **variables de entorno** (Supabase URL/key en el front; **API key de Claude del lado del servidor**).

**Demo:** la web carga en Vercel y se conecta a Supabase.

## Etapa 1 — Fundación: que entren las personas (Hito 1)
- [ ] Conectar el front con Supabase (cliente JS).
- [ ] Login de la **docente** (email + contraseña, Supabase Auth).
- [ ] Login del **alumno** adaptado (elige avatar, sin escribir).
- [ ] Cargar **datos semilla**: escuela (con zona), materia Lengua, programa, alumnos de prueba.
- [ ] Cada rol entra y ve su pantalla inicial (aunque esté vacía).

**Demo:** la maestra y un alumno se loguean y ven su pantalla.

## Etapa 2 — SOL: generar y practicar (Hito 2)
- [ ] Edge Function que llama a Claude (key en el server). Test: devuelve un ejercicio.
- [ ] Función "dividir el programa en nodos": pasa el programa a Claude, guarda los `nodo`.
- [ ] Generar **pool de ejercicios** por nodo y guardar en `ejercicio`.
- [ ] Pantalla **Mi mapa** del alumno (nodos desde la base).
- [ ] Pantalla **Practicar** (SOL presenta un ejercicio con opciones).

**Demo:** el chico ve su mapa y SOL le da un ejercicio real de Lengua.

## Etapa 3 — Evaluación y estado (Hito 3)
- [ ] Al responder: la app corrige sola, mide tiempo y reintentos, guarda `respuesta`.
- [ ] Crear `sesion` por cada práctica.
- [ ] **Regla del nodo:** definir cuándo pasa a `dominado` y actualizar `alumno_nodo` (ver `DECISIONS.md`).
- [ ] Dificultad adaptativa (sube si acierta, baja si falla).
- [ ] El mapa se pinta solo según `alumno_nodo`.

**Demo:** el chico practica y su mapa cambia de color solo.

## Etapa 4 — Panel de la docente (Hito 4)
- [ ] **Mis alumnos**: lista con la actividad del día (sesiones de hoy).
- [ ] Etiqueta de estado por alumno (a quién atender).
- [ ] **Detalle del alumno**: su mapa + lo de hoy + sugerencia de SOL.
- [ ] **Histórico mes a mes** (sesiones agrupadas por mes).

**Demo:** la maestra ve el recorrido completo de cada chico.

## Cierre — Pulido y piloto
- [ ] Manejo de errores (SOL no responde / sin conexión).
- [ ] Tope de uso de la API.
- [ ] Flujo mínimo de privacidad de menores.
- [ ] Probar con un chico real.
- [ ] Pasar Supabase a **Pro** al ir a producción (con tope de gasto).