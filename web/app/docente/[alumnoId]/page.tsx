'use client';
// Detalle del alumno para la docente (diseño Edutia / SP-4c + Etapa 4 + SP-4e):
// barra lateral, "Su mapa" (mini-mapa por materia; tocar un nodo fija su estado a
// mano = override), "Lo de hoy" (con fallback a la última vez), "Cómo viene" (barras
// mes a mes) y "Sugerencia de SOL" (de evaluacion_sesion). RLS deja ver solo a sus
// alumnos (es_mi_alumno); la lógica de fechas/meses sale de panel.ts (pura).
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal, sol, uiIcon, nodeIcon, starBadge, lockBadge } from '@/lib/art';
import { estadoColor, LEGEND, coordsCamino } from '@/lib/mapa-layout';
import { temaMateria, iconoNodo } from '@/lib/materia-tema';
import { ESTADO_LABEL, etiquetaEstado, rangoHoy, resumenHoy, ultimaSesion, haceCuanto, agruparPorMes, type EstadoNodo } from '@/lib/panel';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';
const solHappy = `${sol('happy')} center/contain no-repeat`;

type Alumno = { nombre: string; avatar: string; grado: number };
type NodoEstado = { nodo_id: string; estado: string; override: boolean; nombre: string; orden: number; materia: string };
type Err = { pregunta: string; respondio: string; esperaba: string };
type Eval = { resumen: string; errores: Err[]; a_reforzar: string[] } | null;
type Sesion = { fecha: string; aciertos: number; total: number; duracion_seg: number; nodo: string };

const TAG: Record<EstadoNodo, [string, string]> = {
  dominado: ['#E6F0DC', '#4E7A3A'],
  en_construccion: ['#FBEBD6', '#B9722A'],
  a_reforzar: ['#F7E2DD', '#BB4F3F'],
  no_empezado: ['#EDE6D6', '#8A7D63'],
};
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const GREENS = ['#C9D9BC', '#A8CE93', '#8FBF78', '#7FB069'];

