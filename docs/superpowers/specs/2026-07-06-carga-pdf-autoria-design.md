# Carga de PDF en la autoría docente

**Fecha:** 2026-07-06 · **Estado:** aprobado

## Qué

La docente puede adjuntar un PDF con el plan de estudios en `/docente/autoria` (además de, o en lugar de, pegar texto). El PDF viaja en base64 a la Edge Function `dividir-nodos`, que ya soporta `pdf_base64` y se lo pasa a Claude como bloque `document` nativo (PDF support de la Messages API). SOL lee el PDF y lo divide en nodos.

## Por qué

El backend quedó listo en SP-2 pero el front nunca tuvo el input de archivo: hoy solo se puede pegar texto. Con SOL en Claude real (2026-07-06) el camino PDF ya es usable de punta a punta.

## Diseño

1. **Front (`web/app/docente/autoria/page.tsx`)** — botón "Adjuntar PDF" (input file oculto, `accept=application/pdf`) + chip con nombre/tamaño y × para sacarlo. `generar()` exige texto **o** PDF; si hay PDF lo lee con `FileReader`/`arrayBuffer` y manda `pdf_base64` (sin prefijo `data:`). Se pueden mandar ambos.
2. **Lógica pura (`web/lib/autoria.ts`, nuevo)** — `validarArchivoPdf(nombre, tipo, bytes)` (solo PDF, no vacío, tope 10 MB: el request a la Edge Function aguanta ~20 MB y base64 infla +33%) y `bytesABase64(buffer)` chunked (`btoa` con spread revienta el stack en archivos grandes). Unit tests en `tests/unit/autoria.test.mjs`.
3. **Edge Function (`dividir-nodos`)** — dos retoques + redeploy:
   - `construirPromptDivision` con contenido vacío (caso PDF-only) manda "El programa a dividir en nodos está en el documento PDF adjunto" en vez de un mensaje vacío.
   - Guard temprano: modo mock / sin API key + PDF sin texto → `pdf_requiere_api_key` (400), porque el mock no lee PDF (hoy devolvería 0 nodos y quedaría un `programa` huérfano).

Sin migraciones ni tablas nuevas. RLS y flujo JWT intactos. Regla 1 intacta: la key sigue solo server-side.

## Fuera de alcance

Otros formatos (docx, imágenes), almacenamiento del PDF (no se persiste; solo se usa para la división), OCR de escaneos ilegibles.
