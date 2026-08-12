'use client';
// Pases (alumno golondrina, ADR-011): la seño genera el link para la familia
// cuando un chico se muda, ve el estado de los pases que pidió, y recibe a los
// que llegan de otra escuela.
//
// El chico transferido llega SIN aula ni PIN (matricula_abrir lo deja "para
// activar"): recién cuando la seño lo suma a un aula vuelve a poder entrar.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { toast } from '@/lib/toast';
import { copyEstado, copyVencimiento, msgErrTransferencia } from '@/lib/transferencias';
import { postFn } from '@/lib/edge';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

const supabase = createClient();

type Alumno = { id: string; nombre: string };
type Aula = { id: string; nombre: string; grado: number | null };
// COLS_LISTADO de la fn: los nombres vienen anidados (alumno/origen/destino).
type Pase = {
  id: string; estado: string; expira_at: string;
  alumno?: { nombre: string } | null;
  origen?: { nombre: string } | null;
  destino?: { nombre: string } | null;
};
type Llegada = { alumno_id: string; matricula_id: string; nombre: string; avatar: string | null };
type Colegio = { id: string; nombre: string };

async function gestion(accion: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  // postFn no lanza: sin conexión devuelve `sin_conexion` y la pantalla avisa,
  // en vez de tirarle un error de runtime a la maestra.
  const r = await postFn('gestion-transferencias', { accion, ...payload }, { token: session?.access_token });
  return { ok: r.ok, j: r.data as { error?: string; [k: string]: unknown } };
}

