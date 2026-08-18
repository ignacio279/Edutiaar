'use client';
// Auditoría (Dashboard admin v3, WP9 · rediseño "Auditoría legible" 2026-08-18):
// feed de lo que pasó, escrito en castellano. Todo llega por admin-auditoria
// (la tabla es server-only: PostgREST no la sirve a nadie).
//
// La fn trae datos crudos + los diccionarios que el front no puede resolver por
// RLS (nombres de colegios/maestras/instituciones, y el consentimiento que
// autorizó cada pase); el relato lo arma la lógica pura de
// web/lib/admin/auditoria-relato.ts.
//
// Por defecto se ven solo las acciones CLAVE. Lo rutinario se sigue
// registrando siempre y vuelve con el toggle (D3): el filtro es de la vista,
// nunca del registro.
//
// Spec: docs/superpowers/specs/2026-08-18-auditoria-legible-design.md
import { useEffect, useMemo, useState } from 'react';
import { ADMIN, NIVEL_ADMIN } from '@/lib/admin/tema';
import Pill from '@/components/admin/Pill';
import FiltroChips from '@/components/admin/FiltroChips';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { fechaRelativa } from '@/lib/admin/metricas';
import {
  CATEGORIAS,
  actorDe,
  armarFeed,
  filtrarFeed,
  type Consentimientos,
  type EventoAuditoria,
  type ItemAuditoria,
  type Nombres,
} from '@/lib/admin/auditoria-relato';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Filtros = { entidad: string; accion: string; actor: string; desde: string; hasta: string };
const FILTROS_VACIOS: Filtros = { entidad: '', accion: '', actor: '', desde: '', hasta: '' };

// Entidades conocidas del dominio (el select filtra por eq exacto).
const ENTIDADES: [string, string][] = [
  ['', 'Todas las entidades'],
  ['escuela', 'Colegio'],
  ['perfil', 'Maestra / perfil'],
  ['transferencia', 'Pase'],
  ['arco_caso', 'Caso ARCO'],
  ['licencia', 'Licencia'],
  ['institucion', 'Institución'],
  ['plataforma_admin', 'Admin de plataforma'],
  ['anuncio', 'Anuncio'],
  ['escuela_nota', 'Nota CRM'],
  ['nodo', 'Nodo (mapeo NAP)'],
];

// "Todas" + las categorías del relato, para los chips.
const CHIPS = [{ key: '', label: 'Todo' }, ...CATEGORIAS] as const;

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

