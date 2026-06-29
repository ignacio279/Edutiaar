'use client';
// Landing del alumno (diseño Edutia / SP-3): header con avatar + toggle Mi mapa /
// Practicar + Salir, y abajo las CARDS de materia (sol_materia PUBLICADAS de su
// grado, vía RLS) con portada + emblema + puntitos de progreso ("X de N temas").
// El toggle setea el target: "Mi mapa" → tocar una card lleva al mapa de la
// materia; "Practicar" → entra directo a practicar la parada sugerida.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { animal, uiIcon, materiaEmblem, materiaPattern } from '@/lib/art';
import { temaMateria } from '@/lib/materia-tema';

const BALOO = 'var(--font-baloo), cursive';

type NodoLite = { id: string; orden: number; estado: string };
type Materia = {
  programa_id: string;
  nombre: string;
  grado: number;
  nodos: NodoLite[]; // ordenados por `orden`
  dominados: number;
};
type Tab = 'mapa' | 'practicar';

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
      const base = ((data as any[]) || [])
        .map((r) => ({ programa_id: r.programa_id as string, grado: r.programa?.grado as number, nombre: r.programa?.materia?.nombre as string }))
        .filter((m) => m.nombre && m.grado === me.grado);
      const ids = base.map((m) => m.programa_id);

      // Progreso: nodos por programa + cuáles domina el chico (2 queries batcheadas).
      const [{ data: nodoRows }, { data: anRows }] = ids.length
        ? await Promise.all([
            supabase.from('nodo').select('id, programa_id, orden').in('programa_id', ids).order('orden'),
            supabase.from('alumno_nodo').select('nodo_id, estado').eq('alumno_id', me.id),
          ])
        : [{ data: [] }, { data: [] }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const estadoPorNodo = new Map(((anRows as any[]) || []).map((r) => [r.nodo_id, r.estado] as [string, string]));
      const nodosPorPrograma = new Map<string, NodoLite[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const n of (nodoRows as any[]) || []) {
        const arr = nodosPorPrograma.get(n.programa_id) || [];
        arr.push({ id: n.id, orden: n.orden, estado: estadoPorNodo.get(n.id) || 'no_empezado' });
        nodosPorPrograma.set(n.programa_id, arr);
      }

      const rows: Materia[] = base.map((m) => {
        const nodos = nodosPorPrograma.get(m.programa_id) || [];
        return { ...m, nodos, dominados: nodos.filter((n) => n.estado === 'dominado').length };
      });
      setMaterias(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  // Parada sugerida para "practicar": la primera no dominada (o la primera).
  function nodoSugerido(m: Materia): string | null {
    if (!m.nodos.length) return null;
    const pendiente = m.nodos.find((n) => n.estado !== 'dominado');
    return (pendiente || m.nodos[0]).id;
  }

  function elegir(m: Materia) {
    if (tab === 'practicar') {
      const nodo = nodoSugerido(m);
      router.push(nodo ? `/alumno/${m.programa_id}/practicar?nodo=${nodo}` : `/alumno/${m.programa_id}/mapa`);
    } else {
      router.push(`/alumno/${m.programa_id}/mapa`);
    }
  }

  const pill = (label: string, t: Tab, icon: string) => {
    const on = tab === t;
    return (
      <button
        onClick={() => setTab(t)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer',
          borderRadius: 999, padding: '10px 20px', fontFamily: BALOO, fontWeight: 700, fontSize: 16,
          background: on ? '#F4A93B' : 'transparent', color: on ? '#fff' : '#7A6F5F',
        }}
      >
        <span style={{ width: 20, height: 20, background: `${uiIcon(icon)} center/contain no-repeat` }} />
        {label}
      </button>
    );
  };

  const heading = tab === 'practicar' ? '¿Qué querés practicar hoy?' : '¿Qué mapa querés ver?';
  const sub = tab === 'practicar' ? 'Elegí una materia y practicamos con SOL.' : 'Elegí una materia para ver cómo vas.';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px clamp(16px,4vw,40px)', background: '#FFFCF5', borderBottom: '2px solid #EFE3CE', position: 'sticky', top: 0, zIndex: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, background: `${animal(me?.avatar || 'fox')} center/contain no-repeat` }} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 19, color: '#3A332A' }}>Hola, {me?.nombre || ''}</div>
            <div style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>Elegí una materia</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#FBEFD9', borderRadius: 999, padding: 5 }}>
          {pill('Mi mapa', 'mapa', tab === 'mapa' ? 'mapW' : 'mapI')}
          {pill('Practicar', 'practicar', tab === 'practicar' ? 'sunW' : 'sunI')}
        </div>
        <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Salir</button>
      </div>

      <div style={{ flex: 1, width: '100%', maxWidth: 920, margin: '0 auto', padding: '40px clamp(16px,4vw,40px) 56px', animation: 'edFade .3s ease' }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(28px,5vw,44px)', margin: 0, color: '#3A332A', textAlign: 'center' }}>{heading}</h1>
        <p style={{ fontSize: 17, color: '#7A6F5F', margin: '8px 0 0', fontWeight: 600, textAlign: 'center' }}>{sub}</p>

        {materias === null ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600, textAlign: 'center', marginTop: 30 }}>Cargando…</p>
        ) : materias.length === 0 ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600, textAlign: 'center', marginTop: 30 }}>Tu seño todavía no publicó materias. ¡Pronto!</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,272px)', justifyContent: 'center', gap: 20, marginTop: 38 }}>
            {materias.map((m) => {
              const tema = temaMateria(m.nombre);
              const total = m.nodos.length;
              const dots = Array.from({ length: Math.max(total, 1) });
              return (
                <button
                  key={m.programa_id}
                  onClick={() => elegir(m)}
                  className="ed-materia-card"
                  style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFCF5', border: `2px solid ${tema.tintBorder}`, borderRadius: 28, cursor: 'pointer', boxShadow: '0 8px 22px rgba(120,90,40,.1)', padding: 0 }}
                >
                  <div style={{ position: 'relative', height: 162, backgroundImage: materiaPattern(tema.pattern), backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1.5px solid ${tema.tintBorder}` }}>
                    <div style={{ width: 96, height: 96, backgroundImage: materiaEmblem(tema.emblem), backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', filter: 'drop-shadow(0 6px 13px rgba(120,90,40,.22))' }} />
                  </div>
                  <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 25, color: '#3A332A' }}>{m.nombre}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {dots.map((_, i) => (
                        <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < m.dominados ? tema.color : '#E6DAC4', display: 'inline-block' }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 13.5, color: '#7A6F5F', fontWeight: 700, marginTop: 9 }}>
                      {total > 0 ? `${m.dominados} de ${total} ${total === 1 ? 'tema' : 'temas'}` : 'Sin temas todavía'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
