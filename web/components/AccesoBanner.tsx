'use client';
// Aviso de estado de acceso para la docente (Dashboard admin v3, F3):
// prueba por vencer, prueba terminada (solo lectura) o cuenta en pausa.
// Lee la RPC mi_acceso (migración 0018) — la RLS ya la limita a lo propio.
// Sin aviso que dar → no renderiza nada.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { avisoAcceso, type Acceso, type AvisoAcceso } from '@/lib/acceso';

const QUICK = 'var(--font-quicksand), sans-serif';

const ESTILO: Record<string, { bg: string; borde: string; color: string }> = {
  por_vencer: { bg: '#FBEFD9', borde: '#F4D9A6', color: '#8A6215' },
  solo_lectura: { bg: '#FBEFD9', borde: '#F4D9A6', color: '#8A6215' },
  bloqueado: { bg: '#F7E4E0', borde: '#E8C9C2', color: '#8A3D30' },
};

export default function AccesoBanner() {
  const [aviso, setAviso] = useState<AvisoAcceso>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc('mi_acceso');
        if (data) setAviso(avisoAcceso(data as Acceso, new Date()));
      } catch {
        /* si no se puede leer el acceso, no molestamos con un banner */
      }
    })();
  }, []);

  if (!aviso) return null;
  const est = ESTILO[aviso.tipo];

  return (
    <div style={{ background: est.bg, borderBottom: `2px solid ${est.borde}`, padding: '11px 20px', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <strong style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: est.color }}>{aviso.titulo}</strong>
      <span style={{ fontSize: 14, color: est.color, opacity: 0.9 }}>{aviso.detalle}</span>
    </div>
  );
}