const fechaCorta = (iso: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

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

type Respuesta = {
  eventos: EventoAuditoria[];
  nombres?: Nombres;
  consentimientos?: Consentimientos;
  siguiente_cursor: string | null;
};

// Los diccionarios se acumulan página a página: un evento viejo puede
// referirse a un colegio que recién aparece en la página siguiente.
function fusionarNombres(prev: Nombres, nuevo: Nombres | undefined): Nombres {
  if (!nuevo) return prev;
  return {
    escuelas: { ...prev.escuelas, ...nuevo.escuelas },
    perfiles: { ...prev.perfiles, ...nuevo.perfiles },
    instituciones: { ...prev.instituciones, ...nuevo.instituciones },
  };
}

// ── Una fila del feed ──────────────────────────────────────────────────────

function FilaEvento({ item, nombres }: { item: ItemAuditoria; nombres: Nombres }) {
  const principal = item.eventos[item.eventos.length - 1];
  const categoria = CATEGORIAS.find((c) => c.key === item.categoria);
  const esCadena = item.pasos.length > 0;

  return (
    <details style={{ borderBottom: `1px solid ${ADMIN.divisor}`, padding: '13px 0' }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700, minWidth: 92 }}>
          {fechaRelativa(item.fecha, new Date())}
        </span>
        {principal.nivel && NIVEL_ADMIN[principal.nivel] && (
          <Pill tupla={NIVEL_ADMIN[principal.nivel]} />
        )}
        <span style={{ flex: 1, minWidth: 240, fontSize: 14, color: ADMIN.ink, fontWeight: 700 }}>
          {item.titular}
        </span>
        {esCadena && (
          <span style={{ background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {item.pasos.length} pasos
          </span>
        )}
        {categoria && (
          <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
            {categoria.label}
          </span>
        )}
      </summary>

      <div style={{ padding: '12px 0 4px', paddingLeft: 104 }}>
        {/* La cadena: quién hizo qué y quién autorizó, en orden */}
        {esCadena && (
          <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, borderLeft: `2px solid ${ADMIN.divisor}` }}>
            {item.pasos.map((p) => (
              <li key={p.id} style={{ padding: '5px 0 5px 14px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700, minWidth: 96 }}>
                  {fechaCorta(p.fecha) || '—'}
                </span>
                <span style={{ fontSize: 13, color: ADMIN.ink, fontWeight: 600 }}>{p.texto}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Quién lo hizo y contra qué registro */}
        <div style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 600 }}>
          {actorDe(principal, nombres)}
          {' · '}
          {fechaLinda(item.fecha)}
        </div>
        <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
          {principal.entidad_id
            ? `${principal.entidad ?? 'registro'} · ${principal.entidad_id}`
            : 'Sin identificador de registro'}
        </div>

        {/* El jsonb original, siempre disponible: el relato no reemplaza al dato */}
        {item.eventos.map((ev) => (
          ev.detalle && Object.keys(ev.detalle).length > 0 ? (
            <pre key={ev.id} style={{ margin: '8px 0 0', padding: '10px 12px', background: ADMIN.suave, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 12, fontSize: 12.5, color: ADMIN.ink, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {`${ev.accion}\n${JSON.stringify(ev.detalle, null, 2)}`}
            </pre>
          ) : null
        ))}
      </div>
    </details>
  );
}

// ── Pantalla ───────────────────────────────────────────────────────────────

export default function AuditoriaPage() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VACIOS);
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [nombres, setNombres] = useState<Nombres>({ escuelas: {}, perfiles: {}, instituciones: {} });
  const [consentimientos, setConsentimientos] = useState<Consentimientos>({});
  const [verRutina, setVerRutina] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState('');

  // `solo_clave` va a la QUERY: si el filtro fuera solo del lado del cliente,
  // una página entera de acciones rutinarias llegaría para mostrarse vacía.
  async function cargar(f: Filtros, cursorActual: string | null, rutina: boolean) {
    setCargando(true);
    setError('');
    const r = await llamarAdmin<Respuesta>('admin-auditoria', 'listar', {
      filtros: payloadFiltros(f),
      ...(cursorActual ? { cursor: cursorActual } : {}),
      limite: 50,
      solo_clave: !rutina,
    });
    setCargando(false);
    if (!r.ok) {
      setError(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo cargar la auditoría. Probá de nuevo.');
      return;
    }
    const nuevos = r.data.eventos ?? [];
    setEventos((prev) => (cursorActual ? [...prev, ...nuevos] : nuevos));
    setNombres((prev) => fusionarNombres(cursorActual ? prev : {}, r.data.nombres));
    setConsentimientos((prev) => ({
      ...(cursorActual ? prev : {}),
      ...(r.data.consentimientos ?? {}),
    }));
    setCursor(r.data.siguiente_cursor ?? null);
    setCargado(true);
  }

  useEffect(() => {
    cargar(FILTROS_VACIOS, null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recargar(f: Filtros, rutina: boolean) {
    setAplicados(f);
    setEventos([]);
    setCursor(null);
    cargar(f, null, rutina);
  }

  function limpiar() {
    setFiltros(FILTROS_VACIOS);
    setCategoria('');
    recargar(FILTROS_VACIOS, verRutina);
  }

  // El toggle cambia la query, así que rearranca la lista desde la primera página.
  function alternarRutina() {
    const proximo = !verRutina;
    setVerRutina(proximo);
    recargar(aplicados, proximo);
  }

  // El relato se arma sobre TODO lo cargado, así que una cadena partida entre
  // dos páginas se une sola al traer la siguiente.
  const items = useMemo(
    () => armarFeed(eventos, nombres, consentimientos),
    [eventos, nombres, consentimientos],
  );
  const visibles = useMemo(
    () => filtrarFeed(items, { verRutina: true, categoria }),
    [items, categoria],
  );

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 6px' }}>Auditoría</h1>
      <p style={{ fontFamily: NUNITO, fontWeight: 600, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 18px' }}>
        Todo lo que pasó en la plataforma: quién lo hizo, cuándo y quién lo autorizó.
        Tocá un evento para ver el detalle.
      </p>

      {/* Chips de categoría + toggle de rutina */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <FiltroChips opciones={CHIPS} valor={categoria} onCambio={setCategoria} />
        <span style={{ flex: 1 }} />
        <button
          onClick={alternarRutina}
          disabled={cargando}
          className={verRutina ? undefined : 'ad-ghost-warm'}
          style={{
            background: verRutina ? ADMIN.base : ADMIN.carta,
            color: verRutina ? '#fff' : ADMIN.tinta2,
            border: verRutina ? 'none' : `1.5px solid ${ADMIN.bordeCalido}`,
            borderRadius: 999, padding: '8px 16px',
            fontFamily: QUICK, fontWeight: 700, fontSize: 13,
            cursor: cargando ? 'wait' : 'pointer',
          }}
        >
          {verRutina ? 'Ocultando nada — ves todo' : 'Ver también lo rutinario'}
        </button>
      </div>

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
          onClick={() => recargar(filtros, verRutina)}
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

      <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '10px 22px', maxWidth: 940 }}>
        {visibles.map((item) => <FilaEvento key={item.id} item={item} nombres={nombres} />)}

        {!visibles.length && cargado && !cargando && (
          <div style={{ padding: '30px 0', textAlign: 'center', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14.5 }}>
            {categoria && items.length > 0
              ? 'No hay eventos de esa categoría en lo cargado. Probá "Cargar más" o sacá el chip.'
              : 'No hay eventos con esos filtros.'}
          </div>
        )}
        {cargando && !visibles.length && (
          <p style={{ padding: '20px 0', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</p>
        )}
        {cursor && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button
              onClick={() => cargar(aplicados, cursor, verRutina)}
              disabled={cargando}
              className="ad-ghost"
              style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 999, padding: '10px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.oscuro, cursor: cargando ? 'wait' : 'pointer' }}
            >
              {cargando ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>

      {!verRutina && cargado && (
        <p style={{ fontFamily: NUNITO, fontWeight: 600, fontSize: 12.5, color: ADMIN.tinta2, margin: '12px 0 0', maxWidth: 940 }}>
          Se registra todo, siempre. Acá ves lo importante; lo rutinario
          (revisión NAP, alertas atendidas, notas, jobs) está guardado igual y
          aparece con el botón de arriba.
        </p>
      )}
    </div>
  );
}
