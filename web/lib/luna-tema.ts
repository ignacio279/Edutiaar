// Paleta VIOLETA de LUNA — identidad visual propia de la sección del copiloto
// de la docente, calcada del diseño de referencia (Claude Design, Edutia.dc.html,
// sección isLuna). Solo constantes (sin lógica): las comparten los tres page.tsx
// de /docente/luna y el ítem LUNA del sidebar. El resto del panel docente sigue
// con la paleta general cálida.
//
// Contraste: `base` y `oscuro` llevan texto blanco (o sus tintes `textoSobreBase`/
// `textoSobreOscuro`) encima; `claro`/`suave`/`burbuja` son solo fondos con texto
// oscuro. Nunca texto violeta claro sobre blanco.
export const VIOLETA = {
  oscuro: '#5E5490', // violeta oscuro: CTA del chat, títulos h2, texto violeta fuerte
  base: '#8B7EC8', // violeta base: CTAs y botones primarios (texto blanco encima)
  medio: '#5E5490', // texto violeta sobre claro o blanco (mismo tono que oscuro en este diseño)
  borde: '#DDD2F0', // bordes violetas de tarjetas seleccionables, inputs y chips
  claro: '#F0EBFA', // fondo de pills/chips violetas (aula activa, Borrador, sidebar activo)
  suave: '#FBF4E6', // fondo de página de la sección (crema cálido del diseño)
  carta: '#FFFCF5', // fondo de tarjetas y burbujas de la docente
  burbuja: '#F3EFFA', // burbuja de chat de LUNA
  ink: '#3A332A', // texto principal (tinta cálida)
  tinta2: '#7A6F5F', // texto secundario cálido
  bordeCalido: '#EFE3CE', // borde neutro cálido de tarjetas informativas
  textoSobreBase: '#EDE8FA', // texto secundario sobre `base`
  textoSobreOscuro: '#E4DFF4', // texto secundario sobre `oscuro`
  sombra: 'rgba(94,84,144,.08)', // sombra violeta de tarjetas
  sombraFuerte: 'rgba(94,84,144,.32)', // sombra de CTAs grandes
  sombraCalida: 'rgba(120,90,40,.05)', // sombra de tarjetas informativas cálidas
  okFondo: '#E6F0DC', // banner de aprobado (verde, semántica intacta)
  okBorde: '#C2DBB0',
  okCheck: '#7FB069',
  okTexto: '#4E7A3A',
} as const;
