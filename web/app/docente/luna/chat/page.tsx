'use client';
// LUNA — chat 24/7 de la docente, con el contexto acotado al aula activa
// (`?aula=`): las alertas que viajan con el mensaje y el aula_id que la Edge
// Function usa para armar el system salen solo de esa aula. El HILO sigue
// siendo único por docente (decisión: no hay hilos por aula). Espejo del chat
// de practicar (alumno), pero: el hilo se PERSISTE en luna_mensaje (lo escribe
// la Edge Function luna-chat; acá solo se lee por RLS), hay "Limpiar
// conversación" (delete RLS) y las alertas calculadas en el cliente viajan
// como contexto del mensaje. El fetch es manual con JWT (patrón autoría) para
// poder leer códigos de error y dar copy específico (tope diario, etc.).
import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { toast } from '@/lib/toast';
import { fetchConTimeout } from '@/lib/edge';
import { uiIcon } from '@/lib/art';
import { alertasAula, mensajeErrorLuna, type RespuestaLuna } from '@/lib/luna';
import { enAula, linkLuna, puedeCambiarAula, resolverAula, type AulaLite } from '@/lib/luna-aula';
import { VIOLETA } from '@/lib/luna-tema';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

const BIENVENIDA = 'Hola, soy LUNA 🌙 Te puedo ayudar a planificar clases (incluso plurigrado), leer las señales de tu aula o pensar cómo acompañar a un alumno. ¿Por dónde empezamos?';

// Pill cálida de acciones secundarias (Limpiar, ‹ LUNA, Cambiar de aula), calcada del diseño.
const PILL: CSSProperties = {
  background: VIOLETA.carta, border: `1.5px solid ${VIOLETA.bordeCalido}`, borderRadius: 999,
  padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: VIOLETA.tinta2, cursor: 'pointer',
};

// Chips de sugerencia (solo con el hilo vacío): precargan el input, no envían solos.
const SUGERENCIAS = [
  'Armame la clase de mañana',
  '¿Cómo viene mi aula esta semana?',
  'Un eje común para trabajar en plurigrado',
];

type Msg = { role: 'user' | 'luna'; content: string };
type AlertaPayload = { alumno: string; prioridad: string; detalle: string };

