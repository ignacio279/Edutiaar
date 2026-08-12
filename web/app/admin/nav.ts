// Navegación del panel admin — CONGELADA para los work-packages (la clave
// anti-conflictos del trabajo en paralelo: cada sección reemplaza SU page.tsx
// stub, nada más). Solo se edita en las fases secuenciales de fundaciones
// (Fase 0 la creó; "Observatorio y avisos" sumó Observatorio; "Alumno
// golondrina" sumó Transferencias, Instituciones, Licencias y ARCO; el restyle
// 2026-08 al mock Admin.dc.html sumó el grupo VISIÓN — `vision: true` agrupa
// Observatorio/Capacitación/Exportaciones bajo ese label con chip "Pronto",
// supersede la regla vieja de "Capacitación/Exportaciones no van en el nav").
// El campo `icono` se conserva por los tests aunque el sidebar ya no lo pinte.
export type AdminNavItem = {
  key: string;
  label: string;
  ruta: string;
  icono: string; // clave de uiIcon (web/lib/art.ts)
  soloSuper?: boolean;
  vision?: boolean; // va en el grupo VISIÓN del sidebar (chip "Pronto")
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: 'inicio', label: 'Inicio', ruta: '/admin', icono: 'sunI' },
  { key: 'colegios', label: 'Colegios', ruta: '/admin/colegios', icono: 'mapI' },
  { key: 'instituciones', label: 'Instituciones', ruta: '/admin/instituciones', icono: 'building' },
  { key: 'maestras', label: 'Maestras', ruta: '/admin/maestras', icono: 'people' },
  { key: 'transferencias', label: 'Transferencias', ruta: '/admin/transferencias', icono: 'swap' },
  { key: 'licencias', label: 'Licencias', ruta: '/admin/licencias', icono: 'coin' },
  { key: 'metricas', label: 'Métricas', ruta: '/admin/metricas', icono: 'chart' },
  { key: 'costos', label: 'Costos y salud', ruta: '/admin/costos', icono: 'coin' },
  { key: 'alertas', label: 'Alertas', ruta: '/admin/alertas', icono: 'bell' },
  { key: 'anuncios', label: 'Anuncios', ruta: '/admin/anuncios', icono: 'megaphone' },
  { key: 'auditoria', label: 'Auditoría', ruta: '/admin/auditoria', icono: 'book' },
  // ARCO (Ley 25.326) lo ve también el operativo: hace acceso, rectificación y
  // oposición, y puede SOLICITAR la cancelación. Confirmar el borrado es lo
  // único de super, y eso lo corta la fn (requiere_super), no el menú.
  { key: 'arco', label: 'ARCO', ruta: '/admin/arco', icono: 'book' },
  { key: 'config', label: 'Administradores', ruta: '/admin/config', icono: 'gear', soloSuper: true },
  { key: 'observatorio', label: 'Observatorio', ruta: '/admin/observatorio', icono: 'globe', vision: true },
  { key: 'capacitacion', label: 'Capacitación', ruta: '/admin/capacitacion', icono: 'book', vision: true },
  { key: 'exportaciones', label: 'Exportaciones', ruta: '/admin/exportaciones', icono: 'chart', vision: true },
] as const;

// Resuelve el ítem activo por prefijo de ruta (la ficha de colegio marca
// "Colegios", ver-como marca "Maestras").
export function navActivo(pathname: string): string {
  if (pathname.startsWith('/admin/ver-como')) return 'maestras';
  const hit = [...ADMIN_NAV]
    .filter((it) => pathname === it.ruta || pathname.startsWith(`${it.ruta}/`))
    .sort((a, b) => b.ruta.length - a.ruta.length)[0];
  return hit?.key ?? 'inicio';
}
