'use client';
// Ficha de colegio — tab Resumen (Dashboard admin v3 — WP1): datos, estado,
// stats de 30 días y acciones de estado. Archivar es solo super (gate de UI
// con useAdmin; el gate REAL es el guard server-side de admin-colegios) y,
// como Suspender, confirma tipeando el nombre del colegio (<Confirmar>).
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ADMIN, ESTADO_COLEGIO, TIPO_COLEGIO } from '@/lib/admin/tema';
import { PROVINCIAS } from '@/lib/admin/provincias';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Pill from '@/components/admin/Pill';
import Stat from '@/components/admin/Stat';
import Confirmar from '@/components/admin/Confirmar';
import FichaTabs from '@/components/admin/FichaTabs';
import { useAdmin } from '@/app/admin/admin-context';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

type Detalle = {
  colegio: {
    id: string; nombre: string; zona: string | null; provincia: string | null;
    tipo: string | null;
    estado: string; trial_inicio: string | null; trial_fin: string | null; created_at: string;
  };
  counts: { maestras: number; aulas: number; alumnos: number };
  stats: { sesiones_30d: number; respuestas_30d: number };
  feature: { plan: string; flags: { sol?: boolean; luna?: { activa?: boolean }; terra?: boolean } };
};

const PLAN_LABEL: Record<string, string> = {
  basico: 'Básico',
  docente: 'Docente',
  completo: 'Completo',
  custom: 'Personalizado',
};

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  no_existe: 'Ese colegio no existe (¿lo archivaron y borraron?).',
  nombre_vacio: 'Poné el nombre del colegio.',
  tipo_invalido: 'Elegí un tipo válido.',
  zona_invalida: 'La zona no es válida.',
  provincia_invalida: 'Esa provincia no es válida.',
  estado_invalido: 'Ese estado no existe.',
  transicion_invalida: 'Esa transición de estado no está permitida.',
  falta_escuela_id: 'Falta el colegio.',
};
const errCopy = (code?: string) => (code && ERRS[code]) || 'Algo salió mal. Probá de nuevo.';

const input: React.CSSProperties = {
  padding: '12px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 15, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6,
};
const btn: React.CSSProperties = {
  background: ADMIN.carta, color: ADMIN.tinta2, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999,
  padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer',
};

function diasHasta(fecha: string): number {
  return Math.ceil((new Date(`${fecha}T00:00:00Z`).getTime() - Date.now()) / 86400000);
}

