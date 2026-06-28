'use client';
// Detalle del alumno para la docente (Fase 2 / SP-4c + Etapa 4): su mapa (estados de
// nodo + override), la actividad de hoy ("Lo de hoy", con fallback a la última vez),
// el último análisis cualitativo de SOL (evaluacion_sesion) y el histórico mes a mes.
// RLS deja a la docente ver solo a sus alumnos (es_mi_alumno). Protección de rol acá.
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal } from '@/lib/art';
import { estadoColor } from '@/lib/mapa-layout';
import { ESTADO_LABEL, rangoHoy, resumenHoy, ultimaSesion, haceCuanto, agruparPorMes } from '@/lib/panel';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

type Alumno = { nombre: string; avatar: string; grado: number };
type NodoEstado = { nodo_id: string; estado: string; override: boolean; nombre: string };
type Error = { pregunta: string; respondio: string; esperaba: string };
type Eval = { resumen: string; errores: Error[]; a_reforzar: string[] } | null;
type Sesion = { fecha: string; aciertos: number; total: number; duracion_seg: number; nodo: string };

function pct(aciertos: number, total: number): string {
  return total > 0 ? `${Math.round((aciertos / total) * 100)}%` : '—';
}
function duracionTxt(seg: number): string {
  if (!seg) return '';
  return seg >= 60 ? `${Math.round(seg / 60)} min` : `${seg} s`;
}

export default function DetalleAlumno() {
  const router = useRouter();
  const supabase = createClient();
  const params = useParams();
  const alumnoId = String(params.alumnoId);

  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [nodos, setNodos] = useState<NodoEstado[]>([]);
  const [analisis, setAnalisis] = useState<Eval>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
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

      const { data: ses } = await supabase
        .from('sesion')
        .select('fecha, aciertos, total, duracion_seg, nodo:nodo_id(nombre)')
        .eq('alumno_id', alumnoId)
        .order('fecha', { ascending: false })
        .limit(365);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSesiones(((ses as any[]) || []).map((s) => ({ fecha: s.fecha, aciertos: s.aciertos ?? 0, total: s.total ?? 0, duracion_seg: s.duracion_seg ?? 0, nodo: s.nodo?.nombre ?? 'Nodo' })));

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
      { alumno_id: alumnoId, nodo_id: nodoId, estado, estado_override: override, actualizado_at: new Date().toISOString() },
      { onConflict: 'alumno_id,nodo_id' },
    );
    setNodos((prev) => prev.map((n) => (n.nodo_id === nodoId ? { ...n, estado, override } : n)));
  }

  const now = new Date();
  const hoy = resumenHoy(sesiones, now);
  const { desde, hasta } = rangoHoy(now);
  const sesionesHoy = sesiones.filter((s) => {
    const t = new Date(s.fecha).getTime();
    return t >= new Date(desde).getTime() && t < new Date(hasta).getTime();
  });
  const ultima = ultimaSesion(sesiones);
  const meses = agruparPorMes(sesiones);

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
                <span style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>{ESTADO_LABEL[n.estado as keyof typeof ESTADO_LABEL] ?? n.estado}{n.override ? ' ·fijado' : ''}</span>
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

        {/* Lo de hoy */}
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A', margin: '26px 0 10px' }}>Lo de hoy</h2>
        {hoy.cantidad > 0 ? (
          <div style={{ background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 18, padding: '16px 18px' }}>
            <p style={{ margin: '0 0 10px', fontFamily: NUNITO, fontWeight: 800, fontSize: 16, color: '#3A332A' }}>
              {hoy.cantidad} {hoy.cantidad === 1 ? 'sesión' : 'sesiones'} hoy{hoy.total > 0 ? ` · ${hoy.aciertos}/${hoy.total} aciertos` : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sesionesHoy.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#5C5345', fontWeight: 600 }}>
                  <span style={{ flex: 1, fontFamily: QUICK, fontWeight: 700, color: '#3A332A' }}>{s.nodo}</span>
                  <span>{s.aciertos}/{s.total}</span>
                  {s.duracion_seg > 0 && <span style={{ color: '#9A8E7C' }}>· {duracionTxt(s.duracion_seg)}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>
            {!loaded ? 'Cargando…' : ultima ? `Sin práctica hoy · última vez ${haceCuanto(ultima, now)}.` : 'Todavía no practicó.'}
          </p>
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

        {/* Histórico mes a mes */}
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A', margin: '26px 0 10px' }}>Mes a mes</h2>
        {meses.length === 0 ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>{loaded ? 'Todavía no hay historial.' : 'Cargando…'}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meses.map((m) => (
              <div key={m.mes} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 14, padding: '10px 14px' }}>
                <span style={{ flex: 1, fontFamily: QUICK, fontWeight: 700, color: '#3A332A' }}>{m.label}</span>
                <span style={{ fontSize: 13.5, color: '#7A6F5F', fontWeight: 600 }}>{m.cantidad} {m.cantidad === 1 ? 'sesión' : 'sesiones'}</span>
                <span style={{ fontSize: 13.5, color: '#5C5345', fontWeight: 800 }}>{pct(m.aciertos, m.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
