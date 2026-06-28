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
const COLORES = ['#F4A93B', '#6FB7D4', '#7FB069', '#C98AB0', '#E2854E', '#5FA9C4'];

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
            {materias.map((m, i) => (
              <button
                key={m.programa_id}
                onClick={() => router.push(`/alumno/${m.programa_id}/mapa`)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 22, padding: '24px 16px', cursor: 'pointer' }}
              >
                <span style={{ width: 56, height: 56, borderRadius: '50%', background: COLORES[i % COLORES.length], boxShadow: `0 6px 14px ${COLORES[i % COLORES.length]}55` }} />
                <span style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 18, color: '#3A332A' }}>{m.nombre}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