function ChatLuna({ aulaParam }: { aulaParam: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [alertas, setAlertas] = useState<AlertaPayload[]>([]);
  const [aula, setAula] = useState<AulaLite | null>(null);
  const [cambiable, setCambiable] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }

      const now = new Date();
      const desde21 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21).toISOString();
      const [aulasR, als] = await Promise.all([
        supabase.from('aula').select('id, nombre, codigo').eq('docente_id', user.id).order('nombre'),
        supabase.from('perfil')
          .select('id, nombre, avatar, grado, aula_id').eq('rol', 'alumno').eq('docente_id', user.id),
      ]);
      const aulas = ((aulasR.data as AulaLite[]) || []);
      const res = resolverAula(aulaParam, aulas);
      // Sin aula resuelta (2+ aulas y sin param válido) → a elegirla al selector.
      if (res.modo === 'selector') { router.replace('/docente/luna'); return; }
      setAula(res.aula);
      setCambiable(puedeCambiarAula(aulas));

      // El contexto (alertas) se calcula solo con los alumnos del aula activa.
      const todos = ((als.data as { id: string; nombre: string; avatar: string | null; grado: number | null; aula_id: string | null }[]) || []);
      const alumnos = enAula(todos, res.aula.id);
      const ids = alumnos.map((a) => a.id);

      const [hist, ses, resp, nodosAl] = await Promise.all([
        supabase.from('luna_mensaje').select('role, content').eq('docente_id', user.id)
          .order('created_at', { ascending: true }).limit(200),
        ids.length
          ? supabase.from('sesion').select('alumno_id, nodo_id, fecha, aciertos, total').in('alumno_id', ids).gte('fecha', desde21)
          : Promise.resolve({ data: [] }),
        supabase.from('respuesta')
          .select('correcta, created_at, sesion:sesion_id(alumno_id, nodo_id), ejercicio:ejercicio_id(tipo)')
          .gte('created_at', desde21),
        ids.length
          ? supabase.from('alumno_nodo').select('alumno_id, nodo_id, estado').in('alumno_id', ids)
          : Promise.resolve({ data: [] }),
      ]);

      // Alertas del aula → contexto del chat (solo campos mínimos).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const respuestas: RespuestaLuna[] = ((resp.data as any[]) || [])
        .filter((r) => r.sesion?.alumno_id)
        .map((r) => ({
          alumnoId: r.sesion.alumno_id, nodoId: r.sesion.nodo_id ?? '',
          tipo: r.ejercicio?.tipo ?? 'reconocer', correcta: !!r.correcta, createdAt: r.created_at,
        }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todas = alertasAula(alumnos, ((ses.data as any[]) || []), respuestas, ((nodosAl.data as any[]) || []), [], now);
      setAlertas(todas.filter((a) => !a.positiva).map((a) => ({ alumno: a.alumnoNombre, prioridad: a.prioridad, detalle: a.detalle })));

      setMsgs(((hist.data as Msg[]) || []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aulaParam]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, enviando]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando || msgs === null) return;
    setMsgs((prev) => [...(prev ?? []), { role: 'user', content: t }]);
    setTexto('');
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // 30s de tope: si LUNA no responde, avisamos en vez de dejar el input colgado.
      const r = await fetchConTimeout(`${URL}/functions/v1/luna-chat`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        // aula_id: la Edge Function acota el contexto del system a esa aula.
        body: JSON.stringify({ mensaje: t, alertas, aula_id: aula?.id }),
      }, 30000);
      const j = await r.json().catch(() => ({}));
      setEnviando(false);
      if (!r.ok || !j?.texto) {
        // Devolvemos el turno: sacamos el mensaje optimista y restauramos el texto.
        setMsgs((prev) => (prev ?? []).slice(0, -1));
        setTexto(t);
        toast(mensajeErrorLuna(j?.error));
        return;
      }
      const parrafos: string[] = Array.isArray(j.parrafos) && j.parrafos.length ? j.parrafos.map(String) : [String(j.texto)];
      setMsgs((prev) => [...(prev ?? []), ...parrafos.map((p): Msg => ({ role: 'luna', content: p }))]);
    } catch {
      setEnviando(false);
      setMsgs((prev) => (prev ?? []).slice(0, -1));
      setTexto(t);
      toast(mensajeErrorLuna('timeout'));
    }
  }

  async function limpiar() {
    if (enviando || !msgs?.length) return;
    if (!window.confirm('¿Limpiar la conversación? LUNA se olvida de este hilo (las alertas y datos del aula no se tocan).')) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('luna_mensaje').delete().eq('docente_id', user.id);
    if (error) { toast('No se pudo limpiar la conversación.'); return; }
    setMsgs([]);
    toast('Conversación limpia. Empezamos de nuevo 🌙');
  }

  const vacio = msgs !== null && msgs.length === 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: VIOLETA.suave, animation: 'edFade .3s ease' }}>
      <DocenteSidebar activo="luna" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, background: `${uiIcon('moon')} center/contain no-repeat` }} />
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,3.5vw,30px)', color: VIOLETA.ink, margin: 0 }}>
              Consultar con LUNA
            </h1>
          </div>
          <button onClick={limpiar} className="ed-primary" style={{ ...PILL, padding: '9px 18px' }}>
            Limpiar conversación
          </button>
        </div>

        {aula && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button onClick={() => router.push(linkLuna('/docente/luna', aula.id))} className="ed-primary" style={PILL}>
              ‹ LUNA
            </button>
            <span style={{ background: VIOLETA.claro, border: `1.5px solid ${VIOLETA.borde}`, borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: VIOLETA.oscuro }}>
              Aula: {aula.nombre} · {aula.codigo}
            </span>
            {cambiable && (
              <button onClick={() => router.push('/docente/luna')} className="ed-primary" style={PILL}>
                Cambiar de aula
              </button>
            )}
          </div>
        )}

        <div ref={threadRef} style={{ height: 'min(52vh, 520px)', overflowY: 'auto', background: VIOLETA.carta, border: `2px solid ${VIOLETA.bordeCalido}`, borderRadius: 22, padding: '16px 20px', marginTop: 16 }}>
          {msgs === null ? (
            <p style={{ color: VIOLETA.medio, fontWeight: 600, fontFamily: NUNITO }}>Cargando…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Burbuja role="luna" content={BIENVENIDA} />
              {msgs.map((m, i) => <Burbuja key={i} role={m.role} content={m.content} />)}
              {enviando && (
                <p style={{ margin: '0 0 0 48px', fontSize: 13.5, color: VIOLETA.medio, fontWeight: 700, fontFamily: NUNITO }}>LUNA está pensando…</p>
              )}
            </div>
          )}
        </div>

        {vacio && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            {SUGERENCIAS.map((s) => (
              <button key={s} onClick={() => setTexto(s)} className="ed-primary" style={{ background: VIOLETA.carta, border: `1.5px solid ${VIOLETA.borde}`, borderRadius: 999, padding: '10px 18px', fontFamily: NUNITO, fontWeight: 700, fontSize: 14.5, color: VIOLETA.oscuro, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
            placeholder="Preguntale a LUNA: «armame la clase de mañana»…"
            disabled={enviando || msgs === null}
            style={{ flex: 1, minWidth: 0, padding: '14px 20px', border: `2px solid ${VIOLETA.borde}`, borderRadius: 999, fontFamily: NUNITO, fontSize: 15.5, fontWeight: 600, color: VIOLETA.ink, background: VIOLETA.carta, outline: 'none' }}
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim() || msgs === null}
            className="ed-primary"
            style={{
              background: VIOLETA.base, color: '#fff', border: 'none', borderRadius: 999, padding: '14px 30px',
              fontFamily: QUICK, fontWeight: 700, fontSize: 16,
              boxShadow: `0 6px 16px ${VIOLETA.sombraFuerte}`,
              cursor: enviando || !texto.trim() ? 'default' : 'pointer',
              opacity: enviando || !texto.trim() ? 0.6 : 1,
            }}
          >
            {enviando ? '…' : 'Enviar'}
          </button>
        </div>
      </main>
    </div>
  );
}

// useSearchParams exige Suspense en el App Router (mismo patrón que autoría).
// El key por aula remonta el chat al cambiar de aula: recarga el hilo (que
// sigue siendo único por docente) y las alertas del aula nueva, sin setState
// sincrónico en el efecto.
function ConAula() {
  const aulaParam = useSearchParams().get('aula');
  return <ChatLuna key={aulaParam ?? ''} aulaParam={aulaParam} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: VIOLETA.medio, fontWeight: 600 }}>Cargando…</p>}>
      <ConAula />
    </Suspense>
  );
}

