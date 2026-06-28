'use client';
// Practicar (diseño Edutia / SP-4): la práctica ES un chat con SOL. SOL saluda,
// hace cada pregunta como burbuja, el chico toca una opción (botones grandes en el
// pie), y SOL festeja o alienta. Confeti al acertar. Por debajo sigue el loop real:
// ejercicios del pool (elegirEjercicios), corrección local (vs ejercicio.correcta),
// reintentos + tiempo, y al terminar crea la sesion + respuestas, mueve alumno_nodo
// con la regla de dominio (calcularEstado/resolverEstado) y dispara evaluar-sesion.
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import { sol, item, uiIcon, alpha } from '@/lib/art';
import { temaMateria } from '@/lib/materia-tema';
import { saludo, cierre, praise, encourage } from '@/lib/practica-copy';
import { elegirEjercicios, resumen, type Ejercicio, type RespuestaReg, type HistorialEjercicio } from '@/lib/practica';
import { calcularEstado, resolverEstado, type EstadoNodo } from '@/lib/dominio';

const BALOO = "var(--font-baloo), cursive";
const NUNITO = 'var(--font-nunito), sans-serif';
const QUICK = 'var(--font-quicksand), sans-serif';
const MAX_REINTENTOS = 2;
const solHappy = sol('happy');

type Msg = { who: 'sol' | 'kid'; kind: 'text' | 'q'; text?: string; ejIdx?: number };
type ConfPiece = { left: string; top: string; w: number; h: number; bg: string; rot: number; round: boolean; dur: number; delay: number };

const CONF_COLS = ['#F4A93B', '#6FB7D4', '#7FB069', '#D98E5A', '#FFC24B'];

