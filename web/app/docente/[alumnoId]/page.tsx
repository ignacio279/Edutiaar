'use client';
// Detalle del alumno para la docente (Fase 2 / SP-4c): su mapa (estados de nodo) +
// el último análisis cualitativo de SOL (evaluacion_sesion). RLS deja a la docente ver
// solo a sus alumnos (es_mi_alumno). Protección de rol acá mismo.
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal } from '@/lib/art';
import { estadoColor } from '@/lib/mapa-layout';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

type Alumno = { nombre: string; avatar: string; grado: number };
type NodoEstado = { nodo_id: string; estado: string; override: boolean; nombre: string };
type Error = { pregunta: string; respondio: string; esperaba: string };
type Eval = { resumen: string; errores: Error[]; a_reforzar: string[] } | null;

const ESTADO_LABEL: Record<string, string> = {
  no_empezado: 'Sin empezar', en_construccion: 'En camino', a_reforzar: 'A reforzar', dominado: 'Lo domina',
};

export default function DetalleAlumno() {
  const router = useRouter();
  const supabase = createClient();
  const params = useParams();
  const alumnoId = String(params.alumnoId);

  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [nodos, setNodos] = useState<NodoEstado[]>([]);
  const [analisis, setAnalisis] = useState<Eval>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: yo } = await supabase.from('perfil').select('rol').eq('id', user.id).single();
      if ((yo as { rol?: string } | null)?.rol !== 'docente') { router.replace('/'); return; }

      const { data: a } = await supabase.from('perfil').select('nombre,avatar,grado').eq('id', alumnoId).single();
      setAlumno(a as Alumno | null);

      const { data: an } = await supabase
        .from('alumno_nodo')
        .select('nodo_id, estado, estado_override, nodo:nodo_id(nombre)')
        .eq('alumno_id', alumnoId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNodos(((an as any[]) || []).map((r) => ({ nodo_id: r.nodo_id, estado: r.estado, override: r.estado_override, nombre: r.nodo?.nombre ?? 'Nodo' })));

      const { data: ev } = await supabase
        .from('evaluacion_sesion')
        .select('resumen, errores, a_reforzar, created_at, sesion:sesion_id!inner(alumno_id)')
        .eq('sesion.alumno_id', alumnoId)
        .order('created_at', { ascending: false })
        .limit(1);
      const row = ((ev as unknown[]) || [])[0] as { resumen: string; errores: Error[]; a_reforzar: string[] } | undefined;
      setAnalisis(row ? { resumen: row.resumen, errores: row.errores || [], a_reforzar: row.a_reforzar || [] } : null);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId]);

  async function fijarEstado(nodoId: string, valor: string) {
    // valor 'auto' = devolver a la regla; cualquier otro = override docente
    const override = valor !== 'auto';
    const estado = override ? valor : (nodos.find((n) => n.nodo_id === nodoId)?.estado ?? 'no_empezado');
    await supabase.from('alumno_nodo').upsert(
      { alumno_id: alumnoId, nodo_id: nodoId, estado, estado_override: override },
      { onConflict: 'alumno_id,nodo_id' },
    );
    setNodos((prev) => prev.map((n) => (n.nodo_id === nodoId ? { ...n, estado, override } : n)));
  }

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(24px,5vw,48px) 22px', animation: 'edFade .3s ease' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <button onClick={() => router.push('/docente')} style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 14 }}>
          ‹ Mis alumnos
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{ width: 56, height: 56, background: `${animal(alumno?.avatar || 'fox')} center/contain no-repeat` }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4.5vw,30px)', color: '#3A332A', margin: 0 }}>{alumno?.nombre || ''}</h1>
            <p style={{ fontSize: 14, color: '#7A6F5F', margin: '2px 0 0', fontWeight: 600 }}>{(alumno?.grado || 3)}° grado</p>
          </div>
        </div>

        {/* Mapa: estados por nodo */}
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A', margin: '0 0 10px' }}>Su recorrido</h2>
        {nodos.length === 0 ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>{loaded ? 'Todavía no practicó.' : 'Cargando…'}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nodos.map((n) => (
              <div key={n.nodo_id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 14, padding: '10px 14px' }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', background: estadoColor(n.estado), flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: QUICK, fontWeight: 700, color: '#3A332A' }}>{n.nombre}</span>
                <span style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>{ESTADO_LABEL[n.estado] ?? n.estado}{n.override ? ' ·fijado' : ''}</span>
                <select
                  value={n.override ? n.estado : 'auto'}
                  onChange={(e) => fijarEstado(n.nodo_id, e.target.value)}
                  style={{ fontFamily: NUNITO, fontWeight: 700, fontSize: 13, color: '#3A332A', border: '1.5px solid #EFE3CE', borderRadius: 10, padding: '4px 8px', background: '#FBF4E6' }}
                  aria-label={`Fijar estado de ${n.nombre}`}
                >
                  <option value="auto">Auto (según práctica)</option>
                  <option value="no_empezado">Sin empezar</option>
                  <option value="en_construccion">En camino</option>
                  <option value="a_reforzar">A reforzar</option>
                  <option value="dominado">Lo domina</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Análisis de SOL */}
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A', margin: '26px 0 10px' }}>Último análisis de SOL</h2>
        {!analisis ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>{loaded ? 'Todavía no hay análisis.' : 'Cargando…'}</p>
        ) : (
          <div style={{ background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 18, padding: '16px 18px' }}>
            <p style={{ margin: 0, fontFamily: NUNITO, fontWeight: 700, fontSize: 16, color: '#3A332A', lineHeight: 1.4 }}>{analisis.resumen}</p>
            {analisis.a_reforzar.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {analisis.a_reforzar.map((t, i) => (
                  <span key={i} style={{ background: '#FBE6E0', color: '#C0573F', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>A reforzar: {t}</span>
                ))}
              </div>
            )}
            {analisis.errores.length > 0 && (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: '#7A6F5F', fontSize: 14, fontWeight: 600 }}>
                {analisis.errores.slice(0, 5).map((e, i) => (
                  <li key={i}>{e.pregunta} → respondió <b>{e.respondio}</b> (era <b>{e.esperaba}</b>)</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
