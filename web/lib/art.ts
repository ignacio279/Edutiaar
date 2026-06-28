// EDUTIA — funciones puras de arte/SVG (sin DOM ni red).
// Portado verbatim de frontend/app/art.js. Devuelven data-URI usables en
// `style={{ background: animal('fox') + ' center/contain no-repeat' }}`.

// Comillas simples en url(): los data-URI se inyectan dentro de style.
export const uri = (s: string) =>
  "url('data:image/svg+xml," + encodeURIComponent(s).replace(/'/g, '%27') + "')";

export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function catmull(pts: number[][]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function sol(mood?: 'happy' | 'cheer' | 'soft') {
  let s = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x1 = 60 + Math.cos(a) * 40,
      y1 = 60 + Math.sin(a) * 40;
    const x2 = 60 + Math.cos(a) * 53,
      y2 = 60 + Math.sin(a) * 53;
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#F4A93B" stroke-width="5.5" stroke-linecap="round"/>`;
  }
  let eyes: string, mouth: string;
  if (mood === 'cheer') {
    eyes =
      '<path d="M48 56 q5 -7 10 0" stroke="#3A332A" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M62 56 q5 -7 10 0" stroke="#3A332A" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
    mouth = '<path d="M48 66 q12 16 24 0 q-12 6 -24 0 z" fill="#3A332A"/>';
  } else if (mood === 'soft') {
    eyes =
      '<circle cx="53" cy="58" r="3.2" fill="#3A332A"/><circle cx="67" cy="58" r="3.2" fill="#3A332A"/>';
    mouth =
      '<path d="M50 70 q10 -5 20 0" stroke="#3A332A" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
  } else {
    eyes =
      '<circle cx="53" cy="57" r="3.4" fill="#3A332A"/><circle cx="67" cy="57" r="3.4" fill="#3A332A"/>';
    mouth =
      '<path d="M50 65 q10 11 20 0" stroke="#3A332A" stroke-width="3.6" fill="none" stroke-linecap="round"/>';
  }
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${s}<circle cx="60" cy="60" r="39" fill="#FFC24B"/><circle cx="60" cy="60" r="39" fill="none" stroke="#F4A93B" stroke-width="4.5"/><circle cx="44" cy="68" r="6.5" fill="#E78F6B" opacity=".5"/><circle cx="76" cy="68" r="6.5" fill="#E78F6B" opacity=".5"/>${eyes}${mouth}</svg>`,
  );
}

export function animal(key: string) {
  const w: Record<string, string> = {
    fox: `<rect width="100" height="100" rx="30" fill="#FCEBD6"/><path d="M30 47 L23 19 L47 36 Z" fill="#E78640"/><path d="M70 47 L77 19 L53 36 Z" fill="#E78640"/><path d="M32 42 L28 27 L42 37 Z" fill="#C75E2E"/><path d="M68 42 L72 27 L58 37 Z" fill="#C75E2E"/><path d="M50 31 C32 31 28 50 31 62 C34 75 50 83 50 83 C50 83 66 75 69 62 C72 50 68 31 50 31 Z" fill="#EE8B3F"/><path d="M50 55 C42 55 36 61 33 67 C39 78 50 82 50 82 C50 82 61 78 67 67 C64 61 58 55 50 55 Z" fill="#FFF7EC"/><circle cx="41" cy="53" r="3.6" fill="#3A332A"/><circle cx="59" cy="53" r="3.6" fill="#3A332A"/><ellipse cx="50" cy="64" rx="4.2" ry="3.2" fill="#3A332A"/>`,
    owl: `<rect width="100" height="100" rx="30" fill="#E3EEF4"/><path d="M28 34 L36 24 L44 34 Z" fill="#7B96A8"/><path d="M72 34 L64 24 L56 34 Z" fill="#7B96A8"/><path d="M50 28 C30 28 24 46 24 60 C24 76 36 86 50 86 C64 86 76 76 76 60 C76 46 70 28 50 28 Z" fill="#8FB0C2"/><path d="M50 50 C40 50 34 60 34 70 C34 80 42 84 50 84 C58 84 66 80 66 70 C66 60 60 50 50 50 Z" fill="#C9DCE6"/><circle cx="40" cy="52" r="12" fill="#FFFDF8"/><circle cx="60" cy="52" r="12" fill="#FFFDF8"/><circle cx="40" cy="53" r="5" fill="#3A332A"/><circle cx="60" cy="53" r="5" fill="#3A332A"/><path d="M50 60 l-5 6 10 0 z" fill="#E8993E"/>`,
    turtle: `<rect width="100" height="100" rx="30" fill="#E6F0DC"/><ellipse cx="50" cy="74" rx="9" ry="7" fill="#7FB069"/><ellipse cx="30" cy="66" rx="7" ry="5.5" fill="#7FB069"/><ellipse cx="70" cy="66" rx="7" ry="5.5" fill="#7FB069"/><path d="M50 28 C30 28 22 44 22 58 C22 72 34 76 50 76 C66 76 78 72 78 58 C78 44 70 28 50 28 Z" fill="#6FA058"/><path d="M50 36 C36 36 30 48 30 58 C30 66 38 70 50 70 C62 70 70 66 70 58 C70 48 64 36 50 36 Z" fill="#8FBF78"/><path d="M50 40 L60 50 L56 64 L44 64 L40 50 Z" fill="#6FA058"/><circle cx="44" cy="33" r="2.6" fill="#3A332A"/><circle cx="56" cy="33" r="2.6" fill="#3A332A"/>`,
    cat: `<rect width="100" height="100" rx="30" fill="#F6E6DC"/><path d="M30 46 L26 24 L46 38 Z" fill="#D98E5A"/><path d="M70 46 L74 24 L54 38 Z" fill="#D98E5A"/><path d="M31 42 L29 30 L41 39 Z" fill="#B96E3E"/><path d="M69 42 L71 30 L59 39 Z" fill="#B96E3E"/><path d="M50 32 C33 32 28 50 30 62 C32 76 50 84 50 84 C50 84 68 76 70 62 C72 50 67 32 50 32 Z" fill="#E2A06E"/><circle cx="41" cy="55" r="3.6" fill="#3A332A"/><circle cx="59" cy="55" r="3.6" fill="#3A332A"/><path d="M50 64 l-3.5 3 7 0 z" fill="#B96E3E"/><path d="M50 67 q0 5 -6 6 M50 67 q0 5 6 6" stroke="#3A332A" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M30 60 h-9 M30 65 h-8 M70 60 h9 M70 65 h8" stroke="#C9966B" stroke-width="1.6" stroke-linecap="round"/>`,
    sheep: `<rect width="100" height="100" rx="30" fill="#F1ECE0"/><g fill="#FFFDF8"><circle cx="34" cy="56" r="14"/><circle cx="66" cy="56" r="14"/><circle cx="40" cy="42" r="14"/><circle cx="60" cy="42" r="14"/><circle cx="50" cy="38" r="15"/><circle cx="32" cy="70" r="12"/><circle cx="68" cy="70" r="12"/><circle cx="50" cy="74" r="14"/><circle cx="50" cy="56" r="18"/></g><ellipse cx="50" cy="60" rx="15" ry="16" fill="#4A3B32"/><ellipse cx="36" cy="56" rx="6" ry="4" fill="#3A2E26"/><ellipse cx="64" cy="56" rx="6" ry="4" fill="#3A2E26"/><circle cx="45" cy="58" r="2.6" fill="#FFFDF8"/><circle cx="55" cy="58" r="2.6" fill="#FFFDF8"/>`,
  };
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${w[key] || w.fox}</svg>`,
  );
}

// Íconos de nodo (paradas del mapa). Las 6 primeras claves son las de Lengua;
// las demás cubren Matemática y Ciencias (porteadas del diseño). El componente
// las cicla por orden del nodo (ver iconoNodo en materia-tema.ts).
const NODE_ICONS: Record<string, string> = {
  vocales: `<path d="M28 76 L50 26 L72 76 M37 58 L63 58" />`,
  silabas: `<rect x="22" y="40" width="24" height="24" rx="6"/><rect x="54" y="40" width="24" height="24" rx="6"/>`,
  palabras: `<path d="M28 40 H72 M28 54 H72 M28 68 H54"/>`,
  oraciones: `<path d="M26 34 H74 a8 8 0 0 1 8 8 V60 a8 8 0 0 1 -8 8 H46 L34 80 V68 H26 a8 8 0 0 1 -8 -8 V42 a8 8 0 0 1 8 -8 Z"/>`,
  lectura: `<path d="M50 36 C40 30 28 30 22 33 V72 C28 69 40 69 50 75 C60 69 72 69 78 72 V33 C72 30 60 30 50 36 Z M50 36 V75"/>`,
  cuento: `<path d="M50 24 L58 44 L80 46 L63 60 L68 82 L50 70 L32 82 L37 60 L20 46 L42 44 Z"/>`,
  numeros: `<path d="M38 26 L31 74 M62 26 L55 74 M27 43 H73 M24 57 H70"/>`,
  contar: `<circle cx="36" cy="40" r="5"/><circle cx="56" cy="40" r="5"/><circle cx="36" cy="62" r="5"/><circle cx="56" cy="62" r="5"/>`,
  sumar: `<path d="M50 28 V72 M28 50 H72"/>`,
  restar: `<path d="M28 50 H72"/>`,
  figuras: `<circle cx="38" cy="60" r="13"/><path d="M62 46 l13 26 -26 0 z"/>`,
  problemas: `<path d="M37 41 a13 13 0 1 1 19 11 c-5 3 -6 6 -6 10"/><circle cx="50" cy="71" r="1.6"/>`,
  animales: `<circle cx="50" cy="60" r="11"/><circle cx="34" cy="46" r="6"/><circle cx="50" cy="40" r="6"/><circle cx="66" cy="46" r="6"/>`,
  plantas: `<path d="M50 74 V46 M50 52 C38 52 32 42 32 42 C44 42 50 46 50 52 M50 58 C62 58 68 48 68 48 C56 48 50 52 50 58"/>`,
  cuerpo: `<circle cx="50" cy="32" r="9"/><path d="M50 41 V64 M50 48 L33 58 M50 48 L67 58 M50 64 L39 80 M50 64 L61 80"/>`,
  agua: `<path d="M50 26 C50 26 32 50 32 62 a18 18 0 0 0 36 0 C68 50 50 26 50 26 Z"/>`,
  clima: `<circle cx="42" cy="40" r="9"/><path d="M36 72 a14 14 0 0 1 0 -28 h22 a13 13 0 0 1 0 26 z"/>`,
  tierra: `<circle cx="50" cy="50" r="22"/><path d="M28 50 H72 M50 28 V72 M35 37 q15 12 30 0 M35 63 q15 -12 30 0"/>`,
};

// Claves de ícono en orden de recorrido (lo usa iconoNodo para ciclar por nodo).
export const NODE_ICON_KEYS = Object.keys(NODE_ICONS);

export function nodeIcon(key: string) {
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#FFFDF8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${NODE_ICONS[key] || NODE_ICONS.vocales}</svg>`,
  );
}

