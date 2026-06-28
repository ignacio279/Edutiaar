'use client';
// Mapa real del alumno (diseño Edutia / SP-3): los nodos de la materia (programa_id)
// desde la DB, pintados por el estado del chico (alumno_nodo). Camino punteado con
// dos variantes (Camino / Colinas), círculos con ícono + insignia (estrella si lo
// domina, candado si no empezó) y CTA grande para practicar la parada sugerida.
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { alpha, catmull, nodeIcon, starBadge, lockBadge, uiIcon } from '@/lib/art';
import { estadoColor, LEGEND, coordsVariante } from '@/lib/mapa-layout';
import { temaMateria, iconoNodo } from '@/lib/materia-tema';

const BALOO = 'var(--font-baloo), cursive';

type NodoVista = { id: string; nombre: string; orden: number; estado: string };

export default function MapaMateria() {
  const supabase = createClient();
  const router = useRouter();
  const me = useMe();
  const params = useParams();
  const programaId = String(params.programaId);
  const [nodos, setNodos] = useState<NodoVista[] | null>(null);
  const [materia, setMateria] = useState('');
  const [variant, setVariant] = useState<'A' | 'B'>('A');

  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data: prog } = await supabase.from('programa').select('materia:materia_id(nombre)').eq('id', programaId).single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMateria((prog as any)?.materia?.nombre || '');
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

  const tema = temaMateria(materia);
  const coords = coordsVariante(variant, nodos?.length || 0);

  function practicarSugerido() {
    if (!nodos?.length) return;
    const pendiente = nodos.find((n) => n.estado !== 'dominado');
    router.push(`/alumno/${programaId}/practicar?nodo=${(pendiente || nodos[0]).id}`);
  }

  const seg = (label: string, on: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ background: on ? '#F4A93B' : 'transparent', color: on ? '#fff' : '#7A6F5F', border: 'none', borderRadius: 999, padding: '8px 18px', fontFamily: 'var(--font-nunito)', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ flex: 1, width: '100%', maxWidth: 1000, margin: '0 auto', padding: '24px clamp(16px,4vw,40px) 48px', animation: 'edFade .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(26px,4.5vw,40px)', margin: 0, color: '#3A332A', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: 8, background: tema.color, flexShrink: 0 }} />
            Tu mapa de {materia || '…'}
          </h1>
          <p style={{ fontSize: 16, color: '#7A6F5F', margin: '6px 0 0', fontWeight: 600 }}>
            Seguí el camino. Tocá una parada para practicar.{' '}
            <button onClick={() => router.push('/alumno')} style={{ background: 'none', border: 'none', color: '#C77E3A', fontWeight: 800, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>Cambiar materia</button>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 5, background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 999, padding: 4 }}>
          {seg('Camino', variant === 'A', () => setVariant('A'))}
          {seg('Colinas', variant === 'B', () => setVariant('B'))}
        </div>
      </div>

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
              const badge = n.estado === 'dominado' ? starBadge() : n.estado === 'no_empezado' ? lockBadge() : null;
              return (
                <button
                  key={n.id}
                  onClick={() => router.push(`/alumno/${programaId}/practicar?nodo=${n.id}`)}
                  style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', width: 'clamp(92px,12vw,118px)', padding: 0 }}
                >
                  <span style={{ position: 'relative', width: 'clamp(74px,9.5vw,94px)', height: 'clamp(74px,9.5vw,94px)', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 18px ${alpha(color, 0.34)}`, border: '5px solid #FFFCF5' }}>
                    <span style={{ width: '48%', height: '48%', background: `${nodeIcon(iconoNodo(i))} center/contain no-repeat` }} />
                    {badge && <span style={{ position: 'absolute', top: -5, right: -5, width: 24, height: 24, background: `${badge} center/contain no-repeat` }} />}
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

          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <button
              onClick={practicarSugerido}
              className="ed-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#F4A93B', color: '#fff', border: 'none', borderRadius: 999, padding: '16px 34px', fontFamily: BALOO, fontWeight: 700, fontSize: 20, cursor: 'pointer', boxShadow: '0 8px 22px rgba(244,169,59,.32)' }}
            >
              <span style={{ width: 24, height: 24, background: `${uiIcon('sunW')} center/contain no-repeat` }} />
              Practicar {materia || ''} con SOL
            </button>
          </div>
        </>
      )}
    </div>
  );
}
