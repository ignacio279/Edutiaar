'use client';
// Modal de confirmación destructiva del panel admin (Dashboard admin v3,
// restyle 2026-08 al mock Admin.dc.html). Patrón "tipeá el nombre" de
// /docente/materias: el botón rojo no se habilita hasta escribir el nombre
// EXACTO.
import { useState } from 'react';
import { ADMIN } from '@/lib/admin/tema';

const NUNITO = 'var(--font-nunito)';
const QUICK = 'var(--font-quicksand), sans-serif';

export default function Confirmar({
  titulo, descripcion, nombre, verbo, busy, onConfirmar, onCerrar,
}: {
  titulo: string;
  descripcion: string;
  nombre: string; // lo que hay que tipear exacto
  verbo: string; // texto del botón rojo, ej. "Archivar"
  busy?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  const [tipeado, setTipeado] = useState('');
  const habilitado = tipeado.trim() === nombre && !busy;

  return (
    <div style={{ position: 'fixed', inset: 0, background: ADMIN.velo, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 60 }} onClick={onCerrar}>
      <div style={{ width: '100%', maxWidth: 440, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 24, padding: 28, boxShadow: '0 20px 50px rgba(58,51,42,.25)', animation: 'adPop .25s ease' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: ADMIN.danger, margin: '0 0 4px' }}>{titulo}</h2>
        <p style={{ fontFamily: NUNITO, fontSize: 14, fontWeight: 600, color: ADMIN.tinta2, margin: '0 0 18px', lineHeight: 1.45 }}>{descripcion}</p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6 }}>
          Escribí «{nombre}» para confirmar
        </label>
        <input
          value={tipeado}
          onChange={(e) => setTipeado(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: `2px solid ${ADMIN.dangerBorde}`, borderRadius: 12, fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none', marginBottom: 20 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} className="ad-ghost-warm" style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={() => habilitado && onConfirmar()}
            disabled={!habilitado}
            className={habilitado ? 'ed-primary' : undefined}
            style={{ background: habilitado ? ADMIN.danger : ADMIN.dangerBorde, border: 'none', borderRadius: 999, padding: '11px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: '#fff', cursor: habilitado ? 'pointer' : 'not-allowed', boxShadow: habilitado ? '0 6px 16px rgba(187,79,63,.3)' : 'none' }}
          >
            {busy ? 'Un momento…' : verbo}
          </button>
        </div>
      </div>
    </div>
  );
}