function PracticarInner() {
  const supabase = createClient();
  const router = useRouter();
  const me = useMe();
  const params = useParams();
  const search = useSearchParams();
  const programaId = String(params.programaId);
  const nodoId = search.get('nodo');

  const [nodoNombre, setNodoNombre] = useState('');
  const [materia, setMateria] = useState('');
  const [ejercicios, setEjercicios] = useState<Ejercicio[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [reintentos, setReintentos] = useState(0);
  const [selWrong, setSelWrong] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [respuestas, setRespuestas] = useState<RespuestaReg[]>([]);
  const [fin, setFin] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoNodo | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [ringing, setRinging] = useState(false);

  const tsRef = useRef<number | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const celTok = useRef(0);
  const ringTok = useRef(0);
  const confettiRef = useRef<ConfPiece[] | null>(null);
  if (!confettiRef.current) {
    confettiRef.current = Array.from({ length: 18 }).map((_, i) => {
      const sz = 8 + Math.random() * 8;
      const round = Math.random() > 0.5;
      return {
        left: `${6 + Math.random() * 88}%`, top: '-20px',
        w: sz, h: round ? sz : sz * 0.6, bg: CONF_COLS[i % CONF_COLS.length],
        rot: Math.random() * 360, round, dur: 1.6 + Math.random() * 1.2, delay: Math.random() * 0.5,
      };
    });
  }

  const tema = temaMateria(materia);

  useEffect(() => {
    if (!nodoId) return;
    (async () => {
      const { data: nodo } = await supabase.from('nodo').select('nombre').eq('id', nodoId).single();
      setNodoNombre((nodo as { nombre?: string } | null)?.nombre || '');
      const { data: prog } = await supabase.from('programa').select('materia:materia_id(nombre)').eq('id', programaId).single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMateria((prog as any)?.materia?.nombre || '');
      const { data } = await supabase
        .from('ejercicio')
        .select('id,enunciado,opciones,correcta,dificultad,tipo')
        .eq('nodo_id', nodoId);

      let historial: HistorialEjercicio[] = [];
      if (me) {
        const { data: win } = await supabase
          .from('respuesta')
          .select('correcta, reintentos, created_at, ejercicio:ejercicio_id!inner(tipo,dificultad), sesion:sesion_id!inner(alumno_id,nodo_id)')
          .eq('sesion.nodo_id', nodoId)
          .eq('sesion.alumno_id', me.id)
          .order('created_at', { ascending: false })
          .limit(8);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        historial = ((win as any[]) || []).map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo, dificultad: x.ejercicio?.dificultad }));
      }
      setEjercicios(elegirEjercicios((data as Ejercicio[]) || [], historial));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodoId, me]);

  // Sembrar el chat (saludo + primera pregunta) cuando llegan los ejercicios.
  useEffect(() => {
    if (ejercicios && ejercicios.length && msgs.length === 0) {
      setMsgs([{ who: 'sol', kind: 'text', text: saludo(materia, me?.nombre) }, { who: 'sol', kind: 'q', ejIdx: 0 }]);
      tsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejercicios, materia]);

  // Auto-scroll del hilo al último mensaje.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, celebrate]);

  function celebrar() {
    setCelebrate(true);
    const tk = ++celTok.current;
    setTimeout(() => { if (celTok.current === tk) setCelebrate(false); }, 1500);
  }
  function audio() {
    setRinging(true);
    const tk = ++ringTok.current;
    setTimeout(() => { if (ringTok.current === tk) setRinging(false); }, 900);
  }

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

      const { data: win } = await supabase
        .from('respuesta')
        .select('correcta, reintentos, created_at, ejercicio:ejercicio_id!inner(tipo,dificultad), sesion:sesion_id!inner(nodo_id)')
        .eq('sesion.nodo_id', nodoId)
        .order('created_at', { ascending: false })
        .limit(8);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ventana = ((win as any[]) || []).map((x) => ({ correcta: x.correcta, reintentos: x.reintentos, tipo: x.ejercicio?.tipo, dificultad: x.ejercicio?.dificultad }));
      const { data: an } = await supabase.from('alumno_nodo').select('estado, estado_override').eq('alumno_id', me.id).eq('nodo_id', nodoId).maybeSingle();
      const previo = an as { estado?: EstadoNodo; estado_override?: boolean } | null;
      const tasa = r.total ? r.aciertos / r.total : 0;
      const calculo = calcularEstado(ventana, tasa, previo?.estado || 'no_empezado');
      const res = resolverEstado(calculo, previo?.estado_override ?? false, previo?.estado || 'no_empezado');
      await supabase.from('alumno_nodo').upsert(
        { alumno_id: me.id, nodo_id: nodoId, estado: res.estado, puntaje: res.puntaje, actualizado_at: new Date().toISOString() },
        { onConflict: 'alumno_id,nodo_id' },
      );
      setNuevoEstado(res.estado);
      supabase.functions.invoke('evaluar-sesion', { body: { sesion_id: sesId, mock: true } }).catch(() => {});
    }
    setGuardando(false);
  }

  function selectChat(i: number, e: React.MouseEvent) {
    if (fin || !ejercicios) return;
    const ej = ejercicios[idx];
    const ahora = e.timeStamp;
    if (tsRef.current === null) tsRef.current = ahora;
    const tiempo = Math.max(1, Math.round((ahora - tsRef.current) / 1000));
    const opcion = ej.opciones[i];
    const conKid: Msg[] = [...msgs, { who: 'kid', kind: 'text', text: opcion }];
    const ni = idx + 1;
    const ultimo = ni >= ejercicios.length;

    if (opcion === ej.correcta) {
      setSelWrong(null);
      const reg: RespuestaReg = { ejercicio_id: ej.id, dada: opcion, correcta: true, reintentos, tiempo_seg: tiempo };
      const nextRegs = [...respuestas, reg];
      setRespuestas(nextRegs);
      celebrar();
      if (ultimo) {
        setMsgs([...conKid, { who: 'sol', kind: 'text', text: praise(idx) }, { who: 'sol', kind: 'text', text: cierre(materia, me?.nombre, nodoNombre) }]);
        setFin(true);
        guardarSesion(nextRegs);
      } else {
        setMsgs([...conKid, { who: 'sol', kind: 'text', text: praise(idx) }, { who: 'sol', kind: 'q', ejIdx: ni }]);
        setIdx(ni);
        setReintentos(0);
        tsRef.current = ahora;
      }
    } else if (reintentos + 1 >= MAX_REINTENTOS) {
      setSelWrong(null);
      const reg: RespuestaReg = { ejercicio_id: ej.id, dada: opcion, correcta: false, reintentos: reintentos + 1, tiempo_seg: tiempo };
      const nextRegs = [...respuestas, reg];
      setRespuestas(nextRegs);
      const reveal: Msg = { who: 'sol', kind: 'text', text: `Casi. La respuesta era ${ej.correcta}. ¡Seguimos!` };
      if (ultimo) {
        setMsgs([...conKid, reveal, { who: 'sol', kind: 'text', text: cierre(materia, me?.nombre, nodoNombre) }]);
        setFin(true);
        guardarSesion(nextRegs);
      } else {
        setMsgs([...conKid, reveal, { who: 'sol', kind: 'q', ejIdx: ni }]);
        setIdx(ni);
        setReintentos(0);
        tsRef.current = ahora;
      }
    } else {
      setMsgs([...conKid, { who: 'sol', kind: 'text', text: encourage(reintentos) }]);
      setReintentos(reintentos + 1);
      setSelWrong(i);
    }
  }

  // ----- guards -----
  if (!nodoId) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px', textAlign: 'center' }}>
        <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Elegí una parada en tu mapa para practicar.</p>
        <button onClick={() => router.push(`/alumno/${programaId}/mapa`)} className="ed-primary" style={btnPrimary}>Ir al mapa</button>
      </div>
    );
  }
  if (ejercicios === null) return <p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600, textAlign: 'center' }}>Cargando…</p>;
  if (ejercicios.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 22px', textAlign: 'center' }}>
        <div style={{ width: 90, height: 90, background: `${sol('soft')} center/contain no-repeat` }} />
        <p style={{ color: '#7A6F5F', fontWeight: 600, marginTop: 12 }}>{nodoNombre || 'Este nodo'} todavía no tiene ejercicios.</p>
        <button onClick={() => router.push(`/alumno/${programaId}/mapa`)} className="ed-primary" style={btnPrimary}>Volver al mapa</button>
      </div>
    );
  }

  const ej = ejercicios[idx];
  const r = resumen(respuestas);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imgKey = (ej as any).imagen as string | undefined;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'edFade .3s ease' }}>
      {/* sub-barra de materia */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px clamp(16px,4vw,40px)', background: '#FFFCF5', borderBottom: '1.5px solid #EFE3CE' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: tema.color, display: 'inline-block' }} />
          <span style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 16, color: '#3A332A' }}>Practicando {materia || ''}</span>
        </div>
        <button onClick={() => router.push('/alumno')} style={{ background: 'none', border: 'none', color: '#C77E3A', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Cambiar materia</button>
      </div>

      {/* hilo */}
      <div ref={threadRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px clamp(16px,4vw,28px) 8px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
          {msgs.map((m, i) => {
            const isSol = m.who === 'sol';
            const text = m.kind === 'q' ? ejercicios[m.ejIdx!].enunciado : m.text;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const qimg = m.kind === 'q' ? ((ejercicios[m.ejIdx!] as any).imagen as string | undefined) : undefined;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, margin: '12px 0', justifyContent: isSol ? 'flex-start' : 'flex-end', animation: 'edIn .25s ease' }}>
                {isSol && <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', background: `${solHappy} center/contain no-repeat` }} />}
                <div style={isSol
                  ? { maxWidth: '80%', background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 20, borderBottomLeftRadius: 6, padding: '13px 17px', boxShadow: '0 4px 12px rgba(120,90,40,.08)' }
                  : { maxWidth: '80%', background: tema.color, borderRadius: 20, borderBottomRightRadius: 6, padding: '12px 20px', boxShadow: `0 6px 14px ${alpha(tema.color, 0.3)}` }}>
                  {qimg && <div style={{ width: 'clamp(120px,32vw,148px)', height: 'clamp(120px,32vw,148px)', margin: '2px 0 10px', background: `${item(qimg)} center/contain no-repeat` }} />}
                  <p style={{ margin: 0, fontFamily: NUNITO, fontWeight: 700, fontSize: 'clamp(16px,2.3vw,18px)', lineHeight: 1.35, color: isSol ? '#3A332A' : '#fff' }}>{text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* pie: opciones o cierre */}
      <div style={{ flexShrink: 0, background: '#FFFCF5', borderTop: '2px solid #EFE3CE', padding: '14px clamp(16px,4vw,28px) 20px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
          {!fin ? (
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
              <button onClick={audio} aria-label="Escuchar" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 60, flexShrink: 0, borderRadius: 18, background: '#FBEFD9', border: '2px solid #F4D9A6', cursor: 'pointer' }}>
                <span style={{ width: 28, height: 28, background: `${uiIcon('speaker')} center/contain no-repeat` }} />
                {ringing && <span style={{ position: 'absolute', inset: -2, borderRadius: 18, border: '2.5px solid #F4A93B', animation: 'edRing .9s ease-out' }} />}
              </button>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(108px,1fr))', gap: 12 }}>
                {ej.opciones.map((op, i) => {
                  const big = op.length <= 2;
                  const wrong = selWrong === i;
                  return (
                    <button
                      key={op + i}
                      onClick={(e) => selectChat(i, e)}
                      style={{
                        minHeight: 66, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                        fontFamily: BALOO, fontWeight: 800, fontSize: big ? 'clamp(32px,7vw,46px)' : 'clamp(16px,3vw,21px)',
                        color: wrong ? '#BB4F3F' : '#3A332A', background: wrong ? '#F7E2DD' : '#FFFCF5',
                        border: `2.5px solid ${wrong ? '#D46A5A' : '#EFE3CE'}`, borderRadius: 18, cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(120,90,40,.07)', padding: '8px 12px', transition: 'transform .1s ease',
                        animation: wrong ? 'edShake .4s ease' : undefined,
                      }}
                    >
                      {op}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <p style={{ margin: 0, color: '#7A6F5F', fontWeight: 700, fontSize: 15 }}>
                Acertaste {r.aciertos} de {r.total}{guardando ? ' · guardando…' : nuevoEstado === 'dominado' ? ' · ¡lo dominaste! ⭐' : ''}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => router.push(`/alumno/${programaId}/mapa`)} className="ed-primary" style={{ background: '#F4A93B', color: '#fff', border: 'none', borderRadius: 999, padding: '15px 32px', fontFamily: BALOO, fontWeight: 700, fontSize: 19, cursor: 'pointer', boxShadow: '0 8px 20px rgba(244,169,59,.32)' }}>Volver al mapa</button>
                <button onClick={() => router.push('/alumno')} className="ed-signout" style={{ background: '#FFFCF5', color: '#7A6F5F', border: '2px solid #EFE3CE', borderRadius: 999, padding: '15px 28px', fontFamily: BALOO, fontWeight: 700, fontSize: 19, cursor: 'pointer' }}>Practicar otra materia</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* confeti */}
      {celebrate && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 8 }}>
          {confettiRef.current!.map((c, i) => (
            <span key={i} style={{ position: 'absolute', left: c.left, top: c.top, width: c.w, height: c.h, background: c.bg, borderRadius: c.round ? '50%' : 3, transform: `rotate(${c.rot}deg)`, animation: `edFall ${c.dur.toFixed(2)}s ease-in ${c.delay.toFixed(2)}s forwards` }} />
          ))}
        </div>
      )}
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
