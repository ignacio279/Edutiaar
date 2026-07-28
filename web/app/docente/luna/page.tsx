'use client';
// LUNA — dashboard del copiloto de la docente: métricas del aula, alertas de
// rendimiento priorizadas (calculadas on-demand acá, lógica pura en
// web/lib/luna.ts), resumen y las dos acciones grandes (boletín / chat).
// Todas las queries van por el cliente con RLS (es_mi_alumno / docente_id):
// LUNA solo ve el aula de la docente autenticada (Regla 5).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { animal, uiIcon } from '@/lib/art';
import {
  alertasAula, metricasAula, resumenAula, periodoActual,
  type Alerta, type AlumnoLuna, type MetricasAula, type ResumenAula, type RespuestaLuna,
} from '@/lib/luna';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Chips por prioridad: alta violeta (señal amable, nunca rojo), media celeste,
// info verde. El rojo queda reservado para errores de verdad.
const CHIP: Record<'alta' | 'media' | 'info', [string, string, string]> = {
  alta: ['#EFEAF7', '#7A6A9E', 'Alta'],
  media: ['#E3EEF4', '#4E7E97', 'Media'],
  info: ['#E6F0DC', '#4E7A3A', 'Info'],
};

const card: React.CSSProperties = {
  background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 22,
  padding: '18px 20px', boxShadow: '0 3px 10px rgba(120,90,40,.06)',
};

type Vista = {
  nombre: string;
  alumnos: AlumnoLuna[];
  alertas: Alerta[];
  metricas: MetricasAula;
  resumen: ResumenAula;
  hayActividad: boolean;
};

