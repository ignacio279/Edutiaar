'use client';
// Métricas de la plataforma (WP5 + métricas de VALOR, spec 2026-08-17).
//
// La pantalla responde tres preguntas, en este orden: ¿los chicos aprenden?,
// ¿cubrimos el currículum oficial?, ¿le sirve a la maestra? Antes mostraba
// contadores de volumen ("548 ejercicios respondidos") que no le hacían hacer
// nada a nadie; ahora los tiles miden lo que le PASÓ al chico que la usó.
//
// Todo sale de admin-metricas en FILAS CRUDAS acotadas y se calcula acá con la
// lógica pura de web/lib/admin/metricas.ts y web/lib/admin/valor.ts — las
// mismas que cubren los unit tests.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN, ESTADO_COLEGIO } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Stat from '@/components/admin/Stat';
import {
  compararColegios, funnelColegio, serieSemanal,
  type ColegioComparado, type DatosFunnel, type SesionFila,
} from '@/lib/admin/metricas';
import {
  temasDominados, esfuerzoParaDominar, chicosDestrabados, histogramaPuntaje,
  coberturaNap, napSinTocar, copilotoAlertas, serieBoletines, overrideDocente,
  horasAhorradas, MINUTOS_POR_BOLETIN,
  type HitoFila, type SnapshotFila, type NapTemaFila, type NodoMapeado,
  type AlumnoNodoFila, type AlumnoGrado, type AlertaEmitida, type AlertaAtendida,
  type BoletinValor,
} from '@/lib/admin/valor';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

const RANGOS = [7, 30, 90] as const;

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: 0 };
const bajada: React.CSSProperties = { fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '4px 0 16px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 };
const grilla2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' };
const thComp: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: ADMIN.tinta2, letterSpacing: '.6px' };
const vacio: React.CSSProperties = { color: ADMIN.tinta2, fontWeight: 600, fontSize: 14.5, margin: 0 };
const numeroGrande: React.CSSProperties = { fontFamily: BALOO, fontWeight: 700, fontSize: 32, color: ADMIN.oscuro, lineHeight: 1 };

const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
};

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// '2026-08' → 'ago'
const mesCorto = (clave: string) => MESES_CORTOS[Number(clave.slice(5, 7)) - 1] ?? clave;

// Título de sección: separa los tres bloques de la pantalla.
function Bloque({ titulo, pregunta }: { titulo: string; pregunta: string }) {
  return (
    <div style={{ margin: '28px 0 14px' }}>
      <h2 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 22, color: ADMIN.ink, margin: 0 }}>{titulo}</h2>
      <p style={{ ...bajada, margin: '2px 0 0' }}>{pregunta}</p>
    </div>
  );
}

// Barra horizontal de proporción (cobertura NAP, tasas).
function Barra({ pct, color }: { pct: number; color?: string }) {
  return (
    <div style={{ background: ADMIN.suave, borderRadius: 999, height: 9, overflow: 'hidden', flex: 1, minWidth: 60 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color ?? ADMIN.base, borderRadius: 999 }} />
    </div>
  );
}

// Delta contra el período anterior. Sube y baja NO son buenos o malos por sí
// mismos: `mejorSiBaja` invierte el color (esfuerzo para dominar).
function Delta({ valor, sufijo = '', mejorSiBaja = false }: { valor: number | null; sufijo?: string; mejorSiBaja?: boolean }) {
  if (valor === null || valor === 0) return <span style={{ color: ADMIN.tinta2, fontWeight: 700 }}>sin cambios</span>;
  const bueno = mejorSiBaja ? valor < 0 : valor > 0;
  return (
    <span style={{ color: bueno ? ADMIN.okTexto : ADMIN.warnTexto, fontWeight: 800 }}>
      {valor > 0 ? '↑' : '↓'} {Math.abs(valor)}{sufijo}
    </span>
  );
}

type RespAdopcion = { sesiones: SesionFila[] };
type RespFunnel = { colegios: DatosFunnel[] };
type RespComparativa = { colegios: ColegioComparado[] };
type RespAprendizaje = { hitos: HitoFila[]; snapshots: SnapshotFila[] };
type RespCurriculum = { napTemas: NapTemaFila[]; nodos: NodoMapeado[]; alumnoNodo: AlumnoNodoFila[]; alumnos: AlumnoGrado[] };
type RespCopiloto = {
  alertas: { emitidas: AlertaEmitida[]; atendidas: AlertaAtendida[] };
  boletines: BoletinValor[];
  overrides: { hitos: HitoFila[]; stock: { conOverride: number; total: number } };
};

