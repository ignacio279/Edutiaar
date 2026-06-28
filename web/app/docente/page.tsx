'use client';
// Panel docente (diseño Edutia / Etapa 4): barra lateral (EDUTIA + Mis alumnos +
// Cerrar sesión) y, a la derecha, el saludo, un banner de SOL con el resumen del
// día, y la lista de alumnos (avatar + actividad de hoy + etiqueta "a quién
// atender" + chevron). En 2 queries batcheadas trae estados de nodo + sesiones
// recientes; el orden y las etiquetas salen de panel.ts (lógica pura).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal, sol, uiIcon } from '@/lib/art';
import { estadoColor } from '@/lib/mapa-layout';
import {
  etiquetaEstado,
  prioridadAlumno,
  resumenHoy,
  ultimaSesion,
  haceCuanto,
  type EstadoNodo,
} from '@/lib/panel';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const solHappy = `${sol('happy')} center/contain no-repeat`;

type Perfil = { nombre: string; rol: string };
type Alumno = { id: string; nombre: string; avatar: string; grado: number };
type AlumnoVista = Alumno & {
  estado: EstadoNodo;
  etiqueta: string;
  hoy: { cantidad: number; aciertos: number; total: number };
  ultima: Date | null;
};

// Colores de etiqueta por estado (tinte suave + texto), tono del diseño.
const TAG: Record<EstadoNodo, [string, string]> = {
  dominado: ['#E6F0DC', '#4E7A3A'],
  en_construccion: ['#FBEBD6', '#B9722A'],
  a_reforzar: ['#F7E2DD', '#BB4F3F'],
  no_empezado: ['#EDE6D6', '#8A7D63'],
};

function fechaHoy(): string {
  try {
    const f = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return f.charAt(0).toUpperCase() + f.slice(1);
  } catch {
    return '';
  }
}

