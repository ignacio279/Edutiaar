'use client';
// Practicar por materia (Fase 2 / SP-3): placeholder. La práctica real (ejercicios)
// llega cuando exista el generador (necesita API key). Por ahora, saludo de SOL.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { sol } from '@/lib/art';
import { saludoMateria } from '@/lib/mapa-layout';

export default function PracticarMateria() {
  const supabase = createClient();
  const me = useMe();
  const params = useParams();
  const programaId = String(params.programaId);
  const [materia, setMateria] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('programa')
        .select('materia:materia_id(nombre)')
        .eq('id', programaId)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMateria((data as any)?.materia?.nombre || '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programaId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px', textAlign: 'center', animation: 'edFade .3s ease' }}>
      <div style={{ width: 120, height: 120, animation: 'edBob 4.5s ease-in-out infinite', background: `${sol('cheer')} center/contain no-repeat` }} />
      <div style={{ maxWidth: 520, margin: '18px 0 0', background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 20, borderBottomLeftRadius: 6, padding: '16px 20px', boxShadow: '0 4px 12px rgba(120,90,40,.08)' }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-nunito)', fontWeight: 700, fontSize: 18, color: '#3A332A', lineHeight: 1.35 }}>
          {saludoMateria(materia, me?.nombre)}
        </p>
      </div>
      <p style={{ margin: '22px 0 0', color: '#7A6F5F', fontWeight: 600 }}>Muy pronto vas a practicar de verdad con SOL.</p>
    </div>
  );
}
