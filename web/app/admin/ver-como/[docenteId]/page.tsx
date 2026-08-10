'use client';
// Ver como maestra (Dashboard admin v3, WP9): la foto del panel de una docente
// para poder ayudarla por teléfono sin pedirle la contraseña.
// D12: NO hay sesión ni token de la docente — la Edge Function admin-impersonar
// arma un SNAPSHOT read-only con service_role y audita cada vista. Por eso acá
// no hay un solo botón de acción: ni override, ni publicar, ni boletines. Se
// mira y se sale.
// Datos mínimos (Regla 5): nombre de pila, grado y desempeño; nada de emails de
// alumnos, PINs ni credenciales.
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import { haceCuanto } from '@/lib/panel';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Shape EXACTO de supabase/functions/admin-impersonar/snapshot.ts.
type Aula = { id: string; nombre: string; grado: number | null; codigo: string };
type Alumno = {
  id: string;
  nombre: string;
  grado: number | null;
  aula_id: string | null;
  ultimaSesion: string | null;
  sesionesHoy: number;
  precisionReciente: number | null;
};
type Materia = { id: string; nombre: string; estado: string; nodos: number };
type Actividad = { alumnoNombre: string; fecha: string; aciertos: number; total: number };
type Snapshot = {
  docente: { id: string; nombre: string };
  escuela: { id: string; nombre: string } | null;
  aulas: Aula[];
  alumnos: Alumno[];
  materias: Materia[];
  boletines: { aprobados: number; borradores: number };
  actividadReciente: Actividad[];
};

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  no_existe: 'Esa maestra no existe (o la cuenta ya no está).',
};

// Estado de materia (sol_materia): borrador | publicado.
const ESTADO_MATERIA: Record<string, readonly [string, string, string]> = {
  borrador: [ADMIN.hover, ADMIN.tinta2, 'Borrador'],
  publicado: [ADMIN.okFondo, ADMIN.okTexto, 'Publicada'],
};

const plural = (n: number, uno: string, muchos: string) => `${n} ${n === 1 ? uno : muchos}`;
const gradoLabel = (g: number | null) => (typeof g === 'number' ? `${g}°` : '—');

