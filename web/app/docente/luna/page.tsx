'use client';
// LUNA — dashboard del copiloto de la docente, POR AULA: al entrar sin
// `?aula=` se elige el aula (con una sola, auto-selección) y las métricas,
// alertas de rendimiento priorizadas (calculadas on-demand acá, lógica pura en
// web/lib/luna.ts), el resumen y las dos acciones grandes (boletín / chat)
// quedan acotados a esa aula. Todas las queries van por el cliente con RLS
// (es_mi_alumno / docente_id): LUNA solo ve lo de la docente autenticada
// (Regla 5).
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { animal, uiIcon } from '@/lib/art';
import {
  alertasAula, metricasAula, resumenAula, periodoActual,
  type Alerta, type AlumnoLuna, type MetricasAula, type ResumenAula, type RespuestaLuna,
} from '@/lib/luna';
import { enAula, linkLuna, puedeCambiarAula, resolverAula, type AulaLite } from '@/lib/luna-aula';
import { VIOLETA } from '@/lib/luna-tema';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Chips por prioridad: alta violeta (señal amable, nunca rojo), media celeste,
// info verde. El rojo queda reservado para errores de verdad. Media e info
// conservan su semántica: el violeta es el marco de la sección, no una señal.
const CHIP: Record<'alta' | 'media' | 'info', [string, string, string]> = {
  alta: [VIOLETA.claro, VIOLETA.medio, 'Alta'],
  media: ['#E3EEF4', '#4E7E97', 'Media'],
  info: ['#E6F0DC', '#4E7A3A', 'Info'],
};

// Tarjeta informativa cálida del diseño (stats, alertas, resumen, avisos):
// borde neutro cálido y sombra cálida. Las tarjetas seleccionables (aulas)
// llevan borde violeta 2px y los CTAs su violeta pleno, inline más abajo.
const cardInfo: React.CSSProperties = {
  background: VIOLETA.carta, border: `1.5px solid ${VIOLETA.bordeCalido}`, borderRadius: 18,
  padding: '16px 18px', boxShadow: `0 3px 10px ${VIOLETA.sombraCalida}`,
};

type Vista = {
  alumnos: AlumnoLuna[];
  alertas: Alerta[];
  metricas: MetricasAula;
  resumen: ResumenAula;
  hayActividad: boolean;
};

type AlumnoConAula = AlumnoLuna & { aula_id: string | null };

// Tres modos: cargando, selector de aula (sin `?aula=` y 2+ aulas) o el
// dashboard del aula activa.
type Estado =
  | { modo: 'cargando' }
  | { modo: 'selector'; aulas: (AulaLite & { cantidad: number })[] }
  | { modo: 'aula'; aula: AulaLite; cambiable: boolean; vista: Vista };

