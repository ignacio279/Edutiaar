'use client';
// Tile de métrica del panel admin (Dashboard admin v3). Congelado en Fase 0.
// Se usa dentro de una grilla repeat(auto-fit, minmax(180px, 1fr)) — patrón de
// /docente/luna. `detalle` es la línea chica de contexto opcional.
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

export default function Stat({ valor, label, detalle }: { valor: string | number; label: string; detalle?: string }) {
  return (
    <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '18px 20px', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}` }}>
      <div style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 30, color: ADMIN.ink, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.tinta2, marginTop: 4 }}>{label}</div>
      {detalle && <div style={{ fontSize: 12.5, color: ADMIN.tinta2, marginTop: 2, opacity: 0.85 }}>{detalle}</div>}
    </div>
  );
}
