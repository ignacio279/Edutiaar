'use client';
// Pases entre colegios (alumno golondrina, ADR-011) — restyle 2026-08 al mock
// Admin.dc.html. Vista de operación de las transferencias: el admin ve todas,
// cancela una pendiente y registra una transferencia ASISTIDA (la familia está
// presente: el consentimiento se toma en el momento, sin link).
//
// El token del link NUNCA se muestra acá: la fn solo devuelve COLS_VISTA (sin
// token_hash ni contadores de lockout), y el copy se lo dice al operador.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN, ERRS_RED_ADMIN } from '@/lib/admin/api';
import { ADMIN, CAMPO, ETIQUETA, ESTADO_PASE } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import Pill from '@/components/admin/Pill';
import Stat from '@/components/admin/Stat';
import Modal from '@/components/admin/Modal';
import FiltroChips from '@/components/admin/FiltroChips';
import {
  ERRS_TRANSFERENCIA, VINCULOS, VINCULO_COPY, copyVencimiento,
} from '@/lib/transferencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

type Transferencia = {
  id: string; alumno_id: string; estado: string; expira_at: string;
  confirmada_via: string | null; resuelta_at: string | null; created_at: string;
  alumno?: { nombre: string } | null;
  origen?: { nombre: string } | null;
  destino?: { nombre: string } | null;
};
type EscuelaOpcion = { id: string; nombre: string };

// ERRS_RED_ADMIN va al final: los mapas de dominio traen el copy para
// maestras y familias, y en el panel queremos el diagnóstico técnico.
const ERRS: Record<string, string> = { ...ERRS_ADMIN, ...ERRS_TRANSFERENCIA, ...ERRS_RED_ADMIN };
const copyError = (c?: string) => ERRS[c ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

const FILTROS = [
  { key: '', label: 'Todos' },
  { key: 'pendiente', label: 'Esperando a la familia' },
  { key: 'confirmada', label: 'Autorizadas' },
  { key: 'denegada', label: 'Canceladas' },
  { key: 'expirada', label: 'Vencidas' },
] as const;

const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 24,
};

// Qué pasó con el pase, en una línea. El color acompaña: ámbar mientras se
// espera a la familia, verde cuando ya autorizó, gris cuando quedó sin efecto.
function detalle(t: Transferencia, ahora: Date): { texto: string; color: string } {
  if (t.estado === 'pendiente') return { texto: copyVencimiento(t.expira_at, ahora), color: ADMIN.warnTexto };
  if (t.estado === 'confirmada') {
    return { texto: t.confirmada_via === 'asistida' ? 'Autorizada en la escuela' : 'Autorizada por link', color: ADMIN.okTexto };
  }
  if (t.estado === 'expirada') return { texto: 'El link venció sin respuesta', color: ADMIN.tinta2 };
  return { texto: 'Cancelada desde el panel', color: ADMIN.tinta2 };
}

