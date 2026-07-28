'use client';
// LUNA — chat 24/7 de la docente. Espejo del chat de practicar (alumno), pero:
// el hilo se PERSISTE en luna_mensaje (lo escribe la Edge Function luna-chat;
// acá solo se lee por RLS), hay "Limpiar conversación" (delete RLS) y las
// alertas calculadas en el cliente viajan como contexto del mensaje. El fetch
// es manual con JWT (patrón autoría) para poder leer códigos de error y dar
// copy específico (tope diario, etc.).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { toast } from '@/lib/toast';
import { fetchConTimeout } from '@/lib/edge';
import { uiIcon } from '@/lib/art';
import { alertasAula, mensajeErrorLuna, type RespuestaLuna } from '@/lib/luna';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

const BIENVENIDA = 'Hola, soy LUNA 🌙 Te puedo ayudar a planificar clases (incluso plurigrado), leer las señales de tu aula o pensar cómo acompañar a un alumno. ¿Por dónde empezamos?';

type Msg = { role: 'user' | 'luna'; content: string };
type AlertaPayload = { alumno: string; prioridad: string; detalle: string };

export default function ChatLuna() {
  const router = useRouter();
  const supabase = createClient();

  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [alertas, setAlertas] = useState<AlertaPayload[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }

      const now = new Date();
      const desde21 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21).toISOString();
      const { data: als } = await supabase.from('perfil')
        .select('id, nombre, avatar, grado').eq('rol', 'alumno').eq('docente_id', user.id);
      const alumnos = ((als as { id: string; nombre: string; avatar: string | null; grado: number | null }[]) || []);
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
  }, []);

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
        body: JSON.stringify({ mensaje: t, alertas }),
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
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <DocenteSidebar activo="luna" />

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ padding: 'clamp(18px,3vw,28px) clamp(22px,3.5vw,40px) 12px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 30, height: 30, background: `${uiIcon('moon')} center/contain no-repeat` }} />
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(20px,3vw,26px)', color: '#3A332A', margin: 0, flex: 1 }}>
            Consultar con LUNA · disponible 24/7
          </h1>
          <button onClick={limpiar} style={{ background: '#FFFCF5', color: '#7A6F5F', border: '1.5px solid #EFE3CE', borderRadius: 10, padding: '8px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Limpiar conversación
          </button>
        </div>

        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '10px clamp(22px,3.5vw,40px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs === null ? (
              <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>
            ) : (
              <>
                {vacio && <Burbuja role="luna" content={BIENVENIDA} />}
                {msgs.map((m, i) => <Burbuja key={i} role={m.role} content={m.content} />)}
                {enviando && (
                  <p style={{ margin: '2px 0 0 52px', fontSize: 13.5, color: '#9A8E78', fontWeight: 700 }}>LUNA está pensando…</p>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ padding: '12px clamp(22px,3.5vw,40px) clamp(18px,3vw,26px)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10 }}>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
              placeholder="Preguntale a LUNA: «armame la clase de mañana», «¿cómo ayudo a Benja con las vocales?»…"
              disabled={enviando || msgs === null}
              style={{ flex: 1, padding: '13px 16px', border: '2px solid #EFE3CE', borderRadius: 14, fontFamily: NUNITO, fontSize: 15, color: '#3A332A', background: '#FFFCF5', outline: 'none' }}
            />
            <button
              onClick={enviar}
              disabled={enviando || !texto.trim() || msgs === null}
              className="ed-primary"
              style={{
                background: '#7FB069', color: '#fff', border: 'none', borderRadius: 14, padding: '0 22px',
                fontFamily: QUICK, fontWeight: 700, fontSize: 15,
                cursor: enviando || !texto.trim() ? 'default' : 'pointer',
                opacity: enviando || !texto.trim() ? 0.6 : 1,
              }}
            >
              {enviando ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Burbuja({ role, content }: { role: 'user' | 'luna'; content: string }) {
  const esLuna = role === 'luna';
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: esLuna ? 'flex-start' : 'flex-end', animation: 'edIn .25s ease' }}>
      {esLuna && (
        <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 999, background: '#EFEAF7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 22, height: 22, background: `${uiIcon('moon')} center/contain no-repeat` }} />
        </div>
      )}
      <p style={{
        margin: 0, maxWidth: '80%', padding: '11px 15px', fontSize: 15, lineHeight: 1.5,
        fontFamily: NUNITO, fontWeight: 500, whiteSpace: 'pre-wrap',
        background: esLuna ? '#FFFCF5' : '#6FB7D4',
        color: esLuna ? '#3A332A' : '#fff',
        border: esLuna ? '2px solid #EFE3CE' : 'none',
        borderRadius: 18,
        borderBottomLeftRadius: esLuna ? 6 : 18,
        borderBottomRightRadius: esLuna ? 18 : 6,
        boxShadow: esLuna ? 'none' : '0 6px 14px rgba(111,183,212,.3)',
      }}>{content}</p>
    </div>
  );
}