function mesCorto(mesISO: string): string {
  const m = Number(mesISO.split('-')[1]);
  return MES_CORTO[m - 1] || mesISO;
}
function duracionTxt(seg: number): string {
  if (!seg) return '—';
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
  const [materiaSel, setMateriaSel] = useState('');
  const [selNode, setSelNode] = useState<string | null>(null);

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
        .select('nodo_id, estado, estado_override, nodo:nodo_id(nombre, orden, programa:programa_id(materia:materia_id(nombre)))')
        .eq('alumno_id', alumnoId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ns: NodoEstado[] = ((an as any[]) || []).map((r) => ({
        nodo_id: r.nodo_id, estado: r.estado, override: r.estado_override,
        nombre: r.nodo?.nombre ?? 'Nodo', orden: r.nodo?.orden ?? 0,
        materia: r.nodo?.programa?.materia?.nombre ?? 'Materia',
      }));
      setNodos(ns);
      setMateriaSel((prev) => prev || ns[0]?.materia || '');

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
      const row = ((ev as unknown[]) || [])[0] as { resumen: string; errores: Err[]; a_reforzar: string[] } | undefined;
      setAnalisis(row ? { resumen: row.resumen, errores: row.errores || [], a_reforzar: row.a_reforzar || [] } : null);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId]);

  async function fijarEstado(nodoId: string, valor: string) {
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
  const tiempoHoy = sesionesHoy.reduce((acc, s) => acc + s.duracion_seg, 0);
  const meses = agruparPorMes(sesiones);
  const barras = meses.slice(0, 4).reverse().map((m) => ({ label: mesCorto(m.mes), pct: m.total ? Math.round((m.aciertos / m.total) * 100) : 0 }));
  const maxPct = Math.max(1, ...barras.map((b) => b.pct));

  const materias = [...new Set(nodos.map((n) => n.materia))];
  const matActual = materiaSel || materias[0] || '';
  const nodosMat = nodos.filter((n) => n.materia === matActual).sort((a, b) => a.orden - b.orden);
  const coords = coordsCamino(nodosMat.length);
  const { estado: estadoPeor, label: tagLabel } = etiquetaEstado(nodos);
  const [tagBg, tagCo] = TAG[estadoPeor] ?? TAG.no_empezado;
  const nodoSel = nodos.find((n) => n.nodo_id === selNode) || null;

  const sugerencia = analisis?.resumen
    || (loaded && nodos.length === 0 ? 'Todavía no practicó. Invitala/o a empezar por la primera parada.' : 'Cuando practique un poco más, SOL te deja acá una sugerencia.');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <aside style={{ width: 236, flexShrink: 0, background: '#FFFCF5', borderRight: '2px solid #EFE3CE', padding: '26px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 22px' }}>
          <div style={{ width: 36, height: 36, background: solHappy }} />
          <span style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 22, color: '#3A332A', letterSpacing: '-.5px' }}>EDUTIA</span>
        </div>
        <button onClick={() => router.push('/docente')} className="ed-side" style={{ ...sideBtn, background: '#E3EEF4', color: '#3A332A' }}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('people')} center/contain no-repeat` }} />Mis alumnos
        </button>
        <button onClick={() => router.push('/docente/alumnos')} className="ed-side" style={sideBtn}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('people')} center/contain no-repeat` }} />Mi clase
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={async () => { await supabase.auth.signOut(); router.replace('/'); router.refresh(); }} className="ed-side" style={sideBtn}>Cerrar sesión</button>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)' }}>
        <button onClick={() => router.push('/docente')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 18 }}>‹ Mis alumnos</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, background: `${animal(alumno?.avatar || 'fox')} center/contain no-repeat` }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(26px,4vw,34px)', color: '#3A332A', margin: 0 }}>{alumno?.nombre || ''}</h1>
            <p style={{ fontSize: 15, color: '#7A6F5F', margin: '4px 0 0', fontWeight: 600 }}>{(alumno?.grado || 3)}° grado</p>
          </div>
          {nodos.length > 0 && (
            <span style={{ background: tagBg, color: tagCo, padding: '7px 14px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' }}>{tagLabel}</span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))', gap: 20, alignItems: 'start' }}>
          {/* Su mapa */}
          <div style={card}>
            <h3 style={cardTitle}>Su mapa</h3>
            <p style={cardSub}>Cómo va en cada tema. Tocá una parada para fijar su estado.</p>
            {materias.length > 1 && (
              <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
                {materias.map((mm) => {
                  const on = mm === matActual;
                  const t = temaMateria(mm);
                  return (
                    <button key={mm} onClick={() => { setMateriaSel(mm); setSelNode(null); }} style={on
                      ? { background: t.tint, color: t.color, border: `2px solid ${t.tintBorder}`, borderRadius: 999, padding: '7px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }
                      : { background: 'transparent', color: '#7A6F5F', border: '1.5px solid #EFE3CE', borderRadius: 999, padding: '7px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{mm}</button>
                  );
                })}
              </div>
            )}
            {nodosMat.length === 0 ? (
              <p style={{ color: '#7A6F5F', fontWeight: 600 }}>{loaded ? 'Todavía no practicó.' : 'Cargando…'}</p>
            ) : (
              <>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '520/360' }}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                    <path d={catmullPath(coords)} fill="none" stroke="#E6DAC2" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="0.5 8" vectorEffect="non-scaling-stroke" />
                  </svg>
                  {nodosMat.map((n, i) => {
                    const color = estadoColor(n.estado);
                    const [x, y] = coords[i];
                    const badge = n.estado === 'dominado' ? starBadge() : n.estado === 'no_empezado' ? lockBadge() : null;
                    const on = selNode === n.nodo_id;
                    return (
                      <button key={n.nodo_id} onClick={() => setSelNode(on ? null : n.nodo_id)} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', width: 'clamp(64px,11vw,82px)', padding: 0 }}>
                        <span style={{ position: 'relative', width: 'clamp(50px,8vw,64px)', height: 'clamp(50px,8vw,64px)', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 9px rgba(120,90,40,.16)', border: on ? '3px solid #F4A93B' : '3px solid #FFFCF5' }}>
                          <span style={{ width: '46%', height: '46%', background: `${nodeIcon(iconoNodo(i))} center/contain no-repeat` }} />
                          {badge && <span style={{ position: 'absolute', top: -3, right: -3, width: 17, height: 17, background: `${badge} center/contain no-repeat` }} />}
                        </span>
                        <span style={{ fontFamily: NUNITO, fontWeight: 700, fontSize: 11.5, color: '#4A3B32', background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(120,90,40,.08)' }}>{n.nombre}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
                  {LEGEND.map((l) => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: l.c, display: 'inline-block' }} />
                      <span style={{ fontSize: 12.5, color: '#7A6F5F', fontWeight: 700 }}>{l.label}</span>
                    </div>
                  ))}
                </div>
                {nodoSel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, background: '#FBF4E6', borderRadius: 14, padding: '10px 14px', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 120, fontFamily: QUICK, fontWeight: 700, color: '#3A332A' }}>
                      {nodoSel.nombre} <span style={{ fontSize: 12.5, color: '#7A6F5F', fontWeight: 700 }}>· {ESTADO_LABEL[nodoSel.estado as EstadoNodo] ?? nodoSel.estado}{nodoSel.override ? ' (fijado)' : ''}</span>
                    </span>
                    <select
                      value={nodoSel.override ? nodoSel.estado : 'auto'}
                      onChange={(e) => fijarEstado(nodoSel.nodo_id, e.target.value)}
                      style={{ fontFamily: NUNITO, fontWeight: 700, fontSize: 13, color: '#3A332A', border: '1.5px solid #EFE3CE', borderRadius: 10, padding: '6px 10px', background: '#FFFCF5' }}
                      aria-label={`Fijar estado de ${nodoSel.nombre}`}
                    >
                      <option value="auto">Auto (según práctica)</option>
                      <option value="no_empezado">Sin empezar</option>
                      <option value="en_construccion">En camino</option>
                      <option value="a_reforzar">A reforzar</option>
                      <option value="dominado">Lo domina</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          {/* columna derecha */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={card}>
              <h3 style={cardTitle}>Lo de hoy</h3>
              {hoy.cantidad > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                  <Stat label="Tema" value={sesionesHoy[0]?.nodo || '—'} />
                  <Stat label="Aciertos" value={hoy.total > 0 ? `${hoy.aciertos} de ${hoy.total}` : '—'} />
                  <Stat label="Tiempo" value={duracionTxt(tiempoHoy)} />
                  <Stat label="Sesiones" value={String(hoy.cantidad)} />
                </div>
              ) : (
                <p style={{ color: '#7A6F5F', fontWeight: 600, margin: '12px 0 0' }}>
                  {!loaded ? 'Cargando…' : ultima ? `Sin práctica hoy · última vez ${haceCuanto(ultima, now)}.` : 'Todavía no practicó.'}
                </p>
              )}
            </div>

            <div style={card}>
              <h3 style={{ ...cardTitle, marginBottom: 4 }}>Cómo viene</h3>
              <p style={cardSub}>Aciertos por mes</p>
              {barras.length === 0 ? (
                <p style={{ color: '#7A6F5F', fontWeight: 600 }}>{loaded ? 'Todavía no hay historial.' : 'Cargando…'}</p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 14, height: 120, paddingBottom: 26, position: 'relative' }}>
                  {barras.map((b, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                      <div style={{ width: '70%', maxWidth: 42, height: `${Math.round((b.pct / maxPct) * 100)}%`, background: GREENS[Math.min(i, GREENS.length - 1)], borderRadius: '10px 10px 4px 4px' }} title={`${b.pct}%`} />
                      <span style={{ position: 'absolute', bottom: -24, fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: '#FBEFD9', border: '1.5px solid #F4D9A6', borderRadius: 22, padding: '20px 22px' }}>
              <div style={{ width: 46, height: 46, flexShrink: 0, background: solHappy }} />
              <div>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: '#B9722A', marginBottom: 3 }}>Sugerencia de SOL</div>
                <div style={{ fontSize: 16, color: '#3A332A', fontWeight: 600, lineHeight: 1.4 }}>{sugerencia}</div>
                {analisis?.a_reforzar && analisis.a_reforzar.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {analisis.a_reforzar.map((t, i) => (
                      <span key={i} style={{ background: '#FBE6E0', color: '#C0573F', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>A reforzar: {t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#FBF4E6', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 21, color: '#3A332A' }}>{value}</div>
    </div>
  );
}

// catmull local (evita importar art en un módulo standalone; igual fórmula).
function catmullPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const sideBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14,
  background: 'none', border: 'none', color: '#7A6F5F', fontFamily: QUICK, fontWeight: 700,
  fontSize: 16, cursor: 'pointer', textAlign: 'left',
};
const card: React.CSSProperties = {
  background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 22, padding: 22, boxShadow: '0 4px 14px rgba(120,90,40,.07)',
};
const cardTitle: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: '#3A332A', margin: '0 0 4px' };
const cardSub: React.CSSProperties = { fontSize: 14, color: '#7A6F5F', margin: '0 0 14px', fontWeight: 600 };
