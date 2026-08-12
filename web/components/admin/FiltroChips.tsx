'use client';
// Chips de filtro del panel admin (restyle 2026-08 al mock Admin.dc.html):
// píldora petróleo llena cuando está activa, contorno cálido cuando no.
// Los usan Pases y Licencias, que filtran por estado sin recargar la página.
import { ADMIN } from '@/lib/admin/tema';

const QUICK = 'var(--font-quicksand), sans-serif';

export default function FiltroChips({
  opciones, valor, onCambio,
}: {
  opciones: readonly { key: string; label: string }[];
  valor: string;
  onCambio: (key: string) => void;
}) {
  return (
    <>
      {opciones.map((o) => {
        const activo = o.key === valor;
        return (
          <button
            key={o.key || 'todos'}
            onClick={() => onCambio(o.key)}
            className={activo ? undefined : 'ad-ghost-warm'}
            style={{
              background: activo ? ADMIN.base : ADMIN.carta,
              color: activo ? '#fff' : ADMIN.tinta2,
              border: activo ? 'none' : `1.5px solid ${ADMIN.bordeCalido}`,
              borderRadius: 999, padding: '8px 16px',
              fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </>
  );
}