const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export default function AdminTransferencias() {
  const [transferencias, setTransferencias] = useState<Transferencia[] | null>(null);
  const [escuelas, setEscuelas] = useState<EscuelaOpcion[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [cancelar, setCancelar] = useState<Transferencia | null>(null);
  const [asistida, setAsistida] = useState({ alumno_id: '', escuela_destino_id: '', adulto_nombre: '', adulto_vinculo: 'madre' });
  const [registrada, setRegistrada] = useState('');
  const ahora = new Date();

  // Se trae SIEMPRE la lista completa (la fn ya topea en 200) y el filtro es en
  // memoria: si filtrara en el server, los tres tiles de arriba pasarían a
  // contar sobre lo filtrado y "esperando a la familia" daría 0 apenas mirás
  // las autorizadas. Los tiles son el resumen del total, no del filtro.
  async function cargar() {
    setTransferencias(null);
    const r = await llamarAdmin<{ transferencias: Transferencia[] }>('gestion-transferencias', 'listar', {});
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

  async function denegar() {
    if (!cancelar || busy) return;
    setBusy(true);
    const r = await llamarAdmin('gestion-transferencias', 'denegar', { transferencia_id: cancelar.id });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setCancelar(null);
    toast('Pase cancelado.');
    await cargar();
  }

  const asistidaLista = !!(asistida.alumno_id.trim() && asistida.escuela_destino_id
    && asistida.adulto_nombre.trim() && asistida.adulto_vinculo);

  async function registrarAsistida() {
    if (busy) return;
    if (!asistidaLista) { toast('Completá el alumno, el colegio, el nombre del adulto y el vínculo.'); return; }
    const adulto = asistida.adulto_nombre.trim();
    const vinculo = VINCULO_COPY[asistida.adulto_vinculo as keyof typeof VINCULO_COPY] ?? asistida.adulto_vinculo;
    const destino = escuelas.find((e) => e.id === asistida.escuela_destino_id)?.nombre ?? 'el colegio nuevo';
    setBusy(true);
    const r = await llamarAdmin('gestion-transferencias', 'asistida', asistida);
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setAsistida({ alumno_id: '', escuela_destino_id: '', adulto_nombre: '', adulto_vinculo: 'madre' });
    setRegistrada(`${adulto} (${vinculo}) autorizó el pase a ${destino}. La maestra nueva ya puede sumarlo a su clase.`);
    await cargar();
  }

  const todas = transferencias ?? [];
  const filas = filtro ? todas.filter((t) => t.estado === filtro) : todas;
  const cuenta = (...estados: string[]) => todas.filter((t) => estados.includes(t.estado)).length;

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' }}>
        Pases entre colegios
      </h1>
      <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px', maxWidth: 680, textWrap: 'pretty' }}>
        El legajo es del chico y viaja con él. Ningún pase avanza sin la autorización registrada de un
        adulto responsable de la familia.
      </p>

      {/* Los tiles cuentan sobre lo que trajo el filtro; con "Todos" son el total. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <Stat valor={cuenta('pendiente')} label="esperando a la familia" detalle="links generados sin autorizar" />
        <Stat valor={cuenta('confirmada')} label="autorizadas" detalle="con constancia del adulto" />
        <Stat valor={cuenta('denegada', 'expirada')} label="sin efecto" detalle="vencidas o canceladas" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <FiltroChips opciones={FILTROS} valor={filtro} onCambio={setFiltro} />
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700 }}>
          El link del pase nunca se muestra en este panel
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 26 }}>
        {transferencias === null ? (
          <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Cargando…</p>
        ) : filas.length === 0 ? (
          <div style={{ ...carta, textAlign: 'center', padding: '44px 24px' }}>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>
              Por ahora no hay pases con ese estado
            </div>
            <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>Probá con otro filtro.</div>
          </div>
        ) : filas.map((t) => {
          const d = detalle(t, ahora);
          const espera = t.estado === 'pendiente';
          return (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                background: ADMIN.carta, border: `2px solid ${espera ? ADMIN.warnBorde : ADMIN.bordeCalido}`,
                borderRadius: 20, padding: '16px 22px', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 230 }}>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.ink }}>
                  {t.alumno?.nombre ?? 'Alumno'}
                </div>
                <div style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
                  {t.origen?.nombre ?? 'sin colegio'} → {t.destino?.nombre ?? '—'}
                </div>
              </div>
              <div style={{ minWidth: 190 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: d.color }}>{d.texto}</div>
                <div style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
                  Generado el {fechaCorta(t.created_at)}
                </div>
              </div>
              <Pill tupla={ESTADO_PASE[t.estado]} />
              {espera && (
                <button
                  onClick={() => setCancelar(t)}
                  className="ad-ghost-danger"
                  style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.dangerBorde}`, color: ADMIN.danger, borderRadius: 999, padding: '9px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Transferencia asistida ───────────────────────────────────────── */}
      <div style={{ ...carta, maxWidth: 760 }}>
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: ADMIN.oscuro, margin: '0 0 4px' }}>
          Transferencia asistida
        </h2>
        <p style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px', lineHeight: 1.45, textWrap: 'pretty' }}>
          Para cuando el adulto responsable está presente en la escuela: se registra la autorización en
          el acto y el pase queda autorizado sin link.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
          <div>
            {/* Sin selector de chicos a propósito: el admin de plataforma no tiene
                lectura sobre `perfil`, y no hace falta que la tenga para operar
                un pase. El identificador se lo pasa la escuela. */}
            <label style={ETIQUETA}>¿Quién se muda? (identificador del alumno)</label>
            <input
              value={asistida.alumno_id} placeholder="UUID del alumno"
              onChange={(e) => { setAsistida({ ...asistida, alumno_id: e.target.value.trim() }); setRegistrada(''); }}
              style={CAMPO}
            />
          </div>
          <div>
            <label style={ETIQUETA}>¿A qué colegio va?</label>
            <select
              value={asistida.escuela_destino_id}
              onChange={(e) => { setAsistida({ ...asistida, escuela_destino_id: e.target.value }); setRegistrada(''); }}
              style={{ ...CAMPO, fontWeight: 700, cursor: 'pointer' }}
            >
              <option value="">Elegí un colegio</option>
              {escuelas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={ETIQUETA}>Nombre del adulto que autoriza</label>
            <input
              value={asistida.adulto_nombre} placeholder="Griselda Ferreyra"
              onChange={(e) => setAsistida({ ...asistida, adulto_nombre: e.target.value })}
              style={CAMPO}
            />
          </div>
          <div>
            <label style={ETIQUETA}>¿Qué es del chico o la chica?</label>
            <select
              value={asistida.adulto_vinculo}
              onChange={(e) => setAsistida({ ...asistida, adulto_vinculo: e.target.value })}
              style={{ ...CAMPO, fontWeight: 700, cursor: 'pointer' }}
            >
              {VINCULOS.map((v) => <option key={v} value={v}>{VINCULO_COPY[v]}</option>)}
            </select>
          </div>
        </div>

        {registrada && (
          <div style={{ background: ADMIN.okFondo, border: `1.5px solid ${ADMIN.okBorde}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.okTexto }}>Autorización registrada</div>
            <div style={{ fontSize: 13.5, color: ADMIN.okTexto, fontWeight: 600, marginTop: 3 }}>{registrada}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={registrarAsistida} disabled={busy}
            style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '13px 26px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1, boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}
          >
            Registrar la autorización
          </button>
          <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, maxWidth: 380, lineHeight: 1.4 }}>
            Guardamos el nombre y el vínculo del adulto como constancia. No pedimos ningún documento.
          </span>
        </div>
      </div>

      {cancelar && (
        <Modal
          titulo={`Cancelar el pase de ${cancelar.alumno?.nombre ?? 'este chico'}`}
          descripcion="El link deja de funcionar y la familia no va a poder autorizar con ese pedido. Si igual se muda, se genera un pase nuevo."
          verbo="Cancelar el pase"
          verboCerrar="Dejarlo como está"
          peligro busy={busy}
          confirmar={denegar}
          onCerrar={() => setCancelar(null)}
        >
          <div style={{ background: ADMIN.okFondo, border: `1.5px solid ${ADMIN.okBorde}`, borderRadius: 14, padding: '13px 15px', fontSize: 13.5, fontWeight: 700, color: ADMIN.okTexto, lineHeight: 1.45 }}>
            El recorrido de {cancelar.alumno?.nombre ?? 'este chico'} no se toca: sigue completo en su legajo.
          </div>
        </Modal>
      )}
    </div>
  );
}