export const starBadge = () =>
  uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#F4A93B" stroke="#FFFCF5" stroke-width="2"/><path d="M20 9 l3.2 6.6 7.2 1 -5.2 5 1.3 7.2 -6.5 -3.4 -6.5 3.4 1.3 -7.2 -5.2 -5 7.2 -1 z" fill="#FFFCF5"/></svg>`,
  );
export const lockBadge = () =>
  uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#C9BCA6" stroke="#FFFCF5" stroke-width="2"/><rect x="13" y="19" width="14" height="11" rx="3" fill="#FFFCF5"/><path d="M16 19 v-3 a4 4 0 0 1 8 0 v3" stroke="#FFFCF5" stroke-width="3" fill="none"/></svg>`,
  );

// Ilustración de un ejercicio (la práctica-chat la muestra arriba de la pregunta
// cuando el ejercicio trae una clave de imagen). Porteado verbatim del diseño.
export function item(key: string) {
  if (key === 'apples3') {
    const a = (x: number) =>
      `<g transform="translate(${x},106) scale(0.82)"><path d="M0 -12 c-12 -8 -30 -2 -30 18 c0 20 14 30 22 30 c5 0 5 -2 8 -2 c3 0 3 2 8 2 c8 0 22 -10 22 -30 c0 -20 -18 -26 -30 -18 z" fill="#D46A5A"/><path d="M0 -12 c0 -8 6 -14 14 -14 c-1 8 -6 14 -14 14 z" fill="#7FB069"/><rect x="-2" y="-24" width="4" height="12" rx="2" fill="#7A5A38"/></g>`;
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#FBEFD9"/>${a(56)}${a(100)}${a(144)}</svg>`,
    );
  }
  if (key === 'stars4') {
    const s = (x: number) =>
      `<g transform="translate(${x - 25},74) scale(0.5)"><path d="M50 24 L58 44 L80 46 L63 60 L68 82 L50 70 L32 82 L37 60 L20 46 L42 44 Z" fill="#F4A93B" stroke="#E08C39" stroke-width="2"/></g>`;
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#FBF1D8"/>${s(48)}${s(82)}${s(118)}${s(152)}</svg>`,
    );
  }
  if (key === 'solcito') {
    let r = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const x1 = 100 + Math.cos(a) * 48,
        y1 = 100 + Math.sin(a) * 48,
        x2 = 100 + Math.cos(a) * 66,
        y2 = 100 + Math.sin(a) * 66;
      r += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#F4A93B" stroke-width="9" stroke-linecap="round"/>`;
    }
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#E3EEF4"/>${r}<circle cx="100" cy="100" r="38" fill="#FFC24B"/><circle cx="100" cy="100" r="38" fill="none" stroke="#F4A93B" stroke-width="6"/></svg>`,
    );
  }
  const inner: Record<string, string> = {
    arbol: `<circle cx="100" cy="100" r="96" fill="#E9F0DC"/><rect x="92" y="118" width="16" height="48" rx="7" fill="#9C6B43"/><circle cx="100" cy="90" r="46" fill="#7FB069"/><circle cx="70" cy="104" r="30" fill="#8FBF78"/><circle cx="130" cy="104" r="30" fill="#6FA058"/><circle cx="100" cy="74" r="34" fill="#8FBF78"/>`,
    oveja: `<circle cx="100" cy="100" r="96" fill="#F1ECE0"/><g fill="#FFFDF8"><circle cx="64" cy="108" r="28"/><circle cx="136" cy="108" r="28"/><circle cx="78" cy="80" r="28"/><circle cx="122" cy="80" r="28"/><circle cx="100" cy="74" r="30"/><circle cx="62" cy="134" r="24"/><circle cx="138" cy="134" r="24"/><circle cx="100" cy="140" r="28"/><circle cx="100" cy="108" r="34"/></g><ellipse cx="100" cy="114" rx="28" ry="30" fill="#4A3B32"/><ellipse cx="72" cy="106" rx="11" ry="7" fill="#3A2E26"/><ellipse cx="128" cy="106" rx="11" ry="7" fill="#3A2E26"/><circle cx="90" cy="110" r="5" fill="#FFFDF8"/><circle cx="110" cy="110" r="5" fill="#FFFDF8"/>`,
    uva: `<circle cx="100" cy="100" r="96" fill="#ECE6F1"/><rect x="97" y="46" width="6" height="20" rx="3" fill="#7A5A38"/><path d="M103 56 c0 -12 10 -20 22 -20 c-2 12 -10 20 -22 20 z" fill="#7FB069"/><g fill="#9472B4"><circle cx="100" cy="76" r="18"/><circle cx="80" cy="100" r="18"/><circle cx="120" cy="100" r="18"/><circle cx="100" cy="106" r="18"/><circle cx="88" cy="128" r="17"/><circle cx="112" cy="128" r="17"/><circle cx="100" cy="148" r="16"/></g><g fill="#A98BC6" opacity=".55"><circle cx="94" cy="71" r="5"/><circle cx="74" cy="95" r="5"/><circle cx="114" cy="95" r="5"/></g>`,
  };
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${inner[key] || inner.arbol}</svg>`,
  );
}

// Emblema de la materia (va centrado sobre la portada de la card). Claves:
// 'lengua' (libro), 'mate' (ábaco), 'ciencias' (planta+sol). Default → lengua.
export function materiaEmblem(key: string) {
  const m: Record<string, string> = {
    lengua: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path d="M60 36 C50 30 36 30 27 34 L27 84 C36 80 50 80 60 86 Z" fill="#FFFCF5" stroke="#E3CFAC" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 36 C70 30 84 30 93 34 L93 84 C84 80 70 80 60 86 Z" fill="#FFF7EC" stroke="#E3CFAC" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 36 V86" stroke="#D9C3A0" stroke-width="2.5" stroke-linecap="round"/><g stroke="#DCC39B" stroke-width="3" stroke-linecap="round"><path d="M34 47 H52"/><path d="M34 56 H52"/><path d="M34 65 H46"/></g><path d="M70 70 L79.5 48 L89 70 M73.4 62 H85.6" fill="none" stroke="#F4A93B" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    mate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect x="24" y="32" width="72" height="56" rx="11" fill="none" stroke="#C7B392" stroke-width="4"/><line x1="26" y1="46" x2="94" y2="46" stroke="#D8C6A6" stroke-width="2.5"/><line x1="26" y1="60" x2="94" y2="60" stroke="#D8C6A6" stroke-width="2.5"/><line x1="26" y1="74" x2="94" y2="74" stroke="#D8C6A6" stroke-width="2.5"/><g><circle cx="35" cy="46" r="6.5" fill="#6FB7D4"/><circle cx="49" cy="46" r="6.5" fill="#F4A93B"/><circle cx="63" cy="46" r="6.5" fill="#7FB069"/><circle cx="86" cy="46" r="6.5" fill="#D98E5A"/></g><g><circle cx="35" cy="60" r="6.5" fill="#F4A93B"/><circle cx="49" cy="60" r="6.5" fill="#7FB069"/><circle cx="78" cy="60" r="6.5" fill="#6FB7D4"/><circle cx="86" cy="60" r="6.5" fill="#F4A93B"/></g><g><circle cx="35" cy="74" r="6.5" fill="#7FB069"/><circle cx="49" cy="74" r="6.5" fill="#D98E5A"/><circle cx="63" cy="74" r="6.5" fill="#6FB7D4"/><circle cx="86" cy="74" r="6.5" fill="#7FB069"/></g></svg>`,
    ciencias: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="90" cy="34" r="9" fill="#FFC24B"/><g stroke="#F4A93B" stroke-width="2.6" stroke-linecap="round"><line x1="90" y1="19" x2="90" y2="14"/><line x1="105" y1="34" x2="110" y2="34"/><line x1="101" y1="23" x2="105" y2="19"/><line x1="101" y1="45" x2="105" y2="49"/></g><path d="M44 80 L76 80 L72 100 Q60 104 48 100 Z" fill="#D98E5A"/><rect x="41" y="73" width="38" height="9" rx="3" fill="#C97A48"/><path d="M60 73 V50" stroke="#6FA058" stroke-width="4.5" stroke-linecap="round"/><path d="M60 60 C47 60 41 49 41 49 C56 47 63 52 60 60 Z" fill="#7FB069"/><path d="M60 53 C73 53 79 42 79 42 C64 40 57 45 60 53 Z" fill="#8FBF78"/><circle cx="60" cy="46" r="5" fill="#6FA058"/></svg>`,
  };
  return uri(m[key] || m.lengua);
}

// Patrón de portada de la card de materia (símbolos sueltos sobre tinte). Claves:
// 'mate' (números), 'ciencias' (hojas/gotas/soles), default → letras (lengua).
export function materiaPattern(key: string) {
  const txt =
    (c: string) =>
    (x: number, y: number, s: number, r: number, o: number, t: string) =>
      `<text x="${x}" y="${y}" font-family="'Quicksand','Trebuchet MS',sans-serif" font-weight="700" font-size="${s}" fill="${c}" opacity="${o}" transform="rotate(${r} ${x} ${y})">${t}</text>`;
  if (key === 'mate') {
    const t = txt('#5E9FC6');
    const b =
      t(28, 46, 24, -8, 0.55, '2+1') + t(150, 40, 26, 6, 0.5, '=') + t(198, 54, 24, -6, 0.5, '3') + t(252, 46, 26, 10, 0.5, '+') +
      t(40, 98, 26, 8, 0.5, '−') + t(98, 106, 22, -10, 0.45, '4') + t(162, 102, 24, 5, 0.5, '×') + t(220, 110, 22, -8, 0.5, '5+2') +
      t(26, 154, 24, -6, 0.5, '6') + t(96, 160, 22, 10, 0.45, '9−3') + t(188, 154, 26, -5, 0.5, '=') + t(252, 158, 26, 8, 0.5, '7');
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#E3EEF4"/>${b}<g fill="none" stroke="#5E9FC6" stroke-width="2.5" opacity=".4"><circle cx="272" cy="98" r="9"/><path d="M120 130 l11 20 -22 0 z"/></g></svg>`,
    );
  }
  if (key === 'ciencias') {
    const c = '#6FA45A';
    const leaf = (x: number, y: number, s: number, r: number) =>
      `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})" fill="${c}" opacity=".5"><path d="M0 0 C-14 -2 -20 -14 -20 -14 C-4 -16 6 -10 0 0 Z"/></g>`;
    const drop = (x: number, y: number, s: number, r: number) =>
      `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})" fill="${c}" opacity=".42"><path d="M0 -11 C0 -11 -8 1 -8 6 a8 8 0 0 0 16 0 C8 1 0 -11 0 -11 Z"/></g>`;
    const star = (x: number, y: number, s: number, r: number) =>
      `<g transform="translate(${x},${y}) rotate(${r}) scale(${s})" fill="${c}" opacity=".4"><path d="M0 -10 L3 -3 10 -2 4 3 6 10 0 5 -6 10 -4 3 -10 -2 -3 -3 Z"/></g>`;
    const sun = (x: number, y: number, s: number) =>
      `<g transform="translate(${x},${y}) scale(${s})" opacity=".5"><circle r="7" fill="#E6A53F"/><g stroke="#E6A53F" stroke-width="2.4" stroke-linecap="round"><line x1="0" y1="-11" x2="0" y2="-15"/><line x1="0" y1="11" x2="0" y2="15"/><line x1="-11" y1="0" x2="-15" y2="0"/><line x1="11" y1="0" x2="15" y2="0"/></g></g>`;
    const b =
      leaf(42, 48, 1.1, -10) + sun(152, 46, 1) + leaf(212, 52, 1, 25) + drop(260, 48, 1, -6) +
      drop(40, 106, 1, 8) + leaf(98, 102, 1.1, 42) + star(162, 104, 1, 0) + leaf(222, 110, 1, -25) +
      sun(34, 156, 0.9) + leaf(102, 158, 1, -30) + drop(182, 154, 1, 10) + leaf(256, 158, 1.1, 15);
    return uri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#E6F0DC"/>${b}</svg>`,
    );
  }
  const t = txt('#DE9338');
  const b =
    t(30, 46, 30, -8, 0.5, 'A') + t(150, 40, 22, 6, 0.42, 'a') + t(206, 54, 28, -6, 0.5, 'E') + t(256, 46, 22, 8, 0.42, 'i') +
    t(36, 102, 22, 8, 0.42, 'o') + t(92, 106, 30, -8, 0.5, 'B') + t(162, 102, 22, 6, 0.42, 'u') + t(214, 110, 26, -6, 0.5, 'Aa') +
    t(26, 156, 24, -6, 0.5, 'M') + t(98, 160, 22, 8, 0.42, 'e') + t(182, 154, 28, -5, 0.5, 'S') + t(252, 158, 22, 8, 0.42, 'l');
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect width="300" height="200" fill="#FBEFD9"/>${b}</svg>`,
  );
}

// Íconos de UI (toggle mapa/practicar, parlante, panel docente, chevron).
export function uiIcon(key: string) {
  const k: Record<string, string> = {
    speaker: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M28 40 H44 L60 26 V74 L44 60 H28 Z" fill="#C77E3A"/><path d="M70 38 q9 12 0 24 M79 30 q15 20 0 40" fill="none" stroke="#C77E3A" stroke-width="6" stroke-linecap="round"/></svg>`,
    people: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#3A332A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="38" cy="40" r="13"/><circle cx="68" cy="44" r="10"/><path d="M18 78 q0 -18 20 -18 q20 0 20 18 M62 76 q0 -14 16 -14 q12 0 12 12"/></svg>`,
    mapW: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><circle cx="30" cy="30" r="6" fill="#fff"/><circle cx="70" cy="50" r="6" fill="#fff"/><circle cx="40" cy="74" r="6" fill="#fff"/><path d="M30 30 Q60 28 70 50 Q72 70 40 74" stroke-dasharray="2 9"/></svg>`,
    mapI: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#7A6F5F" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><circle cx="30" cy="30" r="6" fill="#7A6F5F"/><circle cx="70" cy="50" r="6" fill="#7A6F5F"/><circle cx="40" cy="74" r="6" fill="#7A6F5F"/><path d="M30 30 Q60 28 70 50 Q72 70 40 74" stroke-dasharray="2 9"/></svg>`,
    sunW: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="18" fill="#fff"/><g stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M50 18 V8 M50 92 V82 M18 50 H8 M92 50 H82 M27 27 L20 20 M73 27 L80 20 M27 73 L20 80 M73 73 L80 80"/></g></svg>`,
    sunI: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="18" fill="#7A6F5F"/><g stroke="#7A6F5F" stroke-width="6" stroke-linecap="round"><path d="M50 18 V8 M50 92 V82 M18 50 H8 M92 50 H82 M27 27 L20 20 M73 27 L80 20 M27 73 L20 80 M73 73 L80 80"/></g></svg>`,
    chevron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#7A6F5F" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M38 26 L64 50 L38 74"/></svg>`,
  };
  return uri(k[key] || k.chevron);
}