function horaLinda(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Color del % de aciertos con la semántica de la app (verde / naranja / rojo).
function colorPrecision(p: number): [string, string] {
  if (p >= 70) return [ADMIN.okFondo, ADMIN.okTexto];
  if (p >= 50) return [ADMIN.warnFondo, ADMIN.warnTexto];
  return [ADMIN.dangerFondo, ADMIN.danger];
}

export default function VerComoPage() {
  const router = useRouter();
  const params = useParams<{ docenteId: string }>();
  const docenteId = String(params?.docenteId ?? '');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!docenteId) return;
    (async () => {
      setCargando(true);
      const r = await llamarAdmin<{ snapshot: Snapshot }>('admin-impersonar', 'vista_docente', { docente_id: docenteId });
      setCargando(false);
      if (!r.ok || !r.data.snapshot) {
        setError(ERRS[r.data?.error ?? ''] || r.data?.error || 'No se pudo abrir la vista de esa maestra.');
        return;
      }
      setError('');
      setSnap(r.data.snapshot);
    })();
  }, [docenteId]);

  const salir = () => router.push('/admin/maestras');
  const ahora = new Date();

  const aulaDe = new Map((snap?.aulas ?? []).map((a) => [a.id, a.nombre]));

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Banner de contexto: pegado arriba, siempre a la vista. */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: ADMIN.warnFondo, border: `2px solid ${ADMIN.sol}`, borderRadius: 18,
          padding: '16px 22px', marginBottom: 22,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.warnTexto }}>
            Estás viendo como {snap?.docente.nombre ?? 'esta maestra'} — solo lectura
          </div>
          <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
            No es su sesión; esta consulta queda auditada.
          </div>
        </div>
        <button
          onClick={salir}
          className="ed-primary"
          style={{
            background: ADMIN.sol, color: '#fff', border: 'none', borderRadius: 999,
            padding: '11px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(244,169,59,.3)',
          }}
        >
          Salir
        </button>
      </div>

      {error && (
        <div style={{ background: ADMIN.dangerFondo, border: `2px solid ${ADMIN.dangerBorde}`, borderRadius: 18, padding: '16px 20px', color: ADMIN.danger, fontFamily: QUICK, fontWeight: 700, fontSize: 14.5 }}>
          {error}
        </div>
      )}

      {cargando && !snap && !error && (
        <p style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando su panel…</p>
      )}

      {snap && (
        <>
          {/* Encabezado — en el mock esta h1 va en Quicksand, no en Baloo:
              es el panel de la maestra, no una pantalla de plataforma. */}
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 30px)', color: ADMIN.ink, margin: '0 0 4px' }}>
            Panel de {snap.docente.nombre}
          </h1>
          <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 20px' }}>
            {snap.escuela?.nombre ?? 'Sin colegio asignado'} · réplica de solo lectura · {plural(snap.alumnos.length, 'alumno', 'alumnos')} ·{' '}
            {plural(snap.aulas.length, 'aula', 'aulas')}
          </p>

          {/* Resumen en números */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <Numerito valor={String(snap.alumnos.filter((a) => a.sesionesHoy > 0).length)} label="practicaron hoy" />
            <Numerito valor={String(snap.materias.length)} label={snap.materias.length === 1 ? 'materia' : 'materias'} />
            {/* La fn cuenta solo el período actual (periodo = YYYY-MM de hoy). */}
            <Numerito valor={String(snap.boletines.aprobados)} label="boletines aprobados (este mes)" />
            <Numerito valor={String(snap.boletines.borradores)} label="boletines en borrador (este mes)" />
          </div>

          {/* Aulas */}
          <h2 style={subtitulo}>Sus aulas</h2>
          {snap.aulas.length === 0 ? (
            <Vacio texto="Todavía no creó ningún aula." />
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              {snap.aulas.map((a) => (
                <div key={a.id} style={{ ...tarjeta, minWidth: 190, padding: '14px 18px' }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.ink }}>{a.nombre}</div>
                  <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 3 }}>
                    {typeof a.grado === 'number' ? `${a.grado}° grado · ` : ''}código {a.codigo} ·{' '}
                    {plural(snap.alumnos.filter((al) => al.aula_id === a.id).length, 'alumno', 'alumnos')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alumnos */}
          <h2 style={subtitulo}>Sus alumnos</h2>
          {snap.alumnos.length === 0 ? (
            <Vacio texto="Todavía no tiene alumnos cargados." />
          ) : (
            <div style={{ ...tarjeta, padding: 0, overflowX: 'auto', marginBottom: 24 }}>
              <div style={{ minWidth: 560 }}>
                <div style={{ ...filaGrilla, borderBottom: `2px solid ${ADMIN.divisor}`, fontFamily: QUICK, fontWeight: 800, fontSize: 11.5, letterSpacing: '.6px', color: ADMIN.tinta2, textTransform: 'uppercase' }}>
                  <span>Alumno</span>
                  <span style={{ textAlign: 'center' }}>Grado</span>
                  <span>Aula</span>
                  <span>Última práctica</span>
                  <span style={{ textAlign: 'center' }}>Aciertos (14 días)</span>
                </div>
                {snap.alumnos.map((al) => {
                  const [bg, color] = al.precisionReciente === null ? [ADMIN.burbuja, ADMIN.medio] : colorPrecision(al.precisionReciente);
                  return (
                    <div key={al.id} style={{ ...filaGrilla, borderBottom: `1px solid ${ADMIN.divisor}` }}>
                      <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink }}>{al.nombre}</span>
                      <span style={{ textAlign: 'center', fontFamily: NUNITO, fontSize: 14, color: ADMIN.tinta2, fontWeight: 600 }}>
                        {gradoLabel(al.grado)}
                      </span>
                      <span style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600 }}>
                        {al.aula_id ? (aulaDe.get(al.aula_id) ?? '—') : '—'}
                      </span>
                      <span style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600 }}>
                        {al.ultimaSesion ? haceCuanto(al.ultimaSesion, ahora) : 'nunca practicó'}
                        {al.sesionesHoy > 0 && (
                          <span style={{ color: ADMIN.okTexto, fontWeight: 700 }}>
                            {' '}· {plural(al.sesionesHoy, 'sesión hoy', 'sesiones hoy')}
                          </span>
                        )}
                      </span>
                      <span style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', background: bg, color, borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 800, fontSize: 12 }}>
                          {al.precisionReciente === null ? 'sin datos' : `${al.precisionReciente}%`}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Materias */}
          <h2 style={subtitulo}>Sus materias</h2>
          {snap.materias.length === 0 ? (
            <Vacio texto="Todavía no armó ninguna materia con SOL." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {snap.materias.map((m) => {
                const tupla = ESTADO_MATERIA[m.estado] ?? [ADMIN.claro, ADMIN.oscuro, m.estado];
                return (
                  <div key={m.id} style={{ ...tarjeta, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.ink }}>{m.nombre}</span>
                    <span style={{ display: 'inline-block', background: tupla[0], color: tupla[1], borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 800, fontSize: 12 }}>
                      {tupla[2]}
                    </span>
                    <span style={{ marginLeft: 'auto', fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600 }}>
                      {plural(m.nodos, 'tema', 'temas')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actividad reciente */}
          <h2 style={subtitulo}>Últimas prácticas</h2>
          {snap.actividadReciente.length === 0 ? (
            <Vacio texto="No hubo prácticas en los últimos 14 días." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {snap.actividadReciente.map((s, i) => (
                <div key={`${s.alumnoNombre}-${s.fecha}-${i}`} style={{ ...tarjeta, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink }}>{s.alumnoNombre}</span>
                  <span style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600 }}>
                    {haceCuanto(s.fecha, ahora)} {horaLinda(s.fecha)}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.medio, fontWeight: 700 }}>
                    {s.aciertos}/{s.total} aciertos
                  </span>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '18px 0 0', lineHeight: 1.5 }}>
            Vista de solo lectura: desde acá no se puede cambiar nada del aula. Si hay que corregir algo, hacelo
            desde las secciones del panel o pedíselo a la maestra.
          </p>
        </>
      )}
    </div>
  );
}

function Numerito({ valor, label }: { valor: string; label: string }) {
  // En el mock las tiles de ver-como llevan el número en tinta, no en petróleo:
  // es la vista de la maestra, no una métrica de plataforma.
  return (
    <div style={{ ...tarjeta, borderRadius: 20, padding: '18px 20px', minWidth: 150 }}>
      <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 28, color: ADMIN.ink, lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 18, padding: '16px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, marginBottom: 24 }}>
      {texto}
    </div>
  );
}

// ---------- estilos (del mock Admin.dc.html) ----------
const tarjeta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22,
};
const subtitulo: React.CSSProperties = {
  fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px',
};
const filaGrilla: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1.5fr .6fr 1fr 1.4fr 1fr', gap: 10,
  alignItems: 'center', padding: '11px 18px',
};
