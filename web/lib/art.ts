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

export function nodeIcon(key: string) {
  const p: Record<string, string> = {
    vocales: `<path d="M28 76 L50 26 L72 76 M37 58 L63 58" />`,
    silabas: `<rect x="22" y="40" width="24" height="24" rx="6"/><rect x="54" y="40" width="24" height="24" rx="6"/>`,
    palabras: `<path d="M28 40 H72 M28 54 H72 M28 68 H54"/>`,
    oraciones: `<path d="M26 34 H74 a8 8 0 0 1 8 8 V60 a8 8 0 0 1 -8 8 H46 L34 80 V68 H26 a8 8 0 0 1 -8 -8 V42 a8 8 0 0 1 8 -8 Z"/>`,
    lectura: `<path d="M50 36 C40 30 28 30 22 33 V72 C28 69 40 69 50 75 C60 69 72 69 78 72 V33 C72 30 60 30 50 36 Z M50 36 V75"/>`,
    cuento: `<path d="M50 24 L58 44 L80 46 L63 60 L68 82 L50 70 L32 82 L37 60 L20 46 L42 44 Z"/>`,
  };
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="#FFFDF8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${p[key] || p.vocales}</svg>`,
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