export default function Pases() {
  const router = useRouter();
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [colegios, setColegios] = useState<Colegio[]>([]);
  const [pases, setPases] = useState<Pase[]>([]);
  const [llegadas, setLlegadas] = useState<Llegada[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Alta de pase
  const [alumnoSel, setAlumnoSel] = useState('');
  const [destinoSel, setDestinoSel] = useState('');
  const [link, setLink] = useState<string | null>(null);

  // Activación de un chico que llegó
  const [activando, setActivando] = useState<Llegada | null>(null);
  const [aulaSel, setAulaSel] = useState('');
  const [grado, setGrado] = useState('');
  const [pin, setPin] = useState('');

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data: perfil } = await supabase.from('perfil').select('rol, escuela_id').eq('id', user.id).single();
    if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }
    const miEscuela = (perfil as { escuela_id?: string } | null)?.escuela_id ?? '';

    const [{ data: al }, { data: au }, { data: esc }] = await Promise.all([
      supabase.from('perfil').select('id, nombre').eq('docente_id', user.id).eq('rol', 'alumno').order('nombre'),
      supabase.from('aula').select('id, nombre, grado').eq('docente_id', user.id).order('nombre'),
      // Vista pública mínima de 0018 (no expone estado ni contacto).
      supabase.from('escuela_publica').select('id, nombre').order('nombre'),
    ]);
    setAlumnos((al ?? []) as Alumno[]);
    setAulas((au ?? []) as Aula[]);
    setColegios(((esc ?? []) as Colegio[]).filter((e) => e.id !== miEscuela));

    const [p, l] = await Promise.all([gestion('propias'), gestion('llegadas')]);
    if (p.ok) setPases((p.j.transferencias ?? []) as Pase[]);
    if (l.ok) setLlegadas((l.j.llegadas ?? []) as Llegada[]);
    setLoaded(true);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function generarPase() {
    if (!alumnoSel || !destinoSel) { toast('Elegí el chico y el colegio nuevo.'); return; }
    const { ok, j } = await gestion('solicitar', { alumno_id: alumnoSel, escuela_destino_id: destinoSel });
    if (!ok) { toast(msgErrTransferencia(j)); return; }
    const relativo = String(j.link ?? '');
    setLink(relativo.startsWith('http') ? relativo : `${window.location.origin}${relativo}`);
    setAlumnoSel(''); setDestinoSel('');
    toast('Pase generado. Copiá el link y mandáselo a la familia.');
    cargar();
  }

  async function activar() {
    if (!activando) return;
    const g = Number(grado);
    if (!aulaSel || !(g >= 1 && g <= 7) || !/^\d{4}$/.test(pin)) {
      toast('Elegí el aula, el grado (1 a 7) y un PIN de 4 dígitos.'); return;
    }
    const { ok, j } = await gestion('activar_alumno_transferido', {
      alumno_id: activando.alumno_id, aula_id: aulaSel, grado: Number(grado), pin,
    });
    if (!ok) { toast(msgErrTransferencia(j)); return; }
    toast(`¡${activando.nombre} ya está en tu clase!`);
    setActivando(null); setAulaSel(''); setGrado(''); setPin('');
    cargar();
  }

  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: 20, marginBottom: 18,
    boxShadow: '0 4px 16px rgba(90,70,50,.08)',
  };
  const h2: React.CSSProperties = { fontFamily: BALOO, fontSize: 21, color: '#4A3B2A', margin: '0 0 4px' };
  const sub: React.CSSProperties = { fontSize: 14, color: '#7A6A58', margin: '0 0 14px' };
  const input: React.CSSProperties = {
    fontSize: 15, padding: '10px 12px', borderRadius: 10, border: '2px solid #E4D5BE',
    fontFamily: QUICK, background: '#fff', minWidth: 170,
  };
  const btn = (bg: string): React.CSSProperties => ({
    fontFamily: BALOO, fontSize: 15, padding: '10px 16px', borderRadius: 12,
    border: 'none', background: bg, color: '#fff', cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FDF6E9', fontFamily: QUICK }}>
      <DocenteSidebar activo="transferencias" />
      <main style={{ flex: 1, padding: '28px 26px', maxWidth: 860 }}>
        <h1 style={{ fontFamily: BALOO, fontSize: 28, color: '#4A3B2A', margin: '0 0 4px' }}>Pases</h1>
        <p style={{ ...sub, fontSize: 15 }}>
          Cuando un chico se muda, su recorrido viaja con él. Generá el pase y la familia lo autoriza
          desde el celular.
        </p>

        {/* ── Generar un pase ─────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Generar un pase</h2>
          <p style={sub}>El link vale 14 días y se usa una sola vez.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={input} value={alumnoSel} onChange={(e) => setAlumnoSel(e.target.value)}>
              <option value="">¿Quién se muda?</option>
              {alumnos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <select style={input} value={destinoSel} onChange={(e) => setDestinoSel(e.target.value)}>
              <option value="">¿A qué colegio va?</option>
              {colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button style={btn('#7FB069')} onClick={generarPase}>Generar</button>
          </div>
          {link ? (
            <div style={{ marginTop: 14, padding: 12, background: '#FDF6E9', borderRadius: 12 }}>
              <p style={{ ...sub, margin: '0 0 8px' }}>
                Copiá este link y mandáselo a la familia. <strong>No lo vas a poder ver de nuevo.</strong>
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: 12, wordBreak: 'break-all', flex: 1, minWidth: 220 }}>{link}</code>
                <button
                  style={btn('#6A8CAF')}
                  onClick={() => { navigator.clipboard?.writeText(link); toast('Link copiado.'); }}
                >Copiar</button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Llegadas ────────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Llegadas</h2>
          <p style={sub}>Chicos que llegaron de otra escuela y esperan que los sumes a un aula.</p>
          {!loaded ? <p style={sub}>Cargando…</p>
            : llegadas.length === 0 ? <p style={sub}>Por ahora no hay nadie esperando.</p>
              : llegadas.map((l) => (
                <div key={l.alumno_id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #F0E6D6' }}>
                  <span style={{ flex: 1, fontSize: 16, color: '#4A3B2A' }}>{l.nombre}</span>
                  <button style={btn('#7FB069')} onClick={() => { setActivando(l); setAulaSel(aulas[0]?.id ?? ''); }}>
                    Sumar a mi clase
                  </button>
                </div>
              ))}

          {activando ? (
            <div style={{ marginTop: 14, padding: 14, background: '#FDF6E9', borderRadius: 12 }}>
              <p style={{ ...sub, margin: '0 0 10px' }}>
                {activando.nombre} entra con un código nuevo: el del aula vieja ya no sirve.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select style={input} value={aulaSel} onChange={(e) => setAulaSel(e.target.value)}>
                  <option value="">Aula</option>
                  {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                <input
                  style={{ ...input, minWidth: 90 }} value={grado} placeholder="Grado"
                  onChange={(e) => setGrado(e.target.value.replace(/\D/g, '').slice(0, 1))}
                />
                <input
                  style={{ ...input, minWidth: 110 }} value={pin} placeholder="PIN (4 dígitos)"
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
                <button style={btn('#7FB069')} onClick={activar}>Listo</button>
                <button style={{ ...btn('#E4D5BE'), color: '#4A3B2A' }} onClick={() => setActivando(null)}>Cancelar</button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Mis pases ───────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Mis pases</h2>
          <p style={sub}>Los que pediste, y cómo van.</p>
          {!loaded ? <p style={sub}>Cargando…</p>
            : pases.length === 0 ? <p style={sub}>Todavía no generaste ninguno.</p>
              : pases.map((p) => {
                const e = copyEstado(p.estado);
                return (
                  <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #F0E6D6', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 15, color: '#4A3B2A' }}>
                      {p.alumno?.nombre ?? 'Alumno'} → {p.destino?.nombre ?? 'otro colegio'}
                    </span>
                    <span style={{ fontSize: 13, color: '#7A6A58' }}>{copyVencimiento(p.expira_at, new Date())}</span>
                    <span style={{
                      fontSize: 13, color: '#fff', background: e.color,
                      padding: '4px 10px', borderRadius: 999,
                    }}>{e.copy}</span>
                  </div>
                );
              })}
        </section>
      </main>
    </div>
  );
}
