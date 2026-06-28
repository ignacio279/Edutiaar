'use client';
// Mapa real del alumno (Fase 2 / SP-3): los nodos de la materia (programa_id) desde
// la DB, pintados por el estado del chico (alumno_nodo). Layout serpentina para N
// nodos; círculo con el número de parada (genérico para cualquier materia).
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { alpha, catmull } from '@/lib/art';
import { serpentine, estadoColor, LEGEND } from '@/lib/mapa-layout';

const BALOO = 'var(--font-baloo), cursive';

type NodoVista = { id: string; nombre: string; orden: number; estado: string };

export default function MapaMateria() {
  const supabase = createClient();
  const router = useRouter();
  const me = useMe();
  const params = useParams();
  const programaId = String(params.programaId);
  const [nodos, setNodos] = useState<NodoVista[] | null>(null);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data: ns } = await supabase
        .from('nodo')
        .select('id,nombre,orden')
        .eq('programa_id', programaId)
        .order('orden');
      const { data: an } = await supabase
        .from('alumno_nodo')
        .select('nodo_id,estado')
        .eq('alumno_id', me.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const estadoPorNodo = new Map(((an as any[]) || []).map((r) => [r.nodo_id, r.estado] as [string, string]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vista: NodoVista[] = ((ns as any[]) || []).map((n) => ({
        id: n.id, nombre: n.nombre, orden: n.orden, estado: estadoPorNodo.get(n.id) || 'no_empezado',
      }));
      setNodos(vista);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, programaId]);

  const coords = serpentine(nodos?.length || 0);

  return (
    <div style={{ flex: 1, width: '100%', maxWidth: 1000, margin: '0 auto', padding: '24px clamp(16px,4vw,40px) 48px', animation: 'edFade .3s ease' }}>
      <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(24px,4.5vw,38px)', margin: 0, color: '#3A332A' }}>Tu mapa</h1>
      <p style={{ fontSize: 16, color: '#7A6F5F', margin: '6px 0 0', fontWeight: 600 }}>Seguí el camino. Tocá una parada para practicar.</p>

      {nodos === null ? (
        <p style={{ color: '#7A6F5F', fontWeight: 600, marginTop: 20 }}>Cargando…</p>
      ) : nodos.length === 0 ? (
        <p style={{ color: '#7A6F5F', fontWeight: 600, marginTop: 20 }}>Esta materia todavía no tiene nodos.</p>
      ) : (
        <>
          <div style={{ position: 'relative', width: 'min(920px,100%)', aspectRatio: '920/540', margin: '18px auto 0' }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <path d={catmull(coords)} fill="none" stroke="#E2C9A0" strokeWidth="5" strokeLinecap="round" strokeDasharray="0.5 9" vectorEffect="non-scaling-stroke" />
            </svg>
            {nodos.map((n, i) => {
              const color = estadoColor(n.estado);
              const [x, y] = coords[i];
              return (
                <button
                  key={n.id}
                  onClick={() => router.push(`/alumno/${programaId}/practicar`)}
                  style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', width: 'clamp(92px,12vw,118px)', padding: 0 }}
                >
                  <span style={{ position: 'relative', width: 'clamp(64px,8.5vw,84px)', height: 'clamp(64px,8.5vw,84px)', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 18px ${alpha(color, 0.34)}`, border: '5px solid #FFFCF5', color: '#fff', fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(20px,2.6vw,26px)' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(12px,1.5vw,15px)', color: '#4A3B32', background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 999, padding: '4px 13px', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(120,90,40,.08)' }}>
                    {n.nombre}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
            {LEGEND.map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: l.c, display: 'inline-block', boxShadow: `0 2px 5px ${alpha(l.c, 0.4)}` }} />
                <span style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 700 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
