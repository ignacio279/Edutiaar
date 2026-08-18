// Clasificación clave/rutina de las acciones de auditoría (fase "Auditoría
// legible", 2026-08-18). Spec: docs/superpowers/specs/2026-08-18-auditoria-legible-design.md
//
// COPIA ESPEJO de RUTINA en web/lib/admin/auditoria-relato.ts. Existe porque el
// filtro tiene que aplicarse EN LA QUERY: una página de 50 eventos llena de
// `nap_revision_fijar` se vería vacía si el filtro fuera solo del lado del
// cliente. Mismo patrón que planes.ts y provincias.ts — un test de paridad
// (tests/unit/admin-auditoria-relato.test.mjs) congela las dos copias.
//
// Solo se enumera lo RUTINA: todo lo demás es clave, incluida una acción que
// nadie clasificó todavía (D4 — fallar hacia lo visible, nunca hacia el
// silencio).

export const ACCIONES_RUTINA: readonly string[] = [
  'nap_revision_fijar', 'nap_backfill',
  'recalcular_alertas', 'job_nocturno',
  'atender_alerta',
  'crear_nota', 'borrar_nota', 'editar_contacto',
  'editar_colegio', 'editar_institucion',
  'editar_anuncio', 'activar_anuncio', 'desactivar_anuncio', 'borrar_anuncio',
  // Contabilidad del vínculo alumno↔colegio que escriben los triggers de la
  // base. Cada una dispara EN EL MISMO INSTANTE que un `alumno_transicion`
  // que cuenta el mismo hecho mejor (con `de`, `a` y `motivo`), así que
  // mostrar ambas duplicaría cada inscripción. La clave se queda; ésta no.
  'matricula_abierta', 'matricula_cerrada',
] as const;
