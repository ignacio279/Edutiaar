'use client';
// Tile de métrica del panel admin (Dashboard admin v3, restyle 2026-08 al mock
// Admin.dc.html). Se usa dentro de una grilla repeat(auto-fit, minmax(180px, 1fr)).
// `detalle` es la línea chica de contexto opcional; `chico` es la variante
// compacta de la ficha de colegio / uso / ver-como (número 30, label tinta2).
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';

export default function Stat({ valor, label, detalle, chico }: { valor: string | number; label: string; detalle?: string; chico?: boolean }) {
  return (
    <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: chico ? 20 : 22, padding: chico ? '18px 20px' : '20px 22px', boxShadow: chico ? undefined : '0 4px 14px rgba(120,90,40,.06)' }}>
      <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: chico ? 30 : 32, color: ADMIN.oscuro, lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: chico ? 13 : 13.5, color: chico ? ADMIN.tinta2 : ADMIN.ink, fontWeight: 700, marginTop: chico ? 6 : 8 }}>{label}</div>
      {detalle && <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>{detalle}</div>}
    </div>
  );
}
