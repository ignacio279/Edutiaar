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
import { toast } from '@/lib/toast';
import { elegirEjercicios, resumen, type Ejercicio, type RespuestaReg, type HistorialEjercicio } from '@/lib/practica';
import { calcularEstado, resolverEstado, type EstadoNodo } from '@/lib/dominio';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';
const MAX_REINTENTOS = 2;
const CHAT_CAP = 20; // tope de mensajes del chico por sesión (guardarraíl de costo)

type ChatMsg = { role: 'user' | 'sol'; content: string };

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
  const tsRef = useRef<number | null>(null); // timeStamp (puro, del evento) del inicio del ejercicio
  const [feedback, setFeedback] = useState<'' | 'bien' | 'casi' | 'revelado'>('');
  const [respuestas, setRespuestas] = useState<RespuestaReg[]>([]);
  const [fin, setFin] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoNodo | null>(null);

  // Chat con SOL (efímero, vive mientras dura la sesión de practicar).
  const [chatAbierto, setChatAbierto] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatCargando, setChatCargando] = useState(false);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (!nodoId) return; // el render ya muestra el prompt de "elegí una parada"
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

      // Historia reciente del chico en el nodo (más reciente primero) → escalera + adaptiva.
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

      // SP-4c: diagnóstico cualitativo de SOL (no bloquea, no mueve el estado).
      supabase.functions.invoke('evaluar-sesion', { body: { sesion_id: sesId, mock: true } }).catch(() => {});
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

  async function enviarChat(texto: string, esAyuda: boolean) {
    const t = texto.trim();
    if (!t || chatCargando) return;
    if (chatMsgs.filter((m) => m.role === 'user').length >= CHAT_CAP) {
      toast('Por hoy ya charlamos bastante 🌞 ¡Seguí practicando!');
      return;
    }
    const ejActual = ejercicios?.[idx];
    const contexto = {
      materia,
      nodoNombre,
      ejercicio: ejActual ? { enunciado: ejActual.enunciado, opciones: ejActual.opciones, correcta: ejActual.correcta } : undefined,
    };
    const nuevos: ChatMsg[] = [...chatMsgs, { role: 'user', content: t }];
    setChatMsgs(nuevos);
    setChatInput('');
    setChatAbierto(true);
    setChatCargando(true);
    const { data, error } = await supabase.functions.invoke('sol-chat', {
      body: { mensajes: nuevos, contexto, esAyuda, mock: true },
    });
    setChatCargando(false);
    if (error || !data?.texto) {
      toast('SOL no pudo responder ahora 🙈 Probá de nuevo.');
      return;
    }
    setChatMsgs([...nuevos, { role: 'sol', content: String(data.texto) }]);
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

      {/* Chat con SOL: pedir ayuda del ejercicio o preguntar libre del tema. */}
      <div style={{ marginTop: 18 }}>
        {!chatAbierto ? (
          <button
            onClick={() => { setChatAbierto(true); if (chatMsgs.length === 0) enviarChat('¿Me ayudás con esto? 🙏', true); }}
            style={btnAyuda}
          >
            💬 Pedir ayuda a SOL
          </button>
        ) : (
          <div style={chatCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, display: 'inline-block', background: `${sol('happy')} center/contain no-repeat` }} />
                <b style={{ fontFamily: QUICK, color: '#3A332A' }}>SOL</b>
              </span>
              <button onClick={() => setChatAbierto(false)} style={chatClose} aria-label="Cerrar chat">✕</button>
            </div>
            <div style={chatMsgsBox}>
              {chatMsgs.length === 0 && (
                <p style={{ color: '#7A6F5F', fontWeight: 600, textAlign: 'center', margin: '8px 0' }}>
                  Preguntame lo que quieras sobre {nodoNombre} 🌞
                </p>
              )}
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <span style={m.role === 'user' ? burbujaUser : burbujaSol}>{m.content}</span>
                </div>
              ))}
              {chatCargando && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}><span style={burbujaSol}>SOL está pensando…</span></div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') enviarChat(chatInput, false); }}
                placeholder="Escribile a SOL…"
                disabled={chatCargando}
                style={chatInputStyle}
              />
              <button onClick={() => enviarChat(chatInput, false)} disabled={chatCargando || !chatInput.trim()} style={chatSend}>Enviar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  marginTop: 18, background: '#F4A93B', color: '#fff', border: 'none', borderRadius: 999,
  padding: '14px 30px', fontFamily: QUICK, fontWeight: 700, fontSize: 17, cursor: 'pointer',
};

const btnAyuda: React.CSSProperties = {
  width: '100%', background: '#FBF4E6', color: '#3A332A', border: '2px solid #EFE3CE', borderRadius: 14,
  padding: '12px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 16, cursor: 'pointer',
};
const chatCard: React.CSSProperties = {
  background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 20, padding: '14px 14px 16px',
  boxShadow: '0 4px 12px rgba(120,90,40,.08)', animation: 'edFade .25s ease',
};
const chatClose: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 16, cursor: 'pointer', lineHeight: 1,
};
const chatMsgsBox: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', padding: '4px 2px',
};
const burbujaBase: React.CSSProperties = {
  maxWidth: '82%', padding: '9px 13px', borderRadius: 14, fontFamily: NUNITO, fontWeight: 600, fontSize: 15,
  lineHeight: 1.35, whiteSpace: 'pre-wrap',
};
const burbujaUser: React.CSSProperties = { ...burbujaBase, background: '#F4A93B', color: '#fff', borderBottomRightRadius: 4 };
const burbujaSol: React.CSSProperties = { ...burbujaBase, background: '#FBF4E6', color: '#3A332A', border: '1.5px solid #EFE3CE', borderBottomLeftRadius: 4 };
const chatInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, border: '2px solid #EFE3CE', borderRadius: 12, padding: '10px 12px',
  fontFamily: NUNITO, fontSize: 15, fontWeight: 600, color: '#3A332A', background: '#fff',
};
const chatSend: React.CSSProperties = {
  background: '#F4A93B', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 16px',
  fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer',
};

export default function Practicar() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600, textAlign: 'center' }}>Cargando…</p>}>
      <PracticarInner />
    </Suspense>
  );
}
