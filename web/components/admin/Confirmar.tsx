'use client';
// Modal de confirmación destructiva del panel admin (Dashboard admin v3).
// Congelado en Fase 0. Patrón "tipeá el nombre" de /docente/materias: el botón
// rojo no se habilita hasta escribir el nombre EXACTO.
import { useState } from 'react';
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,51,42,.45)', display: 'grid', placeItems: 'center', zIndex: 60, animation: 'edFade .2s ease' }} onClick={onCerrar}>
      <div style={{ width: '100%', maxWidth: 420, background: ADMIN.carta, border: `2px solid ${ADMIN.dangerBorde}`, borderRadius: 24, padding: '26px 28px', boxShadow: '0 18px 44px rgba(58,51,42,.3)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 21, color: ADMIN.ink, margin: '0 0 8px' }}>{titulo}</h3>
        <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 16px', lineHeight: 1.5 }}>{descripcion}</p>
        <p style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, margin: '0 0 8px' }}>
          Escribí <span style={{ color: ADMIN.danger }}>{nombre}</span> para confirmar:
        </p>
        <input
          value={tipeado}
          onChange={(e) => setTipeado(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, fontFamily: NUNITO, fontSize: 15, color: ADMIN.ink, background: ADMIN.suave, outline: 'none', marginBottom: 18 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={{ background: 'none', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.tinta2, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={() => habilitado && onConfirmar()}
            disabled={!habilitado}
            style={{ background: habilitado ? ADMIN.danger : ADMIN.dangerBorde, border: 'none', borderRadius: 12, padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: '#fff', cursor: habilitado ? 'pointer' : 'not-allowed' }}
          >
            {busy ? 'Un momento…' : verbo}
          </button>
        </div>
      </div>
    </div>
  );
}
