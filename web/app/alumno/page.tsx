'use client';
// Picker de materias del alumno (Fase 2 / SP-3): muestra las sol_materia PUBLICADAS
// de su escuela (RLS) cuyo programa es de SU grado. Tocar una → mapa de esa materia.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { animal, sol } from '@/lib/art';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const COLORES = ['#F4A93B', '#6FB7D4', '#7FB069', '#C98AB0', '#E2854E', '#5FA9C4'];

type Materia = { programa_id: string; nombre: string; grado: number };

export default function Materias() {
  const router = useRouter();
  const supabase = createClient();
  const me = useMe();
  const [materias, setMaterias] = useState<Materia[] | null>(null);

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

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px clamp(16px,4vw,40px)', background: '#FFFCF5', borderBottom: '2px solid #EFE3CE' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, background: `${animal(me?.avatar || 'fox')} center/contain no-repeat` }} />
          <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 19, color: '#3A332A' }}>Hola, {me?.nombre || ''}</div>
        </div>
        <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Salir</button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(24px,5vw,44px) 22px', animation: 'edFade .3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 54, height: 54, background: `${sol('happy')} center/contain no-repeat` }} />
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4.5vw,32px)', color: '#3A332A', margin: 0 }}>¿Qué querés practicar?</h1>
        </div>

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
