# PRD — EDUTIA (MVP)

## Problema

En muchas escuelas rurales de Argentina, una sola docente atiende a todos los grados de primaria al mismo tiempo (plurigrado, 6 a 13 años). Es muy difícil darle a cada alumno práctica adaptada a su nivel y saber en qué está trabado cada uno. Hoy ese seguimiento es manual o no existe.

## Usuarios (MVP)

- **Alumno** (6–13 años, primaria rural): practica Lengua con SOL.
- **Docente** (la maestra del aula): ve qué hizo cada chico y su recorrido en el tiempo, para saber qué reforzar.

> Director y familia son roles de Fase 2, fuera del MVP.

## Cómo funciona (el ciclo)

1. A cada alumno se le carga la **materia** con su **programa** (el contenido del año).
2. **SOL divide el programa en nodos** (temas concretos: vocales, sílabas, etc.).
3. El chico practica; **SOL genera** los ejercicios adaptados a su nivel y a su zona.
4. La app **evalúa** cada respuesta (correcta/incorrecta, tiempo, reintentos) y detecta patrones.
5. Los **nodos son permanentes**: su estado mejora mes a mes y refleja el nivel real del chico.
6. La **docente ve el recorrido** de cada alumno y decide qué reforzar.

## Diferencial

**Contenido con identidad local.** SOL usa ejemplos de la zona del chico (paisajes, animales del lugar) para que aprenda desde lo que conoce.

## Criterios de éxito (piloto)

- Una escuela rural usa EDUTIA con sus alumnos durante el piloto.
- SOL divide el programa de Lengua en nodos coherentes (validado por la docente).
- Los ejercicios usan ejemplos de la zona y son apropiados al nivel.
- La docente puede ver, por alumno, su recorrido a lo largo de las semanas.

## Alcance

**Incluye (MVP):** SOL vía Claude API · una materia (Lengua) y un grado · ejercicios de opción múltiple con ejemplos locales · evaluación automática y dificultad adaptativa · nodos permanentes con histórico mes a mes · registro de respuestas · roles docente y alumno · panel de la docente · app web bajo www.edutia.ar.

**NO incluye (Fase 2):** autoría de materias/programas por la docente · varias materias/grados · roles director y familia · LUNA y TERRA · offline · satelital · multilingüe · ejercicios de texto libre evaluados por IA.