// Lógica pura de la pantalla /setup (configurar el aula).
// Módulo standalone (sin imports ni DOM) para que node --test lo cargue directo.

// Estado de una lista que se trae de la DB. Distinguirlos importa: una lista
// vacía y una consulta que falló se veían igual ("Cargando…" para siempre), y
// así se escondió que el front viejo pedía la tabla `escuela` en vez de la
// vista pública `escuela_publica` (migración 0018 le sacó el listado a anon).
export type Carga = 'cargando' | 'listo' | 'error';

// Qué decir cuando la lista no tiene nada para mostrar.
export function textoVacio(carga: Carga, vacio: string): string {
  if (carga === 'cargando') return 'Cargando…';
  if (carga === 'error') return 'No se pudo cargar';
  return vacio;
}
