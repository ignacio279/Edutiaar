'use client';
// Transferencias (alumno golondrina, ADR-011): vista de operación de los pases
// entre colegios. El admin ve todos, puede cancelar uno pendiente y registrar
// una transferencia ASISTIDA (la familia está presente: el consentimiento se
// toma en el momento, sin link).
//
// El token del link NUNCA se muestra acá: la fn solo devuelve COLS_VISTA (sin
// token_hash ni contadores de lockout).
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import {
  ERRS_TRANSFERENCIA, VINCULOS, VINCULO_COPY, copyEstado, copyVencimiento,
} from '@/lib/transferencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Transferencia = {
  id: string; alumno_id: string; estado: string; expira_at: string;
  confirmada_via: string | null; resuelta_at: string | null; created_at: string;
  alumno?: { nombre: string } | null;
  origen?: { nombre: string } | null;
  destino?: { nombre: string } | null;
};
type EscuelaOpcion = { id: string; nombre: string };

const ERRS: Record<string, string> = { ...ERRS_ADMIN, ...ERRS_TRANSFERENCIA };
const copyError = (c?: string) => ERRS[c ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

const ESTADOS = ['', 'pendiente', 'confirmada', 'denegada', 'expirada'] as const;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: `2px solid ${ADMIN.borde}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.ink, background: '#fff', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: QUICK, fontWeight: 700, fontSize: 13, color: ADMIN.tinta2, margin: '0 0 5px',
};
const btnSm: React.CSSProperties = {
  background: ADMIN.carta, color: ADMIN.medio, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 10,
  padding: '7px 13px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const card: React.CSSProperties = {
  background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 16,
  padding: 20, marginBottom: 18, boxShadow: `0 4px 16px ${ADMIN.sombraCalida}`,
};

export default function AdminTransferencias() {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [escuelas, setEscuelas] = useState<EscuelaOpcion[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [asistida, setAsistida] = useState({ alumno_id: '', escuela_destino_id: '', adulto_nombre: '', adulto_vinculo: '' });

  async function cargar(estado = filtro) {
    const r = await llamarAdmin<{ transferencias: Transferencia[] }>(
      'gestion-transferencias', 'listar', estado ? { estado } : {},
    );
    if (!r.ok) { toast(copyError(r.data.error)); setTransferencias([]); return; }
    setTransferencias(r.data.transferencias ?? []);
  }

  useEffect(() => {
    cargar();
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('escuela_publica').select('id, nombre').order('nombre');
      setEscuelas((data as EscuelaOpcion[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function denegar(t: Transferencia) {
    if (busy) return;
    setBusy(true);
    const r = await llamarAdmin('gestion-transferencias', 'denegar', { transferencia_id: t.id });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Pase cancelado.');
    await cargar();
  }

  async function registrarAsistida() {
    if (busy) return;
    if (!asistida.alumno_id || !asistida.escuela_destino_id || !asistida.adulto_nombre.trim() || !asistida.adulto_vinculo) {
      toast('Completá el alumno, el colegio, el nombre del adulto y el vínculo.');
      return;
    }
    setBusy(true);
    const r = await llamarAdmin('gestion-transferencias', 'asistida', asistida);
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setAsistida({ alumno_id: '', escuela_destino_id: '', adulto_nombre: '', adulto_vinculo: '' });
    toast('Transferencia registrada con el consentimiento de la familia.');
    await cargar();
  }

  return (
    <div style={{ padding: '26px 28px', maxWidth: 1000 }}>
      <h1 style={{ fontFamily: BALOO, fontSize: 27, color: ADMIN.oscuro, margin: '0 0 4px' }}>Transferencias</h1>
      <p style={{ fontFamily: QUICK, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 20px' }}>
        Pases de chicos entre colegios. Sin consentimiento registrado de la familia no hay transferencia:
        lo garantiza la base, no la pantalla.
      </p>

      {/* ── Transferencia asistida ───────────────────────────────────── */}
      <section style={card}>
        <h2 style={{ fontFamily: BALOO, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 4px' }}>
          Transferencia asistida
        </h2>
        <p style={{ fontFamily: QUICK, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 14px' }}>
          Para cuando el adulto está presente: se registra el consentimiento y el pase se hace en el acto.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Identificador del alumno</label>
            <input
              value={asistida.alumno_id} placeholder="UUID del alumno"
              onChange={(e) => setAsistida({ ...asistida, alumno_id: e.target.value.trim() })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Colegio de destino</label>
            <select
              value={asistida.escuela_destino_id}
              onChange={(e) => setAsistida({ ...asistida, escuela_destino_id: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Elegí un colegio</option>
              {escuelas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Adulto responsable</label>
            <input
              value={asistida.adulto_nombre} placeholder="Nombre y apellido"
              onChange={(e) => setAsistida({ ...asistida, adulto_nombre: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Vínculo</label>
            <select
              value={asistida.adulto_vinculo}
              onChange={(e) => setAsistida({ ...asistida, adulto_vinculo: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Elegí el vínculo</option>
              {VINCULOS.map((v) => <option key={v} value={v}>{VINCULO_COPY[v]}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={registrarAsistida} disabled={busy}
          style={{
            marginTop: 14, background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12,
            padding: '11px 20px', fontFamily: BALOO, fontSize: 15, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? .6 : 1,
          }}
        >Registrar transferencia</button>
      </section>

      {/* ── Listado ──────────────────────────────────────────────────── */}
      <section style={card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: BALOO, fontSize: 19, color: ADMIN.oscuro, margin: 0, flex: 1 }}>Todos los pases</h2>
          {ESTADOS.map((e) => (
            <button
              key={e || 'todos'}
              onClick={() => { setFiltro(e); cargar(e); }}
              style={{
                ...btnSm,
                background: filtro === e ? ADMIN.claro : ADMIN.carta,
                color: filtro === e ? ADMIN.oscuro : ADMIN.medio,
              }}
            >{e === '' ? 'Todos' : copyEstado(e).copy}</button>
          ))}
        </div>

        {transferencias.length === 0 ? (
          <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>No hay pases para mostrar.</p>
        ) : transferencias.map((t) => {
          const e = copyEstado(t.estado);
          return (
            <div
              key={t.id}
              style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                padding: '11px 0', borderTop: `1px solid ${ADMIN.bordeCalido}`,
              }}
            >
              <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink, flex: 1, minWidth: 200 }}>
                {t.alumno?.nombre ?? 'Alumno'}
                <span style={{ fontWeight: 400, color: ADMIN.tinta2 }}>
                  {' · '}{t.origen?.nombre ?? 'sin colegio'} → {t.destino?.nombre ?? '—'}
                </span>
              </span>
              <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2 }}>
                {t.estado === 'pendiente' ? copyVencimiento(t.expira_at, new Date()) : (t.confirmada_via ? `Vía ${t.confirmada_via}` : '')}
              </span>
              <span style={{
                fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: '#fff',
                background: e.color, borderRadius: 999, padding: '4px 12px',
              }}>{e.copy}</span>
              {t.estado === 'pendiente' ? (
                <button style={{ ...btnSm, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }} onClick={() => denegar(t)}>
                  Cancelar
                </button>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
