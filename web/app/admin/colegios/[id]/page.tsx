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

const PLAN_PILL: Record<string, readonly [string, string, string]> = {
  basico: [ADMIN.claro, ADMIN.oscuro, 'Plan Básico'],
  docente: [ADMIN.claro, ADMIN.oscuro, 'Plan Docente'],
  completo: [ADMIN.okFondo, ADMIN.okTexto, 'Plan Completo'],
  custom: [ADMIN.bordeCalido, ADMIN.tinta2, 'Plan Custom'],
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
  padding: '11px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 15, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};
const label: React.CSSProperties = {
  display: 'block', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 6px',
};
const btn: React.CSSProperties = {
  background: ADMIN.carta, color: ADMIN.tinta2, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  padding: '9px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer',
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

  // Form chico de datos (nombre/provincia/zona/tipo).
  const [editando, setEditando] = useState(false);
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
    setEditando(false);
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

  return (
    <div style={{ maxWidth: 860 }}>
      <button onClick={() => router.push('/admin/colegios')} style={{ background: 'none', border: 'none', color: ADMIN.medio, fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        ← Colegios
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(24px,4vw,30px)', color: ADMIN.ink, margin: 0 }}>{c.nombre}</h1>
        <Pill tupla={ESTADO_COLEGIO[c.estado]} />
        <Pill tupla={PLAN_PILL[det.feature.plan] ?? PLAN_PILL.custom} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 20px' }}>
        {puedeActivar && (
          <button onClick={() => cambiarEstado('activo')} disabled={busy} style={{ ...btn, background: ADMIN.okFondo, color: ADMIN.okTexto, borderColor: ADMIN.okBorde }}>
            Activar
          </button>
        )}
        {puedeSuspender && (
          <button onClick={() => setConfirmando('suspendido')} disabled={busy} style={{ ...btn, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
            Suspender…
          </button>
        )}
        {puedeArchivar && (
          <button onClick={() => setConfirmando('archivado')} disabled={busy} style={{ ...btn, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
            Archivar…
          </button>
        )}
      </div>

      <FichaTabs colegioId={id} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Stat valor={det.counts.maestras} label={det.counts.maestras === 1 ? 'Maestra' : 'Maestras'} />
        <Stat valor={det.counts.aulas} label={det.counts.aulas === 1 ? 'Aula' : 'Aulas'} />
        <Stat valor={det.counts.alumnos} label={det.counts.alumnos === 1 ? 'Alumno' : 'Alumnos'} />
        <Stat
          valor={det.stats.sesiones_30d}
          label="Sesiones (30 días)"
          detalle={`${det.stats.respuestas_30d} ejercicios respondidos`}
        />
      </div>

      <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '20px 22px', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: 0 }}>Datos del colegio</h2>
          {!editando && <button onClick={() => setEditando(true)} style={btn}>Editar</button>}
        </div>

        {editando ? (
          <div style={{ maxWidth: 460 }}>
            <label style={label}>Nombre</label>
            <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12 }} />
            <label style={label}>Provincia</label>
            <select value={fProvincia} onChange={(e) => setFProvincia(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12, cursor: 'pointer' }}>
              <option value="">Sin asignar</option>
              {PROVINCIAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label style={label}>Zona (detalle libre)</label>
            <input value={fZona} onChange={(e) => setFZona(e.target.value)} placeholder="Sin zona" style={{ ...input, width: '100%', marginBottom: 12 }} />
            <label style={label}>Tipo</label>
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ ...input, width: '100%', marginBottom: 16, cursor: 'pointer' }}>
              <option value="">Sin tipo</option>
              {Object.entries(TIPO_COLEGIO).map(([k, lbl]) => (
                <option key={k} value={k}>{lbl}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={guardarDatos}
                disabled={busy}
                style={{ ...btn, background: ADMIN.base, color: '#fff', border: 'none' }}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                onClick={() => { setEditando(false); setFNombre(c.nombre); setFProvincia(c.provincia ?? ''); setFZona(c.zona ?? ''); setFTipo(c.tipo ?? ''); }}
                disabled={busy}
                style={btn}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: NUNITO, fontSize: 15, color: ADMIN.ink, fontWeight: 600, lineHeight: 1.9 }}>
            <div>
              <span style={{ color: ADMIN.tinta2 }}>Provincia: </span>
              {c.provincia || 'Sin asignar'}
              <span style={{ color: ADMIN.tinta2, fontSize: 12.5 }}> (la necesita el Observatorio)</span>
            </div>
            <div><span style={{ color: ADMIN.tinta2 }}>Zona: </span>{c.zona || 'Sin zona'}</div>
            <div><span style={{ color: ADMIN.tinta2 }}>Tipo: </span>{c.tipo ? TIPO_COLEGIO[c.tipo] ?? c.tipo : 'Sin tipo'}</div>
            <div><span style={{ color: ADMIN.tinta2 }}>Alta: </span>{c.created_at?.slice(0, 10) ?? '—'}</div>
            <div>
              <span style={{ color: ADMIN.tinta2 }}>Features: </span>
              SOL {det.feature.flags?.sol ? '✓' : '✗'} · LUNA {det.feature.flags?.luna?.activa ? '✓' : '✗'} · TERRA {det.feature.flags?.terra ? '✓' : '✗'}
              <span style={{ color: ADMIN.tinta2 }}> (se manejan en la tab Features)</span>
            </div>
          </div>
        )}
      </div>

      {c.estado === 'trial' && c.trial_fin && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 22, padding: '16px 20px', fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.warnTexto, fontWeight: 700 }}>
          Período de prueba: {c.trial_inicio ? `del ${c.trial_inicio} ` : ''}al {c.trial_fin}.{' '}
          {diasHasta(c.trial_fin) >= 0
            ? `Le quedan ${diasHasta(c.trial_fin)} días.`
            : `Venció hace ${-diasHasta(c.trial_fin)} días: el colegio quedó en solo lectura. La extensión vive en la tab Accesos.`}
        </div>
      )}

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