export default function Page() {
  const router = useRouter();
  const [rango, setRango] = useState<number>(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [sesiones, setSesiones] = useState<SesionFila[]>([]);
  const [funnels, setFunnels] = useState<DatosFunnel[]>([]);
  const [comparados, setComparados] = useState<ColegioComparado[]>([]);
  const [aprendizaje, setAprendizaje] = useState<RespAprendizaje | null>(null);
  const [curriculum, setCurriculum] = useState<RespCurriculum | null>(null);
  const [copiloto, setCopiloto] = useState<RespCopiloto | null>(null);
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      const [rAdop, rFunnel, rComp, rApr, rCurr, rCop] = await Promise.all([
        llamarAdmin<RespAdopcion>('admin-metricas', 'adopcion', { rango_dias: rango }),
        llamarAdmin<RespFunnel>('admin-metricas', 'funnel'),
        llamarAdmin<RespComparativa>('admin-metricas', 'comparativa', { rango_dias: rango }),
        llamarAdmin<RespAprendizaje>('admin-metricas', 'aprendizaje', { rango_dias: rango }),
        llamarAdmin<RespCurriculum>('admin-metricas', 'curriculum'),
        llamarAdmin<RespCopiloto>('admin-metricas', 'copiloto', { rango_dias: rango }),
      ]);
      if (!vivo) return;
      const fallo = [rAdop, rFunnel, rComp, rApr, rCurr, rCop].find((r) => !r.ok);
      if (fallo) {
        setError(ERRS_ADMIN[fallo.data.error ?? ''] ?? 'No se pudieron cargar las métricas. Probá de nuevo.');
      } else {
        setSesiones(rAdop.data.sesiones ?? []);
        setFunnels(rFunnel.data.colegios ?? []);
        setComparados(rComp.data.colegios ?? []);
        setAprendizaje(rApr.data);
        setCurriculum(rCurr.data);
        setCopiloto(rCop.data);
        setAhora(new Date());
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [rango]);

  // El rango se cierra en `ahora`: mismo instante para todas las funciones.
  const ventana = useMemo(
    () => (ahora ? { desde: new Date(ahora.getTime() - rango * 86_400_000), hasta: ahora } : null),
    [ahora, rango],
  );

  const dominados = useMemo(
    () => (ventana ? temasDominados(aprendizaje?.hitos ?? [], ventana) : null),
    [aprendizaje, ventana],
  );
  const esfuerzo = useMemo(() => esfuerzoParaDominar(aprendizaje?.hitos ?? []), [aprendizaje]);
  const destrabados = useMemo(
    () => (ventana ? chicosDestrabados(aprendizaje?.hitos ?? [], ventana) : null),
    [aprendizaje, ventana],
  );
  const histograma = useMemo(
    () => (ahora ? histogramaPuntaje(aprendizaje?.snapshots ?? [], ahora, rango) : null),
    [aprendizaje, ahora, rango],
  );
  const cobertura = useMemo(
    () => coberturaNap({
      napTemas: curriculum?.napTemas ?? [], nodos: curriculum?.nodos ?? [],
      alumnoNodo: curriculum?.alumnoNodo ?? [], alumnos: curriculum?.alumnos ?? [],
    }),
    [curriculum],
  );
  const sinTocar = useMemo(
    () => napSinTocar(curriculum?.napTemas ?? [], curriculum?.nodos ?? []),
    [curriculum],
  );
  const alertas = useMemo(
    () => (ventana ? copilotoAlertas(copiloto?.alertas.emitidas ?? [], copiloto?.alertas.atendidas ?? [], ventana) : null),
    [copiloto, ventana],
  );
  const boletines = useMemo(() => serieBoletines(copiloto?.boletines ?? []), [copiloto]);
  const override = useMemo(
    () => (ventana
      ? overrideDocente(copiloto?.overrides.hitos ?? [], copiloto?.overrides.stock ?? { conOverride: 0, total: 0 }, ventana)
      : null),
    [copiloto, ventana],
  );
  const horas = useMemo(
    () => (ventana ? horasAhorradas(copiloto?.boletines ?? [], ventana) : null),
    [copiloto, ventana],
  );

  const serie = useMemo(() => (ahora ? serieSemanal(sesiones, rango, ahora) : []), [sesiones, rango, ahora]);
  const filas = useMemo(() => compararColegios(comparados), [comparados]);
  const maxSemana = Math.max(1, ...serie.map((s) => s.alumnosActivos));
  const maxHisto = Math.max(1, ...(histograma?.hoy.buckets ?? [0]));
  const maxEsfuerzo = Math.max(1, ...esfuerzo.serie.map((m) => m.mediana));

  // Agregado del funnel: dónde se cae la gente, de un vistazo.
  const agregadoFunnel = useMemo(() => {
    const etapas = funnels.map((f) => funnelColegio(f));
    if (!etapas.length) return [];
    return etapas[0].map((_, i) => ({
      label: etapas[0][i].label,
      hechos: etapas.filter((e) => e[i].hecho).length,
      total: etapas.length,
    }));
  }, [funnels]);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>Métricas</h1>
        <div style={{ display: 'flex', gap: 5, background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999, padding: 4 }}>
          {RANGOS.map((r) => (
            <button
              key={r}
              onClick={() => r !== rango && setRango(r)}
              style={{ background: r === rango ? ADMIN.base : 'transparent', color: r === rango ? '#fff' : ADMIN.tinta2, border: 'none', borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: r === rango ? 'default' : 'pointer' }}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 18, background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '14px 18px', color: ADMIN.warnTexto, fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      )}

      {cargando && !error && (
        <div style={{ marginTop: 24, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
      )}

      {!cargando && !error && (
        <>
          {/* ── Los cuatro números que importan ───────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <Stat
              valor={dominados?.total ?? 0}
              label="temas dominados"
              detalle={dominados?.total || dominados?.previo
                ? `${dominados.delta > 0 ? '↑' : dominados.delta < 0 ? '↓' : '='} ${Math.abs(dominados.delta)} vs. período anterior`
                : `${dominados?.historicos ?? 0} antes de la medición`}
            />
            <Stat
              valor={`${cobertura.global.pctCubierto}%`}
              label="de los NAP de su grado"
              detalle={cobertura.global.alumnos ? `el chico promedio · ${cobertura.global.temasTotal} temas del marco` : 'sin alumnos con grado'}
            />
            <Stat
              valor={alertas?.tasa === null || alertas === null ? '—' : `${alertas.tasa}%`}
              label="alertas de LUNA atendidas"
              detalle={alertas && alertas.emitidas
                ? `${alertas.atendidas} de ${alertas.emitidas}${alertas.medianaHoras !== null ? ` · mediana ${alertas.medianaHoras} h` : ''}`
                : 'todavía sin alertas mostradas'}
            />
            <Stat
              valor={`${horas?.horas ?? 0} h`}
              label="ahorradas en boletines"
              detalle={`estimado · ${horas?.boletines ?? 0} × ${MINUTOS_POR_BOLETIN} min`}
            />
          </div>

          {/* ══ A. ¿Los chicos aprenden? ═════════════════════════════════════ */}
          <Bloque titulo="¿Los chicos aprenden?" pregunta="Lo que el motor determinístico sabe del recorrido de cada chico, no cuánto clickearon." />

          <div style={grilla2}>
            <div style={carta}>
              <h2 style={h2}>Esfuerzo para dominar</h2>
              <p style={bajada}>Ejercicios que le lleva a un chico dominar un tema. Si baja, SOL está eligiendo mejor.</p>
              {esfuerzo.mediana === null ? (
                <p style={vacio}>Todavía no hay temas dominados con la medición nueva.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                    <span style={numeroGrande}>{esfuerzo.mediana}</span>
                    <span style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                      mediana · {esfuerzo.n} {esfuerzo.n === 1 ? 'tema' : 'temas'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                      <Delta valor={esfuerzo.tendencia} mejorSiBaja />
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 }}>
                    {esfuerzo.serie.map((m, i) => (
                      <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: ADMIN.oscuro }}>{m.mediana}</span>
                        <div
                          title={`${m.n} temas dominados`}
                          style={{ width: '68%', maxWidth: 36, height: `${Math.max(6, Math.round((m.mediana / maxEsfuerzo) * 70))}%`, background: i === esfuerzo.serie.length - 1 ? ADMIN.base : ADMIN.barra2, borderRadius: '9px 9px 4px 4px' }}
                        />
                        <span style={{ fontSize: 11.5, color: ADMIN.tinta2, fontWeight: 700 }}>{mesCorto(m.mes)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={carta}>
              <h2 style={h2}>Chicos que se destrabaron</h2>
              <p style={bajada}>Salieron de &ldquo;a reforzar&rdquo; en el período. El caso más lindo del producto.</p>
              <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
                <div>
                  <div style={numeroGrande}>{destrabados?.chicos ?? 0}</div>
                  <div style={{ fontSize: 13.5, color: ADMIN.ink, fontWeight: 700, marginTop: 8 }}>chicos</div>
                  <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>{destrabados?.eventos ?? 0} temas destrabados</div>
                </div>
                <div style={{ borderLeft: `1.5px solid ${ADMIN.divisor}`, paddingLeft: 24 }}>
                  <div style={{ ...numeroGrande, fontSize: 26, color: ADMIN.tinta2 }}>{destrabados?.trabados ?? 0}</div>
                  <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 8 }}>temas que se trabaron<br />en el mismo período</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...carta, marginTop: 18 }}>
            <h2 style={h2}>Puntaje de toda la plataforma</h2>
            <p style={bajada}>
              Cada nodo de cada chico, por decil de puntaje.
              {histograma?.corrimiento !== null && histograma?.corrimiento !== undefined
                ? ` La curva se movió ${histograma.corrimiento > 0 ? '+' : ''}${histograma.corrimiento} deciles desde ${fechaCorta(histograma.antes?.fecha)}.`
                : ' Hace falta más de una foto nocturna para comparar.'}
            </p>
            {!histograma?.hoy.total ? (
              <p style={vacio}>Todavía no se tomó ninguna foto (la saca la corrida nocturna).</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130 }}>
                {histograma.hoy.buckets.map((n, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: '100%' }}>
                      {histograma.antes && (
                        <div
                          title={`${histograma.antes.buckets[i]} nodos el ${fechaCorta(histograma.antes.fecha)}`}
                          style={{ width: 10, height: `${Math.max(2, Math.round((histograma.antes.buckets[i] / maxHisto) * 100))}%`, background: ADMIN.suave, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: '6px 6px 2px 2px' }}
                        />
                      )}
                      <div
                        title={`${n} nodos hoy`}
                        style={{ width: 18, height: `${Math.max(2, Math.round((n / maxHisto) * 100))}%`, background: i >= 7 ? ADMIN.base : ADMIN.barra2, borderRadius: '6px 6px 2px 2px' }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: ADMIN.tinta2, fontWeight: 700 }}>{i * 10}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══ B. ¿Cubrimos el currículum oficial? ══════════════════════════ */}
          <Bloque titulo="¿Cubrimos el currículum oficial?" pregunta="Contra los 289 temas de los NAP (Res. CFCyE 214/04). La vara no la ponemos nosotros." />

          <div style={grilla2}>
            <div style={carta}>
              <h2 style={h2}>Cobertura NAP por grado</h2>
              <p style={bajada}>Temas del marco de cada grado que la plataforma tocó, y cuántos ya se dominan.</p>
              {!cobertura.porGrado.length ? (
                <p style={vacio}>Todavía no hay alumnos con grado cargado.</p>
              ) : (
                cobertura.porGrado.map((g) => (
                  <div key={g.grado} style={{ padding: '11px 0', borderBottom: `1.5px solid ${ADMIN.divisor}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: ADMIN.ink, minWidth: 34 }}>{g.grado}°</span>
                      <Barra pct={g.pctCubierto} />
                      <span style={{ fontWeight: 800, fontSize: 14, color: ADMIN.oscuro, minWidth: 42, textAlign: 'right' }}>{g.pctCubierto}%</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, paddingLeft: 46 }}>
                      {g.cubiertos} de {g.temasTotal} temas · {g.dominados} dominados · {g.alumnos} {g.alumnos === 1 ? 'chico' : 'chicos'} (promedio individual {g.pctPorAlumno}%)
                      {g.fueraDeGrado > 0 && ` · ${g.fueraDeGrado} temas de otro grado`}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={carta}>
              <h2 style={h2}>Temas que nadie toca</h2>
              <p style={bajada}>Puntos ciegos de toda la plataforma: o falta contenido, o falta programa.</p>
              {!sinTocar.total ? (
                <p style={vacio}>El catálogo NAP todavía no está cargado.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                    <span style={numeroGrande}>{sinTocar.sinTocar.length}</span>
                    <span style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 700 }}>de {sinTocar.total} temas del marco</span>
                  </div>
                  {sinTocar.porMateria.map((m) => (
                    <div key={m.materia} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1.5px solid ${ADMIN.divisor}` }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, flex: 1 }}>{m.materia || 'Sin materia'}</span>
                      <Barra pct={Math.round((100 * (m.total - m.sinTocar)) / (m.total || 1))} color={ADMIN.barra3} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, minWidth: 74, textAlign: 'right' }}>
                        {m.total - m.sinTocar} de {m.total}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ══ C. ¿Le sirve a la maestra? ═══════════════════════════════════ */}
          <Bloque titulo="¿Le sirve a la maestra?" pregunta="Si le hace caso a LUNA, el copiloto gobierna decisiones. Si la ignora, es ruido bonito." />

          <div style={grilla2}>
            <div style={carta}>
              <h2 style={h2}>Alertas de LUNA</h2>
              <p style={bajada}>Emitidas contra atendidas (&ldquo;Listo ✓&rdquo;), por tipo de alerta.</p>
              {!alertas?.emitidas ? (
                <p style={vacio}>Todavía no se le mostró ninguna alerta a ninguna maestra.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                    <span style={numeroGrande}>{alertas.tasa === null ? '—' : `${alertas.tasa}%`}</span>
                    <span style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                      {alertas.atendidas} de {alertas.emitidas}
                      {alertas.tasa === null && ' · muestra chica'}
                    </span>
                  </div>
                  {alertas.porTipo.map((t) => (
                    <div key={t.tipo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1.5px solid ${ADMIN.divisor}` }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, flex: 1 }}>{t.tipo.replace(/_/g, ' ')}</span>
                      <Barra pct={Math.round((100 * t.atendidas) / (t.emitidas || 1))} color={ADMIN.luna} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, minWidth: 62, textAlign: 'right' }}>
                        {t.atendidas} de {t.emitidas}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={carta}>
              <h2 style={h2}>Boletines que salieron perfectos</h2>
              <p style={bajada}>Aprobados sin una sola edición. Interesa la tendencia: una caída es una regresión del prompt.</p>
              {!boletines.length ? (
                <p style={vacio}>Todavía no se generó ningún boletín.</p>
              ) : (
                boletines.slice(-6).map((m) => (
                  <div key={m.mes} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1.5px solid ${ADMIN.divisor}` }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, minWidth: 40 }}>{mesCorto(m.mes)}</span>
                    <Barra pct={m.tasa ?? Math.round((100 * m.sinEditar) / (m.generados || 1))} color={ADMIN.sol} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: ADMIN.oscuro, minWidth: 40, textAlign: 'right' }}>
                      {m.tasa === null ? '—' : `${m.tasa}%`}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: ADMIN.tinta2, minWidth: 78, textAlign: 'right' }}>
                      {m.sinEditar} de {m.generados}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ ...carta, marginTop: 18 }}>
            <h2 style={h2}>Cuánto le lleva la contra la maestra al motor</h2>
            <p style={bajada}>
              Overrides: la seño fija el estado de un nodo a mano. Bajo = confía en la regla; alto = el modelo no matchea lo que ve en el aula.
            </p>
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={numeroGrande}>{override?.eventos ?? 0}</div>
                <div style={{ fontSize: 13.5, color: ADMIN.ink, fontWeight: 700, marginTop: 8 }}>overrides en el período</div>
                <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>sobre {override?.chicos ?? 0} {override?.chicos === 1 ? 'chico' : 'chicos'}</div>
              </div>
              <div style={{ borderLeft: `1.5px solid ${ADMIN.divisor}`, paddingLeft: 26 }}>
                <div style={{ ...numeroGrande, fontSize: 26, color: ADMIN.tinta2 }}>{override?.pctStock ?? 0}%</div>
                <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 8 }}>
                  de los nodos está fijado a mano hoy<br />({override?.stock ?? 0} de {copiloto?.overrides.stock.total ?? 0})
                </div>
              </div>
            </div>
          </div>

          {/* ══ Adopción (lo que ya había, corregido) ════════════════════════ */}
          <Bloque titulo="Adopción" pregunta="Dónde se cae la gente en el camino y cómo evoluciona cada colegio." />

          <div style={carta}>
            <h2 style={h2}>Funnel de onboarding</h2>
            <p style={bajada}>Creado → maestras invitadas → primera actividad → primer boletín aprobado</p>
            {funnels.length === 0 ? (
              <p style={vacio}>Todavía no hay colegios cargados.</p>
            ) : (
              <>
                {/* Agregado primero: el cuello de botella se ve de un vistazo. */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                  {agregadoFunnel.map((e) => (
                    <div key={e.label} style={{ flex: 1, minWidth: 150, background: ADMIN.suave, borderRadius: 14, padding: '10px 14px' }}>
                      <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 20, color: e.hechos === e.total ? ADMIN.okTexto : ADMIN.oscuro }}>
                        {e.hechos}/{e.total}
                      </div>
                      <div style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700, marginTop: 2 }}>{e.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {funnels.map((f) => {
                    const etapas = funnelColegio(f);
                    return (
                      <div key={f.escuela.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: ADMIN.suave, borderRadius: 16, padding: '12px 16px' }}>
                        <button
                          onClick={() => router.push(`/admin/colegios/${f.escuela.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, minWidth: 180, textAlign: 'left', fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink, cursor: 'pointer' }}
                        >
                          {f.escuela.nombre ?? 'Colegio'}
                        </button>
                        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                          {etapas.map((e) => (
                            <div key={e.clave} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0, background: e.hecho ? ADMIN.okCheck : ADMIN.neutroFondo, color: e.hecho ? '#fff' : ADMIN.neutroTexto }}>
                                {e.hecho ? '✓' : '○'}
                              </span>
                              <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                                {e.label}{e.fecha ? ` · ${fechaCorta(e.fecha)}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ ...grilla2, marginTop: 18 }}>
            <div style={carta}>
              <h2 style={h2}>Comparativa entre colegios</h2>
              {/* Sin columna de PRECISIÓN a propósito: comparar el % de aciertos
                  entre colegios induce a una conclusión falsa (distintos grados,
                  distintos nodos y dificultad ADAPTATIVA por chico). Eso se mide
                  contra el marco NAP, en el Observatorio. */}
              <p style={bajada}>Actividad del período. El % de aciertos no se compara entre colegios: se mide contra los NAP.</p>
              <div style={{ display: 'flex', gap: 12, padding: '8px 12px', ...thComp }}>
                <span style={{ flex: 2 }}>COLEGIO</span>
                <span style={{ flex: 1, textAlign: 'right' }}>ALUMNOS</span>
                <span style={{ flex: 1, textAlign: 'right' }}>SESIONES</span>
                <span style={{ flex: 1, textAlign: 'right' }}>BOLETINES</span>
              </div>
              {filas.length === 0 ? (
                <p style={{ ...vacio, marginTop: 12 }}>Todavía no hay colegios para comparar.</p>
              ) : (
                filas.map((f) => {
                  const pill = ESTADO_COLEGIO[f.estado ?? ''] ?? null;
                  return (
                    <button
                      key={f.escuelaId}
                      onClick={() => router.push(`/admin/colegios/${f.escuelaId}/uso`)}
                      className="ad-flat"
                      style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', background: ADMIN.suave, border: 'none', borderRadius: 12, padding: 12, marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                    >
                      <span style={{ flex: 2, fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>
                        {f.nombre || 'Colegio'}
                        {pill && (
                          <span style={{ marginLeft: 8, background: pill[0], color: pill[1], borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800, fontFamily: QUICK }}>
                            {pill[2]}
                          </span>
                        )}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{f.alumnosActivos}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{f.sesiones}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{f.boletinesAprobados}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div style={carta}>
              <h2 style={h2}>Chicos activos por semana</h2>
              {/* Antes graficaba SESIONES: subían si un solo chico practicaba 20
                  veces. Chicos distintos es la curva de negocio. La última
                  semana está en curso → se marca, o siempre parece una caída. */}
              <p style={bajada}>Chicos distintos que practicaron cada semana.</p>
              {serie.length === 0 ? (
                <div style={vacio}>Sin datos todavía.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 10, height: 150, paddingBottom: 34, position: 'relative' }}>
                  {serie.map((s, i) => {
                    const enCurso = i === serie.length - 1;
                    return (
                      <div key={s.desde} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                        <div
                          title={`${s.alumnosActivos} chicos · ${s.sesiones} sesiones`}
                          style={{ width: '70%', maxWidth: 38, height: `${Math.max(3, Math.round((s.alumnosActivos / maxSemana) * 100))}%`, background: enCurso ? ADMIN.barra2 : ADMIN.base, borderRadius: '9px 9px 4px 4px', opacity: enCurso ? 0.75 : 1 }}
                        />
                        <span style={{ position: 'absolute', bottom: -22, fontSize: 12, color: ADMIN.tinta2, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fechaCorta(s.desde)}
                        </span>
                        {enCurso && (
                          <span style={{ position: 'absolute', bottom: -34, fontSize: 10.5, color: ADMIN.tinta3, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            en curso
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