export default function LunaDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('nombre,rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }

      const now = new Date();
      const desde21 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21).toISOString();
      const periodo = periodoActual(now);

      const { data: als } = await supabase
        .from('perfil').select('id, nombre, avatar, grado')
        .eq('rol', 'alumno').eq('docente_id', user.id).order('nombre');
      const alumnos = ((als as AlumnoLuna[]) || []);
      const ids = alumnos.map((a) => a.id);

      const [ses, resp, nodosAl, sols, bols] = await Promise.all([
        ids.length
          ? supabase.from('sesion').select('alumno_id, nodo_id, fecha, aciertos, total').in('alumno_id', ids).gte('fecha', desde21)
          : Promise.resolve({ data: [] }),
        supabase.from('respuesta')
          .select('correcta, created_at, sesion:sesion_id(alumno_id, nodo_id), ejercicio:ejercicio_id(tipo)')
          .gte('created_at', desde21),
        ids.length
          ? supabase.from('alumno_nodo').select('alumno_id, nodo_id, estado').in('alumno_id', ids)
          : Promise.resolve({ data: [] }),
        supabase.from('sol_materia').select('programa_id, estado, docente_id, programa:programa_id(grado)'),
        supabase.from('boletin').select('alumno_id, estado').eq('periodo', periodo.clave),
      ]);

      // respuesta viene con embeds → la aplanamos a la forma del lib. La RLS ya
      // la limita a los alumnos de esta docente (respuesta_select vía sesion).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const respuestas: RespuestaLuna[] = ((resp.data as any[]) || [])
        .filter((r) => r.sesion?.alumno_id)
        .map((r) => ({
          alumnoId: r.sesion.alumno_id, nodoId: r.sesion.nodo_id ?? '',
          tipo: r.ejercicio?.tipo ?? 'reconocer', correcta: !!r.correcta, createdAt: r.created_at,
        }));

      // Programas visibles (míos o publicados de mi escuela) → sus nodos, con el
      // grado para calcular cuántos nodos "le tocan" a cada alumno.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solsVisibles = ((sols.data as any[]) || []).filter((s) => s.estado === 'publicado' || s.docente_id === user.id);
      const gradoDePrograma = new Map<string, number>(solsVisibles.map((s) => [s.programa_id, s.programa?.grado ?? 0]));
      const progIds = [...gradoDePrograma.keys()];
      const { data: ns } = progIds.length
        ? await supabase.from('nodo').select('id, nombre, programa_id').in('programa_id', progIds)
        : { data: [] };
      const nodos = ((ns as { id: string; nombre: string; programa_id: string }[]) || []);
      const nodosEsperados = alumnos.reduce((acc, a) =>
        acc + nodos.filter((n) => gradoDePrograma.get(n.programa_id) === a.grado).length, 0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sesiones = ((ses.data as any[]) || []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodosAlumno = ((nodosAl.data as any[]) || []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boletines = ((bols.data as any[]) || []);

      const alertas = alertasAula(alumnos, sesiones, respuestas, nodosAlumno, nodos, now);
      setVista({
        nombre: (perfil as { nombre?: string } | null)?.nombre ?? '',
        alumnos,
        alertas,
        metricas: metricasAula(alumnos, sesiones, nodosAlumno, nodosEsperados, alertas, now),
        resumen: resumenAula(sesiones, respuestas, nodos, boletines, alumnos, now),
        hayActividad: sesiones.length > 0,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <DocenteSidebar activo="luna" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, background: `${uiIcon('moon')} center/contain no-repeat` }} />
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4vw,32px)', color: '#3A332A', margin: 0 }}>LUNA · Copiloto del aula</h1>
        </div>
        <p style={{ fontSize: 15.5, color: '#7A6F5F', margin: '0 0 22px', fontWeight: 600 }}>
          LUNA mira la actividad de toda tu aula y te propone; vos decidís.
        </p>

        {vista === null ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>
        ) : (
          <>
            {/* Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                [String(vista.metricas.activosSemana), `de ${vista.alumnos.length} alumnos activos esta semana`],
                [String(vista.metricas.ejerciciosSemana), 'ejercicios resueltos esta semana'],
                [`${vista.metricas.progresoPct}%`, 'del programa dominado'],
                [String(vista.metricas.alertasAbiertas), 'alertas abiertas'],
              ].map(([n, l]) => (
                <div key={l} style={{ ...card, padding: '16px 18px' }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 32, color: '#3A332A', lineHeight: 1.1 }}>{n}</div>
                  <div style={{ fontSize: 13.5, color: '#7A6F5F', fontWeight: 600, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Acciones principales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 22 }}>
              <button onClick={() => router.push('/docente/luna/boletin')} className="ed-primary" style={{ ...card, border: 'none', background: '#6FB7D4', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#fff' }}>Escribir boletín</div>
                <div style={{ fontSize: 14, color: '#EAF4F9', fontWeight: 600, marginTop: 4 }}>LUNA redacta un borrador con la evidencia del mes; vos lo revisás y aprobás.</div>
              </button>
              <button onClick={() => router.push('/docente/luna/chat')} className="ed-primary" style={{ ...card, border: 'none', background: '#7FB069', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#fff' }}>Consultar con LUNA · 24/7</div>
                <div style={{ fontSize: 14, color: '#EDF5E6', fontWeight: 600, marginTop: 4 }}>Planificación, estrategias y dudas pedagógicas con el contexto de tu aula.</div>
              </button>
            </div>

            {/* Alertas */}
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: '#3A332A', margin: '0 0 10px' }}>Alertas de rendimiento</h2>
            {!vista.hayActividad && vista.alertas.every((a) => a.tipo === 'sin_arrancar') ? (
              <div style={{ ...card, marginBottom: 22 }}>
                <p style={{ margin: 0, fontSize: 15, color: '#7A6F5F', fontWeight: 600, lineHeight: 1.5 }}>
                  Todavía no hay actividad en tu aula. Cuando los chicos empiecen a practicar con SOL, LUNA te va a mostrar señales acá.
                </p>
              </div>
            ) : vista.alertas.length === 0 ? (
              <div style={{ ...card, marginBottom: 22 }}>
                <p style={{ margin: 0, fontSize: 15, color: '#4E7A3A', fontWeight: 700 }}>Vienen todos bien. Sin señales para atender hoy.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                {vista.alertas.map((a, i) => {
                  const [bg, co, label] = CHIP[a.prioridad];
                  return (
                    <div key={`${a.alumnoId}-${a.tipo}-${i}`} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start', borderColor: a.positiva ? '#D9E8CB' : '#EFE3CE' }}>
                      <div style={{ width: 46, height: 46, flexShrink: 0, background: `${animal(a.avatar)} center/contain no-repeat` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: '#3A332A' }}>{a.alumnoNombre}</span>
                          <span style={{ fontSize: 13, color: '#7A6F5F', fontWeight: 700 }}>{a.grado}° grado</span>
                          <span style={{ background: bg, color: co, padding: '3px 11px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 12 }}>{a.positiva ? 'Va bien' : label}</span>
                        </div>
                        <p style={{ margin: '5px 0 2px', fontSize: 14.5, color: '#3A332A', fontWeight: 600, fontFamily: NUNITO }}>{a.detalle}</p>
                        <p style={{ margin: 0, fontSize: 13.5, color: '#7A6F5F', fontWeight: 600, fontFamily: NUNITO }}>Sugerencia: {a.sugerencia}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen del aula */}
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: '#3A332A', margin: '0 0 10px' }}>Resumen del aula</h2>
            <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {[
                ['Tema más trabajado', vista.resumen.temaMasTrabajado ?? 'Sin datos todavía'],
                ['Tema que más cuesta', vista.resumen.temaMasDificil ?? 'Sin datos todavía'],
                ['Boletines pendientes', vista.alumnos.length ? `${vista.resumen.boletinesPendientes} de ${vista.alumnos.length} este mes` : 'Sin alumnos todavía'],
                ['Próximo hito', vista.resumen.hito ?? '—'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 12.5, color: '#9A8E78', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>{l}</div>
                  <div style={{ fontSize: 15.5, color: '#3A332A', fontWeight: 700, fontFamily: NUNITO, marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
