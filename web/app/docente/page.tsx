'use client';
// Panel docente (portado de scHomeDocente + loadMeAndRoute para docente).
// Carga el perfil y el listado de SUS alumnos (RLS los filtra; igual filtramos por
// docente_id como cinturón-y-tiradores). Para cada alumno trae, en 2 queries
// batcheadas, el estado de sus nodos y sus sesiones recientes → etiqueta "a quién
// atender" + actividad del día (Etapa 4). La protección de "no logueado" la hace
// el proxy; acá redirigimos si el rol no corresponde.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal, sol } from '@/lib/art';
import { estadoColor } from '@/lib/mapa-layout';
import {
  etiquetaEstado,
  prioridadAlumno,
  resumenHoy,
  ultimaSesion,
  haceCuanto,
  type EstadoNodo,
} from '@/lib/panel';

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

export default function PanelDocente() {
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Perfil | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoVista[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }
      const { data: perfil } = await supabase
        .from('perfil')
        .select('nombre,rol')
        .eq('id', user.id)
        .single();
      if ((perfil as Perfil | null)?.rol === 'alumno') {
        router.replace('/alumno');
        return;
      }
      setMe(perfil as Perfil);

      const { data: list } = await supabase
        .from('perfil')
        .select('id,nombre,avatar,grado')
        .eq('rol', 'alumno')
        .eq('docente_id', user.id)
        .order('nombre');
      const base = (list as Alumno[]) || [];
      const ids = base.map((a) => a.id);

      // 2 queries batcheadas (no una por alumno): estados de nodo + sesiones recientes.
      const [{ data: nodoRows }, { data: sesRows }] = ids.length
        ? await Promise.all([
            supabase.from('alumno_nodo').select('alumno_id, estado').in('alumno_id', ids),
            supabase
              .from('sesion')
              .select('alumno_id, fecha, aciertos, total')
              .in('alumno_id', ids)
              .order('fecha', { ascending: false })
              .limit(300),
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
    return a.ultima ? `sin práctica hoy · última ${haceCuanto(a.ultima, new Date())}` : 'sin práctica todavía';
  }

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(28px,5vw,52px) 22px', animation: 'edFade .3s ease' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 54, height: 54, background: solHappy }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(26px,4.5vw,34px)', color: '#3A332A', margin: 0 }}>
              Hola, seño {me?.nombre || ''}
            </h1>
            <p style={{ fontSize: 15, color: '#7A6F5F', margin: '3px 0 0', fontWeight: 600 }}>
              Estos son tus alumnos
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push('/docente/autoria')}
          className="ed-primary"
          style={{
            marginTop: 18,
            background: '#6FB7D4',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            padding: '12px 22px',
            fontFamily: QUICK,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(111,183,212,.3)',
          }}
        >
          + Subir un plan
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
          {alumnos.length ? (
            alumnos.map((a) => (
              <button
                key={a.id}
                onClick={() => router.push(`/docente/${a.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  background: '#FFFCF5',
                  border: '1.5px solid #EFE3CE',
                  borderRadius: 18,
                  padding: '13px 18px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div style={{ width: 48, height: 48, flexShrink: 0, background: `${animal(a.avatar)} center/contain no-repeat` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: '#3A332A' }}>{a.nombre}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        background: '#FBF4E6',
                        border: '1px solid #EFE3CE',
                        borderRadius: 999,
                        padding: '2px 9px',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: '#5C5345',
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: estadoColor(a.estado), flexShrink: 0 }} />
                      {a.etiqueta}
                    </span>
                    <span style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 600 }}>{actividadTexto(a)}</span>
                  </div>
                </div>
                <span style={{ color: '#C9BCA6', fontSize: 22, fontWeight: 700 }}>›</span>
              </button>
            ))
          ) : (
            <p style={{ color: '#7A6F5F', fontWeight: 600 }}>
              {loaded ? 'Todavía no tenés alumnos.' : 'Cargando…'}
            </p>
          )}
        </div>

        <button
          onClick={signOut}
          className="ed-signout"
          style={{
            marginTop: 26,
            background: '#FFFCF5',
            color: '#7A6F5F',
            border: '2px solid #EFE3CE',
            borderRadius: 999,
            padding: '12px 28px',
            fontFamily: QUICK,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
