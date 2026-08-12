'use client';
// Modal genérico del panel admin (restyle 2026-08 al mock Admin.dc.html): velo,
// tarjeta crema con `adPop` y el par de botones abajo a la derecha. Es el
// hermano no destructivo de Confirmar.tsx (ese exige tipear el nombre); este se
// usa para altas y acciones reversibles — nueva institución, admin de
// institución, cancelar un pase, asignar un cupo.
import { ADMIN } from '@/lib/admin/tema';

const NUNITO = 'var(--font-nunito)';
const QUICK = 'var(--font-quicksand), sans-serif';

export default function Modal({
  titulo, descripcion, children, confirmar, verbo, busy, puede = true, peligro, onCerrar,
}: {
  titulo: string;
  descripcion?: string;
  children?: React.ReactNode;
  confirmar: () => void;
  verbo: string;
  busy?: boolean;
  puede?: boolean; // el CTA arranca apagado hasta que el form esté completo
  peligro?: boolean;
  onCerrar: () => void;
}) {
  const habilitado = puede && !busy;
  const acento = peligro ? ADMIN.danger : ADMIN.base;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: ADMIN.velo, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 60 }}
      onClick={onCerrar}
    >
      <div
        style={{ width: '100%', maxWidth: 440, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 24, padding: 28, boxShadow: '0 20px 50px rgba(58,51,42,.25)', animation: 'adPop .25s ease', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: peligro ? ADMIN.danger : ADMIN.ink, margin: '0 0 4px' }}>{titulo}</h2>
        {descripcion && (
          <p style={{ fontFamily: NUNITO, fontSize: 13.5, fontWeight: 600, color: ADMIN.tinta2, margin: '0 0 18px', lineHeight: 1.45 }}>{descripcion}</p>
        )}
        {children}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onCerrar}
            className="ad-ghost-warm"
            style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => habilitado && confirmar()}
            disabled={!habilitado}
            style={{ background: habilitado ? acento : ADMIN.bordeCalido, border: 'none', borderRadius: 999, padding: '11px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: '#fff', cursor: habilitado ? 'pointer' : 'not-allowed', boxShadow: habilitado ? `0 6px 16px ${peligro ? 'rgba(187,79,63,.3)' : ADMIN.sombraCTA}` : 'none' }}
          >
            {busy ? 'Un momento…' : verbo}
          </button>
        </div>
      </div>
    </div>
  );
}
