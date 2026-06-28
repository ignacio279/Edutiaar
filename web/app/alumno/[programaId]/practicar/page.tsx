'use client';
// Practicar (Fase 2 / SP-4a): loop real de práctica de un nodo. Sirve ejercicios de
// opción múltiple del pool, corrige local (vs ejercicio.correcta), registra reintentos
// y tiempo, y al terminar crea la sesion + las respuestas. (El mapa NO cambia todavía:
// la regla de dominio que mueve alumno_nodo es SP-4b.)
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { sol } from '@/lib/art';
import { elegirEjercicios, resumen, type Ejercicio, type RespuestaReg } from '@/lib/practica';
import { calcularEstado, type EstadoNodo } from '@/lib/dominio';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';
const MAX_REINTENTOS = 2;

function PracticarInner() {
  const supabase = createClient();
  const router = useRouter();
  const me = useMe();
  const params = useParams();
  const search = useSearchParams();
  const programaId = String(params.programaId);
  const nodoId = search.get('nodo');

  const [nodoNombre, setNodoNombre] = useState('');
  const [ejercicios, setEjercicios] = useState<Ejercicio[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [reintentos, setReintentos] = useState(0);
  const tsRef = useRef<number | null>(null); // timeStamp (puro, del evento) del inicio del ejercicio
  const [feedback, setFeedback] = useState<'' | 'bien' | 'casi' | 'revelado'>('');
  const [respuestas, setRespuestas] = useState<RespuestaReg[]>([]);
  const [fin, setFin] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoNodo | null>(null);

  useEffect(() => {
    if (!nodoId) return; // el render ya muestra el prompt de "elegí una parada"
    (async () => {
      const { data: nodo } = await supabase.from('nodo').select('nombre').eq('id', nodoId).single();
      setNodoNombre((nodo as { nombre?: string } | null)?.nombre || '');
      const { data } = await supabase
        .from('ejercicio')
        .select('id,enunciado,opciones,correcta,dificultad,tipo')
        .eq('nodo_id', nodoId);
      setEjercicios(elegirEjercicios((data as Ejercicio[]) || []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodoId]);

  async function guardarSesion(regs: RespuestaReg[]) {
    if (!me || !nodoId) return;
    setGuardando(true);
    const r = resumen(regs);
    const dur = regs.reduce((s, x) => s + x.tiempo_seg, 0);
    const { data: ses } = await supabase
      .from('sesion')
      .insert({ alumno_id: me.id, nodo_id: nodoId, duracion_seg: dur, aciertos: r.aciertos, total: r.total })
      .select('id')
      .single();
    const sesId = (ses as { id?: string } | null)?.id;
    if (sesId) {
      await supabase.from('respuesta').insert(
        regs.map((x) => ({ sesion_id: sesId, ejercicio_id: x.ejercicio_id, dada: x.dada, correcta: x.correcta, reintentos: x.reintentos, tiempo_seg: x.tiempo_seg })),
      );

      // SP-4b: regla de dominio determinística → actualiza alumno_nodo (el mapa cambia).
      const { data: win } = await supabase
        .from('respuesta')
        .select('correcta, reintentos, created_at, ejercicio:ejercicio_id!inner(tipo,dificultad), sesion:sesion_id!inner(nodo_id)')
        .eq('sesion.nodo_id', nodoId)
        .order('created_at', { ascending: false })
        .limit(8);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ventana = ((win as any[]) || []).map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo, dificultad: x.ejercicio?.dificultad }));
      const { data: an } = await supabase.from('alumno_nodo').select('estado').eq('alumno_id', me.id).eq('nodo_id', nodoId).maybeSingle();
      const tasa = r.total ? r.aciertos / r.total : 0;
      const res = calcularEstado(ventana, tasa, (an as { estado?: EstadoNodo } | null)?.estado || 'no_empezado');
      await supabase.from('alumno_nodo').upsert(
        { alumno_id: me.id, nodo_id: nodoId, estado: res.estado, puntaje: res.puntaje, actualizado_at: new Date().toISOString() },
        { onConflict: 'alumno_id,nodo_id' },
      );
      setNuevoEstado(res.estado);
    }
    setGuardando(false);
  }

  function avanzar(regs: RespuestaReg[], ts: number) {
    if (idx + 1 >= (ejercicios?.length || 0)) {
      setRespuestas(regs);
      setFin(true);
      guardarSesion(regs);
    } else {
      setRespuestas(regs);
      setIdx(idx + 1);
      setReintentos(0);
      setFeedback('');
      tsRef.current = ts; // el inicio del próximo ejercicio = este click
    }
  }

  function responder(opcion: string, e: React.MouseEvent) {
    if (!ejercicios || feedback === 'bien' || feedback === 'revelado') return;
    const ej = ejercicios[idx];
    const ahora = e.timeStamp; // ms desde la carga (puro, viene del evento)
    if (tsRef.current === null) tsRef.current = ahora;
    const tiempo = Math.max(1, Math.round((ahora - tsRef.current) / 1000));
    if (opcion === ej.correcta) {
      setFeedback('bien');
      const reg: RespuestaReg = { ejercicio_id: ej.id, dada: opcion, correcta: true, reintentos, tiempo_seg: tiempo };
      setTimeout(() => avanzar([...respuestas, reg], ahora), 700);
    } else if (reintentos + 1 >= MAX_REINTENTOS) {
      setFeedback('revelado');
      const reg: RespuestaReg = { ejercicio_id: ej.id, dada: opcion, correcta: false, reintentos: reintentos + 1, tiempo_seg: tiempo };
      setTimeout(() => avanzar([...respuestas, reg], ahora), 1100);
    } else {
      setReintentos(reintentos + 1);
      setFeedback('casi');
    }
  }

  if (!nodoId) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px', textAlign: 'center' }}>
        <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Elegí una parada en tu mapa para practicar.</p>
        <button onClick={() => router.push(`/alumno/${programaId}/mapa`)} style={btnPrimary}>Ir al mapa</button>
      </div>
    );
  }
  if (ejercicios === null) return <p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600, textAlign: 'center' }}>Cargando…</p>;
  if (ejercicios.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px', textAlign: 'center' }}>
        <div style={{ width: 90, height: 90, background: `${sol('soft')} center/contain no-repeat` }} />
        <p style={{ color: '#7A6F5F', fontWeight: 600, marginTop: 12 }}>{nodoNombre || 'Este nodo'} todavía no tiene ejercicios.</p>
        <button onClick={() => router.push(`/alumno/${programaId}/mapa`)} style={btnPrimary}>Volver al mapa</button>
      </div>
    );
  }

  if (fin) {
    const r = resumen(respuestas);
    const dominado = nuevoEstado === 'dominado';
    const reforzar = nuevoEstado === 'a_reforzar';
    const titulo = dominado ? `¡Dominaste ${nodoNombre}! ⭐` : reforzar ? 'Lo vamos a reforzar 💪' : '¡Muy bien!';
    const mood = dominado ? 'cheer' : reforzar ? 'soft' : 'happy';
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px', textAlign: 'center', animation: 'edFade .3s ease' }}>
        <div style={{ width: 120, height: 120, animation: 'edBob 4.5s ease-in-out infinite', background: `${sol(mood)} center/contain no-repeat` }} />
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 26, color: '#3A332A', margin: '14px 0 4px' }}>{titulo}</h2>
        <p style={{ color: '#7A6F5F', fontWeight: 700, fontSize: 18 }}>Acertaste {r.aciertos} de {r.total}{guardando ? ' · guardando…' : ''}</p>
        <button onClick={() => router.push(`/alumno/${programaId}/mapa`)} style={btnPrimary}>Volver al mapa</button>
      </div>
    );
  }

  const ej = ejercicios[idx];
  const bloqueado = feedback === 'bien' || feedback === 'revelado';
  return (
    <div style={{ flex: 1, maxWidth: 560, width: '100%', margin: '0 auto', padding: '24px 22px 48px', animation: 'edFade .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: QUICK, fontWeight: 700, color: '#7A6F5F' }}>{nodoNombre}</span>
        <span style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 700 }}>{idx + 1} / {ejercicios.length}</span>
      </div>

      <div style={{ background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 20, padding: '20px 18px', boxShadow: '0 4px 12px rgba(120,90,40,.08)' }}>
        <p style={{ margin: '0 0 16px', fontFamily: NUNITO, fontWeight: 700, fontSize: 19, color: '#3A332A', lineHeight: 1.35 }}>{ej.enunciado}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {ej.opciones.map((op) => {
            const esCorrecta = op === ej.correcta;
            const mostrar = feedback === 'revelado' && esCorrecta;
            const bg = mostrar ? '#EAF4E2' : '#FBF4E6';
            const bd = mostrar ? '#7FB069' : '#EFE3CE';
            return (
              <button
                key={op}
                onClick={(e) => responder(op, e)}
                disabled={bloqueado}
                style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 14, border: `2px solid ${bd}`, background: bg, fontFamily: NUNITO, fontSize: 16, fontWeight: 700, color: '#3A332A', cursor: bloqueado ? 'default' : 'pointer' }}
              >
                {op}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ textAlign: 'center', minHeight: 28, marginTop: 14, fontWeight: 700 }}>
        {feedback === 'bien' && <span style={{ color: '#7FB069' }}>¡Correcto! 🎉</span>}
        {feedback === 'casi' && <span style={{ color: '#E89B42' }}>Casi… probá de nuevo 💪</span>}
        {feedback === 'revelado' && <span style={{ color: '#7A6F5F' }}>La respuesta era: <b>{ej.correcta}</b></span>}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  marginTop: 18, background: '#F4A93B', color: '#fff', border: 'none', borderRadius: 999,
  padding: '14px 30px', fontFamily: QUICK, fontWeight: 700, fontSize: 17, cursor: 'pointer',
};

export default function Practicar() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600, textAlign: 'center' }}>Cargando…</p>}>
      <PracticarInner />
    </Suspense>
  );
}
