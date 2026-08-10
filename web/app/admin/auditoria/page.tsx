'use client';
// Auditoría (Dashboard admin v3, WP9): timeline de quién hizo qué y cuándo.
// Todo llega por admin-auditoria (la tabla es server-only: PostgREST no la
// sirve a nadie). Filtros por entidad/acción/actor/rango de fechas + paginado
// por cursor con "Cargar más" — nunca la tabla entera.
import { useEffect, useState } from 'react';
import { ADMIN, NIVEL_ADMIN } from '@/lib/admin/tema';
import Pill from '@/components/admin/Pill';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Evento = {
  id: string;
  actor_id: string;
  actor_email: string | null;
  nivel: string | null;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
  created_at: string;
};

type Filtros = { entidad: string; accion: string; actor: string; desde: string; hasta: string };
const FILTROS_VACIOS: Filtros = { entidad: '', accion: '', actor: '', desde: '', hasta: '' };

// Entidades conocidas del dominio (el select filtra por eq exacto).
const ENTIDADES: [string, string][] = [
  ['', 'Todas las entidades'],
  ['escuela', 'Colegio'],
  ['perfil', 'Maestra / perfil'],
  ['plataforma_admin', 'Admin de plataforma'],
  ['escuela_feature', 'Features'],
  ['anuncio', 'Anuncio'],
  ['escuela_nota', 'Nota CRM'],
];

const inputStyle: React.CSSProperties = {
  padding: '10px 13px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, background: ADMIN.carta, outline: 'none',
};
const labelFiltro: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2,
};

function fechaLinda(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Arma el payload de filtros para la fn: solo claves con valor; las fechas del
// <input type="date"> se convierten en límites del día completo.
function payloadFiltros(f: Filtros): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.entidad) p.entidad = f.entidad;
  if (f.accion.trim()) p.accion = f.accion.trim();
  if (f.actor.trim()) p.actor_email = f.actor.trim();
  if (f.desde) p.desde = `${f.desde}T00:00:00`;
  if (f.hasta) p.hasta = `${f.hasta}T23:59:59.999`;
  return p;
}

export default function AuditoriaPage() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VACIOS);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState('');

  async function cargar(f: Filtros, cursorActual: string | null) {
    setCargando(true);
    setError('');
    const r = await llamarAdmin<{ eventos: Evento[]; siguiente_cursor: string | null }>(
      'admin-auditoria',
      'listar',
      { filtros: payloadFiltros(f), ...(cursorActual ? { cursor: cursorActual } : {}), limite: 50 },
    );
    setCargando(false);
    if (!r.ok) {
      setError(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo cargar la auditoría. Probá de nuevo.');
      return;
    }
    setEventos((prev) => (cursorActual ? [...prev, ...(r.data.eventos ?? [])] : (r.data.eventos ?? [])));
    setCursor(r.data.siguiente_cursor ?? null);
    setCargado(true);
  }

  useEffect(() => {
    cargar(FILTROS_VACIOS, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicar() {
    setAplicados(filtros);
    setEventos([]);
    setCursor(null);
    cargar(filtros, null);
  }

  function limpiar() {
    setFiltros(FILTROS_VACIOS);
    setAplicados(FILTROS_VACIOS);
    setEventos([]);
    setCursor(null);
    cargar(FILTROS_VACIOS, null);
  }

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 6px' }}>Auditoría</h1>
      <p style={{ fontFamily: NUNITO, fontWeight: 600, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 18px' }}>
        Registro de solo lectura de toda mutación: quién hizo qué y cuándo.
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={labelFiltro}>
          Entidad
          <select value={filtros.entidad} onChange={(e) => setFiltros({ ...filtros, entidad: e.target.value })} style={{ ...inputStyle, minWidth: 170, cursor: 'pointer' }}>
            {ENTIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label style={labelFiltro}>
          Acción
          <input value={filtros.accion} onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })} placeholder="ej. crear_colegio" style={{ ...inputStyle, width: 160 }} />
        </label>
        <label style={labelFiltro}>
          Actor (email)
          <input value={filtros.actor} onChange={(e) => setFiltros({ ...filtros, actor: e.target.value })} placeholder="ej. jorge@" style={{ ...inputStyle, width: 150 }} />
        </label>
        <label style={labelFiltro}>
          Desde
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} style={inputStyle} />
        </label>
        <label style={labelFiltro}>
          Hasta
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} style={inputStyle} />
        </label>
        <button
          onClick={aplicar}
          disabled={cargando}
          className="ed-primary"
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: cargando ? 'wait' : 'pointer', boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}
        >
          Filtrar
        </button>
        <button
          onClick={limpiar}
          disabled={cargando}
          className="ad-ghost-warm"
          style={{ background: ADMIN.carta, color: ADMIN.tinta2, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Limpiar
        </button>
      </div>

      {error && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '12px 16px', color: ADMIN.warnTexto, fontFamily: QUICK, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Timeline: una sola tarjeta con un <details> por evento (mock) */}
      <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '10px 22px', maxWidth: 860 }}>
        {eventos.map((ev) => (
          <details key={ev.id} style={{ borderBottom: `1px solid ${ADMIN.divisor}`, padding: '13px 0' }}>
            <summary style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer', listStyle: 'none' }}>
              <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700, minWidth: 118 }}>{fechaLinda(ev.created_at)}</span>
              <span style={{ fontSize: 13, color: ADMIN.oscuro, fontWeight: 700 }}>{ev.actor_email ?? 'sin email'}</span>
              {ev.nivel && <Pill tupla={NIVEL_ADMIN[ev.nivel]} />}
              <span style={{ flex: 1, fontSize: 14, color: ADMIN.ink, fontWeight: 700 }}>{ev.accion}</span>
              {ev.entidad && (
                <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
                  {ev.entidad}
                </span>
              )}
            </summary>
            <div style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, padding: '10px 0 2px 130px' }}>
              {ev.entidad_id ? `${ev.entidad ?? 'registro'} · ${ev.entidad_id}` : 'Sin identificador de registro'}
              {ev.detalle && Object.keys(ev.detalle).length > 0 && (
                <pre style={{ margin: '8px 0 0', padding: '10px 12px', background: ADMIN.suave, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 12, fontSize: 12.5, color: ADMIN.ink, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(ev.detalle, null, 2)}
                </pre>
              )}
            </div>
          </details>
        ))}
        {!eventos.length && cargado && !cargando && (
          <div style={{ padding: '30px 0', textAlign: 'center', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14.5 }}>
            No hay eventos con esos filtros.
          </div>
        )}
        {cargando && !eventos.length && (
          <p style={{ padding: '20px 0', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</p>
        )}
        {cursor && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button
              onClick={() => cargar(aplicados, cursor)}
              disabled={cargando}
              className="ad-ghost"
              style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 999, padding: '10px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.oscuro, cursor: cargando ? 'wait' : 'pointer' }}
            >
              {cargando ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