export default function PanelDocente() {
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Perfil | null>(null);
  const [grado, setGrado] = useState<number | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoVista[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('nombre,rol').eq('id', user.id).single();
      if ((perfil as Perfil | null)?.rol === 'alumno') { router.replace('/alumno'); return; }
      setMe(perfil as Perfil);

      const { data: list } = await supabase
        .from('perfil')
        .select('id,nombre,avatar,grado')
        .eq('rol', 'alumno')
        .eq('docente_id', user.id)
        .order('nombre');
      const base = (list as Alumno[]) || [];
      setGrado(base[0]?.grado ?? null);
      const ids = base.map((a) => a.id);

      const [{ data: nodoRows }, { data: sesRows }] = ids.length
        ? await Promise.all([
            supabase.from('alumno_nodo').select('alumno_id, estado').in('alumno_id', ids),
            supabase.from('sesion').select('alumno_id, fecha, aciertos, total').in('alumno_id', ids).order('fecha', { ascending: false }).limit(300),
          ])
        : [{ data: [] }, { data: [] }];

      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodos = (nodoRows as any[]) || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sesiones = (sesRows as any[]) || [];

      const vistas: AlumnoVista[] = base.map((a) => {
        const misNodos = nodos.filter((n) => n.alumno_id === a.id);
        const misSes = sesiones.filter((s) => s.alumno_id === a.id);
        const { estado, label } = etiquetaEstado(misNodos);
        return { ...a, estado, etiqueta: label, hoy: resumenHoy(misSes, now), ultima: ultimaSesion(misSes) };
      });
      vistas.sort((x, y) => {
        const px = prioridadAlumno({ estado: x.estado, practicoHoy: x.hoy.cantidad > 0 });
        const py = prioridadAlumno({ estado: y.estado, practicoHoy: y.hoy.cantidad > 0 });
        return px === py ? x.nombre.localeCompare(y.nombre) : px - py;
      });

      setAlumnos(vistas);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  function actividadTexto(a: AlumnoVista): string {
    if (a.hoy.cantidad > 0) {
      const s = `${a.hoy.cantidad} ${a.hoy.cantidad === 1 ? 'sesión' : 'sesiones'} hoy`;
      return a.hoy.total > 0 ? `${s} · ${a.hoy.aciertos}/${a.hoy.total}` : s;
    }
    return a.ultima ? `Sin práctica hoy · última ${haceCuanto(a.ultima, new Date())}` : 'Sin actividad todavía';
  }

  const practicaron = alumnos.filter((a) => a.hoy.cantidad > 0).length;
  const acompañar = alumnos.filter((a) => a.estado === 'a_reforzar').length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <aside style={{ width: 236, flexShrink: 0, background: '#FFFCF5', borderRight: '2px solid #EFE3CE', padding: '26px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 22px' }}>
          <div style={{ width: 36, height: 36, background: solHappy }} />
          <span style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 22, color: '#3A332A', letterSpacing: '-.5px' }}>EDUTIA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14, background: '#E3EEF4', color: '#3A332A', fontFamily: QUICK, fontWeight: 700, fontSize: 16 }}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('people')} center/contain no-repeat` }} />Mis alumnos
        </div>
        <button onClick={() => router.push('/docente/alumnos')} className="ed-side" style={sideBtn}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('people')} center/contain no-repeat` }} />Mi clase
        </button>
        <button onClick={() => router.push('/docente/autoria')} className="ed-side" style={sideBtn}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('mapI')} center/contain no-repeat` }} />Subir un plan
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={signOut} className="ed-side" style={sideBtn}>Cerrar sesión</button>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(26px,4vw,36px)', color: '#3A332A', margin: 0 }}>Hola, seño {me?.nombre || ''}</h1>
            <p style={{ fontSize: 16, color: '#7A6F5F', margin: '5px 0 0', fontWeight: 600 }}>{grado ? `${grado}° grado · ` : ''}{fechaHoy()}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#FBEFD9', border: '1.5px solid #F4D9A6', borderRadius: 22, padding: '18px 24px', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, flexShrink: 0, background: solHappy }} />
          <div>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#3A332A' }}>
              {loaded ? `Hoy practicaron ${practicaron} de ${alumnos.length} ${alumnos.length === 1 ? 'alumno' : 'alumnos'}.` : 'Cargando el día…'}
            </div>
            <div style={{ fontSize: 15, color: '#7A6F5F', fontWeight: 600 }}>
              {acompañar > 0 ? `Hay ${acompañar} ${acompañar === 1 ? 'alumno' : 'alumnos'} para acompañar. ` : 'Vienen todos bien. '}Tocá una fila para ver el detalle.
            </div>
          </div>
        </div>

        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#7A6F5F', margin: '0 0 14px' }}>Tus alumnos</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alumnos.length ? (
            alumnos.map((a) => {
              const [bg, co] = TAG[a.estado] ?? TAG.no_empezado;
              return (
                <button
                  key={a.id}
                  onClick={() => router.push(`/docente/${a.id}`)}
                  className="ed-roster-row"
                  style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 18, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 3px 10px rgba(120,90,40,.06)' }}
                >
                  <div style={{ width: 54, height: 54, flexShrink: 0, background: `${animal(a.avatar)} center/contain no-repeat` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A' }}>{a.nombre}</div>
                    <div style={{ fontSize: 14.5, color: '#7A6F5F', fontWeight: 600 }}>{actividadTexto(a)}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, color: co, padding: '7px 14px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: estadoColor(a.estado), flexShrink: 0 }} />
                    {a.etiqueta}
                  </span>
                  <span style={{ width: 18, height: 18, opacity: 0.5, flexShrink: 0, background: `${uiIcon('chevron')} center/contain no-repeat` }} />
                </button>
              );
            })
          ) : (
            <p style={{ color: '#7A6F5F', fontWeight: 600 }}>{loaded ? 'Todavía no tenés alumnos.' : 'Cargando…'}</p>
          )}
        </div>
      </main>
    </div>
  );
}

const sideBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14,
  background: 'none', border: 'none', color: '#7A6F5F', fontFamily: QUICK, fontWeight: 700,
  fontSize: 16, cursor: 'pointer', textAlign: 'left',
};
