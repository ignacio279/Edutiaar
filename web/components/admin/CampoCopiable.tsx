'use client';
// Campo de solo lectura con botón "Copiar" (restyle 2026-08 al mock
// Admin.dc.html). Lo usan las pantallas que muestran un secreto UNA sola vez:
// link de invitación y contraseña temporal. `destacado` es la variante de la
// contraseña (más grande y espaciada, para dictarla sin equivocarse).
import { useState } from 'react';
import { ADMIN, CAMPO, ETIQUETA } from '@/lib/admin/tema';

const QUICK = 'var(--font-quicksand), sans-serif';

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sin permiso de portapapeles (o http): el input queda seleccionable a mano.
  }
}

export default function CampoCopiable({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={ETIQUETA}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          readOnly
          value={valor}
          onFocus={(e) => e.currentTarget.select()}
          style={{ ...CAMPO, flex: 1, minWidth: 0, padding: '11px 12px', fontSize: destacado ? 14 : 13, fontWeight: destacado ? 800 : undefined, letterSpacing: destacado ? 1 : undefined }}
        />
        <button
          onClick={() => { copiar(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1400); }}
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12, padding: '0 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