export default function FichaColegio() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const me = useAdmin();

  const [det, setDet] = useState<Detalle | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [confirmando, setConfirmando] = useState<'suspendido' | 'archivado' | null>(null);
  const [busy, setBusy] = useState(false);

  // Form de datos (nombre/provincia/zona/tipo), siempre editable como en el mock.
  const [fNombre, setFNombre] = useState('');
  const [fProvincia, setFProvincia] = useState('');
  const [fZona, setFZona] = useState('');
  const [fTipo, setFTipo] = useState('');

  async function cargar() {
    const r = await llamarAdmin<Detalle>('admin-colegios', 'detalle', { escuela_id: id });
    if (!r.ok) {
      if (r.data.error === 'no_existe') { setNoExiste(true); return; }
      toast(errCopy(r.data.error));
      return;
    }
    setDet(r.data);
    setFNombre(r.data.colegio.nombre);
    setFProvincia(r.data.colegio.provincia ?? '');
    setFZona(r.data.colegio.zona ?? '');
    setFTipo(r.data.colegio.tipo ?? '');
  }

  useEffect(() => {
    if (id) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cambiarEstado(a: string) {
    if (busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-colegios', 'cambiar_estado', { escuela_id: id, estado: a });
    setBusy(false);
    setConfirmando(null);
    if (!r.ok) { toast(errCopy(r.data.error)); return; }
    toast(
      a === 'activo' ? 'Colegio activado. Sus cuentas ya pueden trabajar.'
      : a === 'suspendido' ? 'Colegio suspendido. Sus cuentas quedan bloqueadas.'
      : 'Colegio archivado. Desaparece del setup y sus cuentas quedan bloqueadas.',
    );
    cargar();
  }

  async function guardarDatos() {
    if (busy || !det) return;
    if (!fNombre.trim()) { toast(ERRS.nombre_vacio); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-colegios', 'editar', {
      escuela_id: id, nombre: fNombre.trim(), zona: fZona.trim() || null,
      provincia: fProvincia || null, tipo: fTipo || undefined,
    });
    setBusy(false);
    if (!r.ok) { toast(errCopy(r.data.error)); return; }
    toast('Datos guardados.');
    cargar();
  }

  if (noExiste) {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.warnTexto, fontWeight: 700, fontFamily: QUICK }}>
          Ese colegio no existe. Capaz lo borraron.
        </div>
        <button onClick={() => router.push('/admin/colegios')} style={{ ...btn, marginTop: 16 }}>← Volver a Colegios</button>
      </div>
    );
  }

  if (!det) {
    return <p style={{ color: ADMIN.tinta2, fontWeight: 700, fontFamily: QUICK }}>Cargando la ficha…</p>;
  }

  const c = det.colegio;
  const esSuper = me?.nivel === 'super';
  const puedeActivar = c.estado !== 'activo'; // trial/suspendido/archivado → activo
  const puedeSuspender = c.estado === 'trial' || c.estado === 'activo';
  const puedeArchivar = esSuper && c.estado !== 'archivado';
  const dias = c.trial_fin ? diasHasta(c.trial_fin) : null;

  return (
    <div>
      <button onClick={() => router.push('/admin/colegios')} style={{ background: 'none', border: 'none', color: ADMIN.tinta2, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', padding: 0, marginBottom: 14, fontFamily: NUNITO }}>
        ‹ Colegios
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 32px)', color: ADMIN.ink, margin: 0 }}>{c.nombre}</h1>
        <Pill tupla={ESTADO_COLEGIO[c.estado]} />
        <span style={{ background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '5px 13px', fontFamily: QUICK, fontWeight: 700, fontSize: 13 }}>
          Plan {PLAN_LABEL[det.feature.plan] ?? PLAN_LABEL.custom}
        </span>
        <div style={{ flex: 1 }} />
        {/* Los botones viajan juntos: si no entran, envuelven como bloque y no
            queda uno solo colgando en la línea de abajo. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puedeActivar && (
            <button onClick={() => cambiarEstado('activo')} disabled={busy} className="ed-primary" style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}>
              Activar
            </button>
          )}
          {puedeSuspender && (
            <button onClick={() => setConfirmando('suspendido')} disabled={busy} className="ad-ghost-danger" style={{ ...btn, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
              Suspender
            </button>
          )}
          {puedeArchivar && (
            <button onClick={() => setConfirmando('archivado')} disabled={busy} className="ad-ghost-danger" style={{ ...btn, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
              Archivar
            </button>
          )}
        </div>
      </div>

      <FichaTabs colegioId={id} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Stat chico valor={det.counts.maestras} label={det.counts.maestras === 1 ? 'maestra' : 'maestras'} />
        <Stat chico valor={det.counts.aulas} label={det.counts.aulas === 1 ? 'aula' : 'aulas'} />
        <Stat chico valor={det.counts.alumnos} label={det.counts.alumnos === 1 ? 'alumno' : 'alumnos'} />
        <Stat chico valor={det.stats.sesiones_30d} label="sesiones · 30 días" detalle={`${det.stats.respuestas_30d} ejercicios respondidos`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 }}>
          <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 16px' }}>Datos del colegio</h2>
          <label style={label}>Nombre</label>
          <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} style={{ ...input, width: '100%', marginBottom: 14 }} />
          <label style={label}>Provincia</label>
          <select value={fProvincia} onChange={(e) => setFProvincia(e.target.value)} style={{ ...input, width: '100%', marginBottom: 14, fontWeight: 700, cursor: 'pointer' }}>
            <option value="">Sin asignar (la necesita el Observatorio)</option>
            {PROVINCIAS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label style={label}>Zona</label>
          <input value={fZona} onChange={(e) => setFZona(e.target.value)} placeholder="Sin zona" style={{ ...input, width: '100%', marginBottom: 14 }} />
          <label style={label}>Tipo</label>
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ ...input, width: '100%', marginBottom: 18, fontWeight: 700, cursor: 'pointer' }}>
            <option value="">Sin tipo</option>
            {Object.entries(TIPO_COLEGIO).map(([k, lbl]) => (
              <option key={k} value={k}>{lbl}</option>
            ))}
          </select>
          <button
            onClick={guardarDatos}
            disabled={busy}
            className="ed-primary"
            style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 26px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        {c.estado === 'trial' && c.trial_fin && dias !== null && (
          <div style={{ background: ADMIN.warnFondo, border: `1.5px solid ${ADMIN.warnBorde}`, borderRadius: 22, padding: 22 }}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.warnTexto, margin: '0 0 6px' }}>Período de prueba</h2>
            <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 28, color: ADMIN.warnTexto }}>
              {dias >= 0 ? `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}` : `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`}
            </div>
            <div style={{ fontSize: 14, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
              {c.trial_inicio ? `Del ${c.trial_inicio} al ${c.trial_fin}` : `Hasta el ${c.trial_fin}`}
            </div>
            <p style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, margin: '12px 0 14px', lineHeight: 1.45 }}>
              Al vencer, el colegio pasa a solo-lectura: ven todo lo suyo pero no generan nada nuevo.
            </p>
            <button
              onClick={() => router.push(`/admin/colegios/${id}/accesos`)}
              style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.chipBorde}`, color: ADMIN.warnTexto, borderRadius: 999, padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
            >
              Gestionar accesos ›
            </button>
          </div>
        )}
      </div>

      {confirmando === 'suspendido' && (
        <Confirmar
          titulo={`Suspender ${c.nombre}`}
          descripcion="Todas las cuentas del colegio (maestras y alumnos) quedan bloqueadas hasta que lo reactives. El progreso no se pierde."
          nombre={c.nombre}
          verbo="Suspender"
          busy={busy}
          onConfirmar={() => cambiarEstado('suspendido')}
          onCerrar={() => setConfirmando(null)}
        />
      )}
      {confirmando === 'archivado' && (
        <Confirmar
          titulo={`Archivar ${c.nombre}`}
          descripcion="El colegio desaparece del setup y todas sus cuentas quedan bloqueadas. Los datos no se borran; un super-admin puede restaurarlo con «Activar»."
          nombre={c.nombre}
          verbo="Archivar"
          busy={busy}
          onConfirmar={() => cambiarEstado('archivado')}
          onCerrar={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}
