// Paleta ADMIN del dashboard de administración — identidad visual propia de
// /admin, hermana de VIOLETA (web/lib/luna-tema.ts): misma estructura de
// claves, acento azul petróleo sobre los neutros cálidos de la app.
// Solo constantes (sin lógica): las comparten el layout, el sidebar y las
// páginas de /admin. Contraste: `base` y `oscuro` llevan texto blanco (o sus
// tintes) encima; `claro`/`suave`/`burbuja` son fondos con texto oscuro.
export const ADMIN = {
  oscuro: '#2F6172', // petróleo oscuro: títulos h2, CTAs fuertes
  base: '#3E7C8A', // petróleo base: botones primarios (texto blanco encima)
  medio: '#2F6172', // texto petróleo sobre claro o blanco
  borde: '#C9DEE7', // bordes de tarjetas seleccionables, inputs y chips
  claro: '#E3EEF4', // fondo de pills/chips (ítem activo del sidebar)
  suave: '#FBF4E6', // fondo de página (crema cálido de la app)
  carta: '#FFFCF5', // fondo de tarjetas
  burbuja: '#EDF4F7', // fondo suave petróleo (paneles informativos)
  ink: '#3A332A', // texto principal (tinta cálida)
  tinta2: '#7A6F5F', // texto secundario cálido
  bordeCalido: '#EFE3CE', // borde neutro cálido de tarjetas informativas
  textoSobreBase: '#DFEDF1', // texto secundario sobre `base`
  textoSobreOscuro: '#D3E4EA', // texto secundario sobre `oscuro`
  sombra: 'rgba(47,97,114,.08)', // sombra petróleo de tarjetas
  sombraFuerte: 'rgba(47,97,114,.32)', // sombra de CTAs grandes
  sombraCalida: 'rgba(120,90,40,.05)', // sombra de tarjetas informativas cálidas
  okFondo: '#E6F0DC', // semántica de éxito (verde de la app, intacta)
  okBorde: '#C2DBB0',
  okCheck: '#7FB069',
  okTexto: '#4E7A3A',
  danger: '#BB4F3F', // acciones destructivas (rojo cálido de la app)
  dangerBorde: '#E8C9C2',
  warnFondo: '#FBEFD9', // avisos (naranja de la app)
  warnBorde: '#F4D9A6',
  warnTexto: '#8A6215',
} as const;

// Pills de estado como tuplas [bg, color, label] (patrón BADGE/TAG de la app).
export const ESTADO_COLEGIO: Record<string, readonly [string, string, string]> = {
  trial: ['#FBEFD9', '#8A6215', 'Prueba'],
  activo: ['#E6F0DC', '#4E7A3A', 'Activo'],
  suspendido: ['#E8C9C2', '#8A3D30', 'Suspendido'],
  archivado: ['#EFE3CE', '#9A8E78', 'Archivado'],
};

export const ESTADO_MAESTRA: Record<string, readonly [string, string, string]> = {
  activo: ['#E6F0DC', '#4E7A3A', 'Activa'],
  suspendido: ['#E8C9C2', '#8A3D30', 'Suspendida'],
};

export const NIVEL_ADMIN: Record<string, readonly [string, string, string]> = {
  super: ['#E3EEF4', '#2F6172', 'Super admin'],
  operativo: ['#EFE3CE', '#7A6F5F', 'Operativo'],
};

export const TIPO_COLEGIO: Record<string, string> = {
  rural: 'Rural',
  unidocente: 'Unidocente',
  plurigrado: 'Plurigrado',
};
