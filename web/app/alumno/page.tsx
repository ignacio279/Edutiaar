'use client';
// Landing del alumno (Fase 2 / SP-3, rediseño): header con avatar + toggle
// Mi mapa / Practicar + Salir, y abajo las CARDS de materia (sol_materia
// PUBLICADAS de su grado, vía RLS). Tocar una card → mapa de esa materia
// (/alumno/[programaId]/mapa), donde el chico elige la parada para practicar.
// El toggle solo cambia el encuadre del texto: ambas pestañas llevan al mapa
// (la práctica se entra tocando un nodo del mapa).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { animal } from '@/lib/art';

const BALOO = 'var(--font-baloo), cursive';

// Tonos de card del design system (Euditiaar): tint + borde 300, ciclados por materia.
const TONOS = [
  { bg: '#FCEBC8', bd: '#FAD089' }, // sol
  { bg: '#E0EFD7', bd: '#AED199' }, // campo
  { bg: '#DCEEF5', bd: '#A6D4E6' }, // cielo
  { bg: '#F6E2D2', bd: '#ECBE9C' }, // terracota
];

function iconoMateria(nombre: string) {
  const n = nombre.toLowerCase();
  if (n.includes('lengua')) return '📖';
  if (n.includes('matem')) return '🔢';
  if (n.includes('social')) return '🌎';
  if (n.includes('cienci')) return '🌱';
  if (n.includes('arte') || n.includes('plást') || n.includes('plast')) return '🎨';
  if (n.includes('music') || n.includes('músic')) return '🎵';
  return '📚';
}

type Materia = { programa_id: string; nombre: string; grado: number };
type Tab = 'mapa' | 'practicar';

const COPY: Record<Tab, { titulo: string; sub: string }> = {
  mapa: { titulo: 'Tus materias', sub: 'Tocá una materia para ver tu mapa.' },
  practicar: { titulo: '¿Qué querés practicar?', sub: 'Tocá una materia y elegí una parada.' },
};

export default function Materias() {
  const router = useRouter();
  const supabase = createClient();
  const me = useMe();
  const [materias, setMaterias] = useState<Materia[] | null>(null);
  const [tab, setTab] = useState<Tab>('mapa');

  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data } = await supabase
        .from('sol_materia')
        .select('programa_id, programa:programa_id(grado, materia:materia_id(nombre))')
        .eq('estado', 'publicado');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: Materia[] = ((data as any[]) || [])
        .map((r) => ({ programa_id: r.programa_id, grado: r.programa?.grado, nombre: r.programa?.materia?.nombre }))
        .filter((m) => m.nombre && m.grado === me.grado);
      setMaterias(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  const pill = (label: string, t: Tab) => (
    <button
      onClick={() => setTab(t)}
      style={{
        border: 'none', cursor: 'pointer', borderRadius: 999, padding: '10px 20px',
        fontFamily: BALOO, fontWeight: 700, fontSize: 16,
        background: tab === t ? '#F4A93B' : 'transparent',
        color: tab === t ? '#fff' : '#7A6F5F',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px clamp(16px,4vw,40px)', background: '#FFFCF5', borderBottom: '2px solid #EFE3CE', position: 'sticky', top: 0, zIndex: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, background: `${animal(me?.avatar || 'fox')} center/contain no-repeat` }} />
          <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 19, color: '#3A332A' }}>Hola, {me?.nombre || ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#FBEFD9', borderRadius: 999, padding: 5 }}>
          {pill('Mi mapa', 'mapa')}
          {pill('Practicar', 'practicar')}
        </div>
        <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Salir</button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(24px,5vw,44px) 22px', animation: 'edFade .3s ease' }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(24px,4.5vw,38px)', color: '#3A332A', margin: 0 }}>{COPY[tab].titulo}</h1>
        <p style={{ fontSize: 16, color: '#7A6F5F', margin: '6px 0 22px', fontWeight: 600 }}>{COPY[tab].sub}</p>

        {materias === null ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>
        ) : materias.length === 0 ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Tu seño todavía no publicó materias. ¡Pronto!</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {materias.map((m, i) => {
              const t = TONOS[i % TONOS.length];
              return (
                <button
                  key={m.programa_id}
                  onClick={() => router.push(`/alumno/${m.programa_id}/mapa`)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, textAlign: 'left', background: t.bg, border: `1.5px solid ${t.bd}`, borderRadius: 24, padding: 20, cursor: 'pointer', boxShadow: '0 6px 16px rgba(122,86,56,0.12)' }}
                >
                  <span style={{ fontSize: 32, lineHeight: 1 }}>{iconoMateria(m.nombre)}</span>
                  <span style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 18, color: '#4A3B32' }}>{m.nombre}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
