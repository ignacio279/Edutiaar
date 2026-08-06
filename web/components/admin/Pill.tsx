'use client';
// Pill de estado del panel admin (Dashboard admin v3). Congelado en Fase 0.
// Recibe la tupla [bg, color, label] de web/lib/admin/tema.ts.
const QUICK = 'var(--font-quicksand), sans-serif';

export default function Pill({ tupla }: { tupla?: readonly [string, string, string] }) {
  if (!tupla) return null;
  const [bg, color, label] = tupla;
  return (
    <span style={{ display: 'inline-block', background: bg, color, borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}
