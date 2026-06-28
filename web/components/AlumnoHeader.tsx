'use client';
// Header del alumno por materia: avatar + nombre + materia actual + toggle
// Mi mapa / Practicar (scopeado a la materia) + "‹ Materias" + Salir.
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal } from '@/lib/art';
import type { Perfil } from '@/lib/me-context';

const BALOO = 'var(--font-baloo), cursive';

export default function AlumnoHeader({
  me,
  active,
  materiaNombre,
  programaId,
}: {
  me: Perfil | null;
  active: 'mapa' | 'practicar';
  materiaNombre: string;
  programaId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  const pill = (label: string, to: string, on: boolean) => (
    <button
      onClick={() => router.push(to)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: 'none',
        cursor: 'pointer',
        borderRadius: 999,
        padding: '10px 20px',
        fontFamily: BALOO,
        fontWeight: 700,
        fontSize: 16,
        background: on ? '#F4A93B' : 'transparent',
        color: on ? '#fff' : '#7A6F5F',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
        padding: '14px clamp(16px,4vw,40px)',
        background: '#FFFCF5',
        borderBottom: '2px solid #EFE3CE',
        position: 'sticky',
        top: 0,
        zIndex: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => router.push('/alumno')}
          aria-label="Volver a materias"
          style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: 0 }}
        >
          ‹
        </button>
        <div style={{ width: 48, height: 48, background: `${animal(me?.avatar || 'fox')} center/contain no-repeat` }} />
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 19, color: '#3A332A' }}>
            Hola, {me?.nombre || ''}
          </div>
          <div style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>{materiaNombre || '…'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, background: '#FBEFD9', borderRadius: 999, padding: 5 }}>
        {pill('Mi mapa', `/alumno/${programaId}/mapa`, active === 'mapa')}
        {pill('Practicar', `/alumno/${programaId}/practicar`, active === 'practicar')}
      </div>
      <button
        onClick={signOut}
        style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
      >
        Salir
      </button>
    </div>
  );
}