function LunaDashboard({ aulaParam }: { aulaParam: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [estado, setEstado] = useState<Estado>({ modo: 'cargando' });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('nombre,rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }

      const now = new Date();
      const desde21 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21).toISOString();
      const periodo = periodoActual(now);

      // Aulas de la docente + todos sus alumnos (con aula_id para acotar).
      const [aulasR, alsR] = await Promise.all([
        supabase.from('aula').select('id, nombre, codigo').eq('docente_id', user.id).order('nombre'),
        supabase.from('perfil').select('id, nombre, avatar, grado, aula_id')
          .eq('rol', 'alumno').eq('docente_id', user.id).order('nombre'),
      ]);
      const aulas = ((aulasR.data as AulaLite[]) || []);
      const todos = ((alsR.data as AlumnoConAula[]) || []);

      const res = resolverAula(aulaParam, aulas);
      if (res.modo === 'selector') {
        setEstado({ modo: 'selector', aulas: aulas.map((a) => ({ ...a, cantidad: enAula(todos, a.id).length })) });
        return;
      }

      // Todo lo que sigue queda acotado a los alumnos del aula activa.
      const alumnos: AlumnoLuna[] = enAula(todos, res.aula.id);
      const ids = alumnos.map((a) => a.id);
      const idsAula = new Set(ids);

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
      // la limita a los alumnos de esta docente (respuesta_select vía sesion);
      // acá además la acotamos al aula activa.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const respuestas: RespuestaLuna[] = ((resp.data as any[]) || [])
        .filter((r) => r.sesion?.alumno_id && idsAula.has(r.sesion.alumno_id))
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
      setEstado({
        modo: 'aula',
        aula: res.aula,
        cambiable: puedeCambiarAula(aulas),
        vista: {
          alumnos,
          alertas,
          metricas: metricasAula(alumnos, sesiones, nodosAlumno, nodosEsperados, alertas, now),
          resumen: resumenAula(sesiones, respuestas, nodos, boletines, alumnos, now),
          hayActividad: sesiones.length > 0,
        },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aulaParam]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: VIOLETA.suave, animation: 'edFade .3s ease' }}>
      {/* Hovers exactos del diseño, locales a esta página (globals.css es
          compartido y no se toca; los keyframes edFade/edBob ya viven ahí). */}
      <style>{`
        .ed-luna-aula { transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
        .ed-luna-aula:hover { transform: translateY(-3px); box-shadow: 0 12px 24px rgba(94,84,144,.16); border-color: ${VIOLETA.base}; }
        .ed-luna-cta { transition: transform .14s ease, filter .14s ease; }
        .ed-luna-cta:hover { transform: translateY(-3px); }
        .ed-luna-cta--base:hover { filter: brightness(1.04); }
        .ed-luna-cta--oscuro:hover { filter: brightness(1.06); }
        .ed-luna-cambiar { transition: border-color .15s ease, color .15s ease; }
        .ed-luna-cambiar:hover { border-color: ${VIOLETA.base}; color: ${VIOLETA.oscuro}; }
      `}</style>
      <DocenteSidebar activo="luna" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 76, height: 76, flexShrink: 0, background: `${uiIcon('moon')} center/contain no-repeat`, animation: 'edBob 5s ease-in-out infinite' }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(26px,4vw,34px)', color: VIOLETA.ink, margin: 0 }}>LUNA · Copiloto del aula</h1>
            <p style={{ fontFamily: NUNITO, fontSize: 16, color: VIOLETA.tinta2, margin: '5px 0 0', fontWeight: 600 }}>
              LUNA mira la actividad de toda tu aula y te propone; vos decidís.
            </p>
          </div>
        </div>

        {estado.modo === 'cargando' ? (
          <p style={{ fontFamily: NUNITO, color: VIOLETA.tinta2, fontWeight: 600, marginTop: 22 }}>Cargando…</p>
        ) : estado.modo === 'selector' ? (
          <>
            {/* Selector de aula: se muestra cuando hay 2+ aulas y no vino ?aula= */}
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: VIOLETA.oscuro, margin: '32px 0 14px' }}>Elegí el aula</h2>
            {estado.aulas.length === 0 ? (
              <div style={cardInfo}>
                <p style={{ margin: 0, fontFamily: NUNITO, fontSize: 15, color: VIOLETA.tinta2, fontWeight: 600, lineHeight: 1.5 }}>
                  Todavía no tenés aulas. Armá tu aula desde «Mi clase» y después volvé por acá.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, maxWidth: 720 }}>
                {estado.aulas.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => router.push(linkLuna('/docente/luna', a.id))}
                    className="ed-luna-aula"
                    style={{
                      textAlign: 'left', background: VIOLETA.carta, border: `2px solid ${VIOLETA.borde}`,
                      borderRadius: 22, padding: '22px 24px', cursor: 'pointer', boxShadow: `0 4px 14px ${VIOLETA.sombra}`,
                    }}
                  >
                    <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 22, color: VIOLETA.ink }}>{a.nombre}</div>
                    <div style={{ fontFamily: NUNITO, fontSize: 14.5, color: VIOLETA.tinta2, fontWeight: 600, marginTop: 4 }}>
                      {a.codigo} · {a.cantidad} {a.cantidad === 1 ? 'alumno' : 'alumnos'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Aula activa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
              <span style={{ background: VIOLETA.claro, border: `1.5px solid ${VIOLETA.borde}`, borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: VIOLETA.oscuro }}>
                Aula: {estado.aula.nombre} · {estado.aula.codigo}
              </span>
              {estado.cambiable && (
                <button onClick={() => router.push('/docente/luna')} className="ed-luna-cambiar" style={{ background: VIOLETA.carta, border: `1.5px solid ${VIOLETA.bordeCalido}`, borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: VIOLETA.tinta2, cursor: 'pointer' }}>
                  Cambiar de aula
                </button>
              )}
            </div>

            {/* Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 20 }}>
              {[
                [String(estado.vista.metricas.activosSemana), `de ${estado.vista.alumnos.length} alumnos activos esta semana`],
                [String(estado.vista.metricas.ejerciciosSemana), 'ejercicios resueltos esta semana'],
                [`${estado.vista.metricas.progresoPct}%`, 'del programa dominado'],
                [String(estado.vista.metricas.alertasAbiertas), 'alertas abiertas'],
              ].map(([n, l]) => (
                <div key={l} style={{ ...cardInfo, borderRadius: 20, padding: '18px 20px' }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 28, color: VIOLETA.oscuro, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: VIOLETA.tinta2, fontWeight: 600, marginTop: 7, lineHeight: 1.3 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Acciones principales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
              <button onClick={() => router.push(linkLuna('/docente/luna/boletin', estado.aula.id))} className="ed-luna-cta ed-luna-cta--base" style={{ textAlign: 'left', background: VIOLETA.base, border: 'none', borderRadius: 22, padding: '22px 24px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(139,126,200,.32)' }}>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: '#fff' }}>Escribir boletín</div>
                <div style={{ fontFamily: NUNITO, fontSize: 14.5, color: VIOLETA.textoSobreBase, fontWeight: 600, marginTop: 5, lineHeight: 1.4 }}>LUNA redacta un borrador con la evidencia del mes; vos lo revisás y aprobás.</div>
              </button>
              <button onClick={() => router.push(linkLuna('/docente/luna/chat', estado.aula.id))} className="ed-luna-cta ed-luna-cta--oscuro" style={{ textAlign: 'left', background: VIOLETA.oscuro, border: 'none', borderRadius: 22, padding: '22px 24px', cursor: 'pointer', boxShadow: `0 8px 20px ${VIOLETA.sombraFuerte}` }}>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: '#fff' }}>Consultar con LUNA</div>
                <div style={{ fontFamily: NUNITO, fontSize: 14.5, color: VIOLETA.textoSobreOscuro, fontWeight: 600, marginTop: 5, lineHeight: 1.4 }}>Planificación, estrategias y dudas pedagógicas con el contexto de tu aula.</div>
              </button>
            </div>

            {/* Alertas */}
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: VIOLETA.oscuro, margin: '30px 0 12px' }}>Alertas de rendimiento</h2>
            {!estado.vista.hayActividad && estado.vista.alertas.every((a) => a.tipo === 'sin_arrancar') ? (
              <div style={cardInfo}>
                <p style={{ margin: 0, fontFamily: NUNITO, fontSize: 15, color: VIOLETA.tinta2, fontWeight: 600, lineHeight: 1.5 }}>
                  Todavía no hay actividad en tu aula. Cuando los chicos empiecen a practicar con SOL, LUNA te va a mostrar señales acá.
                </p>
              </div>
            ) : estado.vista.alertas.length === 0 ? (
              <div style={cardInfo}>
                <p style={{ margin: 0, fontFamily: NUNITO, fontSize: 15, color: VIOLETA.okTexto, fontWeight: 700 }}>Vienen todos bien. Sin señales para atender hoy.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {estado.vista.alertas.map((a, i) => {
                  const [bg, co, label] = CHIP[a.prioridad];
                  return (
                    <div key={`${a.alumnoId}-${a.tipo}-${i}`} style={{ ...cardInfo, display: 'flex', alignItems: 'flex-start', gap: 14, borderColor: a.positiva ? '#D9E8CB' : VIOLETA.bordeCalido }}>
                      <div style={{ width: 48, height: 48, flexShrink: 0, background: `${animal(a.avatar)} center/contain no-repeat` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: VIOLETA.ink }}>{a.alumnoNombre}</span>
                          <span style={{ fontFamily: NUNITO, fontSize: 13, color: VIOLETA.tinta2, fontWeight: 700 }}>{a.grado}° grado</span>
                          <span style={{ background: bg, color: co, padding: '3px 11px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 12 }}>{a.positiva ? 'Va bien' : label}</span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontFamily: NUNITO, fontSize: 15, color: VIOLETA.ink, fontWeight: 600 }}>{a.detalle}</p>
                        <p style={{ margin: '3px 0 0', fontFamily: NUNITO, fontSize: 14.5, color: VIOLETA.oscuro, fontWeight: 700 }}>Sugerencia: {a.sugerencia}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen del aula */}
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: VIOLETA.oscuro, margin: '30px 0 12px' }}>Resumen del aula</h2>
            <div style={{ ...cardInfo, borderRadius: 20, padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 18 }}>
              {[
                ['Tema más trabajado', estado.vista.resumen.temaMasTrabajado ?? 'Sin datos todavía'],
                ['Tema que más cuesta', estado.vista.resumen.temaMasDificil ?? 'Sin datos todavía'],
                ['Boletines pendientes', estado.vista.alumnos.length ? `${estado.vista.resumen.boletinesPendientes} de ${estado.vista.alumnos.length} este mes` : 'Sin alumnos todavía'],
                ['Próximo hito', estado.vista.resumen.hito ?? '—'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: NUNITO, fontSize: 12, color: VIOLETA.tinta2, fontWeight: 800, letterSpacing: '.8px', textTransform: 'uppercase' }}>{l}</div>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: VIOLETA.ink, marginTop: 5 }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// useSearchParams exige Suspense en el App Router (mismo patrón que autoría).
// El key por aula remonta el dashboard al cambiar de aula: estado fresco sin
// setState sincrónico en el efecto.
function ConAula() {
  const aulaParam = useSearchParams().get('aula');
  return <LunaDashboard key={aulaParam ?? ''} aulaParam={aulaParam} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: VIOLETA.tinta2, fontWeight: 600 }}>Cargando…</p>}>
      <ConAula />
    </Suspense>
  );
}