// Burbujas, calcadas del diseño: LUNA con su avatar de luna (38px) y burbuja
// violeta clara a la izquierda (esquina inferior izquierda recta); la docente
// en burbuja neutra cálida a la derecha.
function Burbuja({ role, content }: { role: 'user' | 'luna'; content: string }) {
  const esLuna = role === 'luna';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, justifyContent: esLuna ? 'flex-start' : 'flex-end', animation: 'edIn .25s ease' }}>
      {esLuna && (
        <div style={{ width: 38, height: 38, flexShrink: 0, background: `${uiIcon('moon')} center/contain no-repeat` }} />
      )}
      <p style={{
        margin: 0, maxWidth: '76%', padding: '13px 17px', fontSize: 16, lineHeight: 1.45,
        fontFamily: NUNITO, fontWeight: 600, whiteSpace: 'pre-wrap',
        background: esLuna ? VIOLETA.burbuja : VIOLETA.carta,
        color: VIOLETA.ink,
        border: `2px solid ${esLuna ? VIOLETA.borde : VIOLETA.bordeCalido}`,
        borderRadius: 18,
        borderBottomLeftRadius: esLuna ? 6 : 18,
        borderBottomRightRadius: esLuna ? 18 : 6,
      }}>{content}</p>
    </div>
  );
}
