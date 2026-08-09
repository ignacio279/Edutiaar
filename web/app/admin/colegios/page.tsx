'use client';
// Colegios (Dashboard admin v3 — WP1): listado con filtros y alta manual.
// Todo pasa por la Edge Function admin-colegios (guard plataforma_admin);
// esta página es solo UI. El filtro de estado va al server (acción `listar`
// con filtros); la búsqueda por nombre filtra en memoria sobre lo cargado.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN, ESTADO_COLEGIO, TIPO_COLEGIO } from '@/lib/admin/tema';
import { PROVINCIAS } from '@/lib/admin/provincias';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Pill from '@/components/admin/Pill';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

type ColegioFila = {
  id: string; nombre: string; zona: string | null; provincia: string | null;
  tipo: string | null; estado: string; trial_fin: string | null; plan: string;
  maestras: number; aulas: number; alumnos: number; created_at: string;
};

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  nombre_vacio: 'Poné el nombre del colegio.',
  tipo_invalido: 'Elegí el tipo de colegio.',
  zona_invalida: 'La zona no es válida.',
  provincia_invalida: 'Esa provincia no es válida.',
};
const errCopy = (code?: string) => (code && ERRS[code]) || 'Algo salió mal. Probá de nuevo.';

const input: React.CSSProperties = {
  padding: '11px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 15, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};
const label: React.CSSProperties = {
  display: 'block', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 6px',
};

export default function ColegiosPage() {
  const router = useRouter();

  const [colegios, setColegios] = useState<ColegioFila[] | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [modal, setModal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [provincia, setProvincia] = useState('');
  const [zona, setZona] = useState('');
  const [tipo, setTipo] = useState('');
  const [busy, setBusy] = useState(false);

  async function cargar(estado: string) {
    setColegios(null);
    const r = await llamarAdmin<{ colegios: ColegioFila[] }>(
      'admin-colegios', 'listar', estado ? { filtros: { estado } } : {},
    );
    if (!r.ok) { toast(errCopy(r.data.error)); setColegios([]); return; }
    setColegios(r.data.colegios ?? []);
  }

  useEffect(() => {
    cargar(filtroEstado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  async function crear() {
    if (busy) return;
    if (!nombre.trim()) { toast(ERRS.nombre_vacio); return; }
    if (!tipo) { toast(ERRS.tipo_invalido); return; }
    setBusy(true);
    const r = await llamarAdmin<{ colegio: { id: string } }>('admin-colegios', 'crear', {
      nombre: nombre.trim(), zona: zona.trim() || null, provincia: provincia || null, tipo,
    });
    setBusy(false);
    if (!r.ok) { toast(errCopy(r.data.error)); return; }
    toast('¡Colegio creado! Arranca con 30 días de prueba.');
    setModal(false);
    setNombre(''); setProvincia(''); setZona(''); setTipo('');
    router.push(`/admin/colegios/${r.data.colegio.id}`);
  }

  const visibles = (colegios ?? []).filter(
    (c) => !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(24px,4vw,30px)', color: ADMIN.ink, margin: 0 }}>Colegios</h1>
        <button
          onClick={() => setModal(true)}
          className="ed-primary"
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: `0 4px 14px ${ADMIN.sombraFuerte}` }}
        >
          + Nuevo colegio
        </button>
      </div>
      <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.tinta2, margin: '0 0 20px', fontWeight: 600 }}>
        Cada colegio arranca en prueba de 30 días; de su estado cuelga todo el acceso.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ ...input, padding: '10px 12px', cursor: 'pointer' }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_COLEGIO).map(([k, [, , lbl]]) => (
            <option key={k} value={k}>{lbl}</option>
          ))}
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          style={{ ...input, flex: 1, minWidth: 200 }}
        />
      </div>

      {colegios === null ? (
        <p style={{ color: ADMIN.tinta2, fontWeight: 700, fontFamily: QUICK }}>Cargando colegios…</p>
      ) : visibles.length === 0 ? (
        <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontWeight: 700, fontFamily: QUICK }}>
          {colegios.length === 0 && !filtroEstado
            ? 'Todavía no hay colegios. Creá el primero con «+ Nuevo colegio».'
            : 'No encontramos colegios con esos filtros.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibles.map((c) => (
            <div
              key={c.id}
              onClick={() => router.push(`/admin/colegios/${c.id}`)}
              style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '16px 20px', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>{c.nombre}</span>
                <Pill tupla={ESTADO_COLEGIO[c.estado]} />
                {c.tipo && (
                  <span style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>
                    {TIPO_COLEGIO[c.tipo] ?? c.tipo}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: NUNITO, fontSize: 14, color: ADMIN.tinta2, fontWeight: 600, marginTop: 6 }}>
                {c.provincia ? `${c.provincia} · ` : ''}
                {c.zona ? `${c.zona} · ` : ''}
                {c.maestras} {c.maestras === 1 ? 'maestra' : 'maestras'} · {c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'} · {c.alumnos} {c.alumnos === 1 ? 'alumno' : 'alumnos'}
                {c.estado === 'trial' && c.trial_fin ? ` · Prueba hasta ${c.trial_fin}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,51,42,.45)', display: 'grid', placeItems: 'center', zIndex: 60, animation: 'edFade .2s ease' }} onClick={() => !busy && setModal(false)}>
          <div style={{ width: '100%', maxWidth: 440, background: ADMIN.carta, border: `2px solid ${ADMIN.borde}`, borderRadius: 24, padding: '26px 28px', boxShadow: '0 18px 44px rgba(58,51,42,.3)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 21, color: ADMIN.ink, margin: '0 0 6px' }}>Nuevo colegio</h3>
            <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 16px', lineHeight: 1.5 }}>
              Arranca en período de prueba de 30 días con el plan Docente (SOL + LUNA).
            </p>
            <label style={label}>Nombre del colegio</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Escuela N° 12 Los Aromos" style={{ ...input, width: '100%', marginBottom: 14 }} />
            <label style={label}>Provincia</label>
            <select value={provincia} onChange={(e) => setProvincia(e.target.value)} style={{ ...input, width: '100%', marginBottom: 14, cursor: 'pointer' }}>
              <option value="">Elegí la provincia…</option>
              {PROVINCIAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label style={label}>Zona (detalle libre)</label>
            <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Traslasierra, Córdoba" style={{ ...input, width: '100%', marginBottom: 14 }} />
            <label style={label}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...input, width: '100%', marginBottom: 20, cursor: 'pointer' }}>
              <option value="">Elegí un tipo…</option>
              {Object.entries(TIPO_COLEGIO).map(([k, lbl]) => (
                <option key={k} value={k}>{lbl}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} disabled={busy} style={{ background: 'none', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.tinta2, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={crear}
                disabled={busy}
                style={{ background: busy ? ADMIN.borde : ADMIN.base, border: 'none', borderRadius: 12, padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                {busy ? 'Creando…' : 'Crear colegio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
