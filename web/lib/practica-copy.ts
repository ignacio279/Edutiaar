// Copys de la práctica-chat con SOL (tono rioplatense, cálido, nunca castiga).
// El diseño los tiene hardcodeados por materia; acá los templateamos con el
// nombre real de la materia / del chico / del tema. PURO y standalone (sin DOM
// ni red, sin imports) → unit-testeable. praise/encourage eligen por índice
// para ser deterministas en tests; el componente pasa un índice (p. ej. el del
// ejercicio) en vez de Math.random.

const PRAISES = [
  '¡Muy bien! Lo lograste solito.',
  '¡Genial! Tal cual.',
  '¡Perfecto! Sos un crack.',
  '¡Bien ahí! Lo pensaste muy bien.',
];

const ENCOURAGES = [
  'Casi, casi. Mirá de nuevo y probá otra vez.',
  'Uy, casi. No pasa nada, una más, vos podés.',
  'Esa no era. Mirá bien y volvé a tocar, tranquilo.',
];

// Saludo inicial de SOL al abrir la práctica de una materia.
export function saludo(materia: string, alumno?: string): string {
  const hola = alumno ? `¡Hola ${alumno}!` : '¡Hola!';
  const m = materia || 'un ratito';
  return `${hola} Soy SOL. Vamos a practicar ${m} un ratito. Mirá bien y tocá la respuesta.`;
}

// Mensaje de cierre cuando se terminan los ejercicios.
export function cierre(materia: string, alumno?: string, tema?: string): string {
  const nombre = alumno ? `, ${alumno}` : '';
  const loDe = tema ? `Practicaste ${tema} y te salió genial.` : '¡Te salió genial!';
  return `¡Buenísimo${nombre}! Por hoy alcanza. ${loDe} ¡Nos vemos!`;
}

// Festejo cuando acierta (índice determinístico).
export function praise(i = 0): string {
  return PRAISES[((i % PRAISES.length) + PRAISES.length) % PRAISES.length];
}

// Aliento cuando falla (nunca castiga; índice determinístico).
export function encourage(i = 0): string {
  return ENCOURAGES[((i % ENCOURAGES.length) + ENCOURAGES.length) % ENCOURAGES.length];
}
