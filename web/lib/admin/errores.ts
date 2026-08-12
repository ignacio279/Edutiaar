// Copys de error del panel admin. Módulo PURO a propósito: `admin/api.ts`
// importa el cliente de Supabase con el alias `@/`, que solo resuelve dentro
// del bundler de Next — al vivir ahí, estos textos no se podían testear.
// Acá los lee Node directo (tests/unit/edge-red.test.mjs) y api.ts los
// re-exporta, así ninguna pantalla cambia sus imports.

// Los errores de red con el copy del PANEL: los lee un operador técnico, así
// que dicen el diagnóstico real en vez de mandarlo a revisar un cable que está
// bien. Va aparte porque las pantallas admin spreadean DESPUÉS los mapas de
// dominio (transferencias, licencias, ARCO), que están escritos para maestras y
// familias — y pisarían este copy. Por eso cada página admin lo spreadea AL
// FINAL, después de los de dominio.
export const ERRS_RED_ADMIN: Record<string, string> = {
  sin_conexion: 'Tu equipo está sin internet. Revisá la conexión y probá de nuevo.',
  sin_respuesta: 'El servidor no respondió. Si es una sección nueva, puede que su Edge Function todavía no esté deployada.',
};

// Copys de los errores comunes del guard (cada página suma los suyos).
export const ERRS_ADMIN: Record<string, string> = {
  no_autenticado: 'Tu sesión venció. Entrá de nuevo.',
  no_admin: 'Tu cuenta no tiene acceso al panel de administración.',
  requiere_super: 'Esta acción es solo para el super-admin.',
  ...ERRS_RED_ADMIN,
};
