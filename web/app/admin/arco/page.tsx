'use client';
// Derechos ARCO (Ley 25.326) — alumno golondrina, migración 0024.
// Acceso (export del legajo), Rectificación (solo identidad), Oposición
// (fuera de los agregados no esenciales) y Cancelación.
//
// La CANCELACIÓN es el único borrado físico de todo el sistema: por eso son
// DOS pasos con el dry-run a la vista y confirmación tipeada. Nada de un
// botón rojo suelto.
import { useEffect, useState } from 'react';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import {
  ERRS_ARCO, TIPO_ARCO_COPY, confirmacionValida, copyEstadoArco, lineasDelPlan,
  nombreArchivoLegajo, resumenDelPlan, seccionesDelLegajo, type ItemBorrado,
} from '@/lib/arco';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Caso = {
  id: string; alumno_id: string; tipo: string; estado: string;
  detalle: { texto?: string | null; dry_run?: ItemBorrado[] } | null;
  agregado: Record<string, unknown> | null;
  ejecutado_at: string | null; created_at: string;
};

const ERRS: Record<string, string> = { ...ERRS_ADMIN, ...ERRS_ARCO };
const copyError = (c?: string) => ERRS[c ?? ''] ?? (c?.startsWith('campo_no_rectificable')
  ? 'Solo se pueden rectificar el nombre y el avatar.' : 'Algo salió mal. Probá de nuevo.');

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
const h2: React.CSSProperties = { fontFamily: BALOO, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 4px' };
const sub: React.CSSProperties = { fontFamily: QUICK, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 14px' };

export default function AdminArco() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [alumnoId, setAlumnoId] = useState('');
  const [busy, setBusy] = useState(false);

  // Acceso
  const [legajo, setLegajo] = useState<Record<string, unknown> | null>(null);
  // Rectificación
  const [nuevoNombre, setNuevoNombre] = useState('');
  // Cancelación (2 pasos)
  const [motivo, setMotivo] = useState('');
  const [pendiente, setPendiente] = useState<{ caso_id: string; plan: ItemBorrado[] } | null>(null);
  const [tipeado, setTipeado] = useState('');

  async function cargar() {
    const r = await llamarAdmin<{ casos: Caso[] }>('admin-arco', 'casos_listar');
    if (!r.ok) { toast(copyError(r.data.error)); setCasos([]); return; }
    setCasos(r.data.casos ?? []);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const pedirAlumno = () => {
    if (!alumnoId.trim()) { toast('Poné el identificador del alumno.'); return false; }
    return true;
  };

  async function exportar() {
    if (!pedirAlumno() || busy) return;
    setBusy(true);
    const r = await llamarAdmin<{ legajo: Record<string, unknown> }>('admin-arco', 'exportar_legajo', { alumno_id: alumnoId.trim() });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setLegajo(r.data.legajo);
    toast('Legajo exportado.');
    await cargar();
  }

  function bajarJson() {
    if (!legajo) return;
    const blob = new Blob([JSON.stringify(legajo, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = nombreArchivoLegajo(alumnoId, new Date().toISOString());
    a.click();
    window.URL.revokeObjectURL(a.href);
  }

  async function rectificar() {
    if (!pedirAlumno() || busy) return;
    if (!nuevoNombre.trim()) { toast('Escribí el nombre corregido.'); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'rectificar', {
      alumno_id: alumnoId.trim(), cambios: { nombre: nuevoNombre.trim() },
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setNuevoNombre('');
    toast('Nombre rectificado. Queda el diff en el caso.');
    await cargar();
  }

  async function oponer(excluido: boolean) {
    if (!pedirAlumno() || busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'oponer', { alumno_id: alumnoId.trim(), excluido });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast(excluido
      ? 'Listo: queda fuera de los agregados no esenciales.'
      : 'Listo: vuelve a contarse en los agregados.');
    await cargar();
  }

  async function solicitarCancelacion() {
    if (!pedirAlumno() || busy) return;
    setBusy(true);
    const r = await llamarAdmin<{ caso: { id: string }; dry_run: ItemBorrado[] }>(
      'admin-arco', 'cancelacion_solicitar', { alumno_id: alumnoId.trim(), detalle_texto: motivo },
    );
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setPendiente({ caso_id: r.data.caso.id, plan: r.data.dry_run ?? [] });
    setTipeado('');
    await cargar();
  }

  async function confirmarCancelacion() {
    if (!pendiente || busy) return;
    if (!confirmacionValida(tipeado, 'BORRAR')) { toast('Escribí BORRAR para confirmar.'); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'cancelacion_confirmar', { caso_id: pendiente.caso_id });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setPendiente(null); setTipeado(''); setAlumnoId(''); setMotivo(''); setLegajo(null);
    toast('Cancelación ejecutada. Solo queda el agregado anónimo y la auditoría.');
    await cargar();
  }

  async function rechazarCancelacion(casoId: string) {
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'cancelacion_rechazar', { caso_id: casoId });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Caso rechazado.');
    await cargar();
  }

  const secciones = legajo ? seccionesDelLegajo(legajo) : [];

  return (
    <div style={{ padding: '26px 28px', maxWidth: 1000 }}>
      {/* El "PDF" del MVP: la vista del legajo se ve en pantalla como previa y
          al imprimir queda ella sola (window.print(), cero dependencias). */}
      <style>{`@media print {
        .no-print { display: none !important; }
        .legajo-vista { display: block !important; }
        body { background: #fff; }
      }`}</style>

      <div className="no-print">
        <h1 style={{ fontFamily: BALOO, fontSize: 27, color: ADMIN.oscuro, margin: '0 0 4px' }}>
          Derechos ARCO
        </h1>
        <p style={{ ...sub, fontSize: 14.5, marginBottom: 20 }}>
          Acceso, rectificación, cancelación y oposición (Ley 25.326). Los datos del chico son de su
          familia: EDUTIA solo los custodia.
        </p>

        <section style={card}>
          <h2 style={h2}>Alumno</h2>
          <p style={sub}>Todas las acciones de abajo trabajan sobre este identificador.</p>
          <input
            value={alumnoId} placeholder="UUID del alumno"
            onChange={(e) => setAlumnoId(e.target.value.trim())} style={inputStyle}
          />
        </section>

        {/* ── Acceso ─────────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Acceso: exportar el legajo</h2>
          <p style={sub}>Todo lo que EDUTIA sabe del chico, para entregárselo a la familia.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...btnSm, background: ADMIN.claro, color: ADMIN.oscuro }} onClick={exportar} disabled={busy}>
              Exportar
            </button>
            {legajo ? (
              <>
                <button style={btnSm} onClick={bajarJson}>Bajar JSON</button>
                <button style={btnSm} onClick={() => window.print()}>Versión imprimible</button>
              </>
            ) : null}
          </div>
        </section>

        {/* ── Rectificación ──────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Rectificación</h2>
          <p style={sub}>
            Solo la identidad (nombre y avatar). El recorrido de aprendizaje son hechos que pasaron:
            no se rectifica.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={labelStyle}>Nombre corregido</label>
              <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} style={inputStyle} />
            </div>
            <button style={{ ...btnSm, background: ADMIN.claro, color: ADMIN.oscuro }} onClick={rectificar} disabled={busy}>
              Rectificar
            </button>
          </div>
        </section>

        {/* ── Oposición ──────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Oposición</h2>
          <p style={sub}>
            El chico queda fuera del observatorio y de todo agregado no esencial. No afecta su
            práctica ni lo que ve su maestra.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...btnSm, background: ADMIN.claro, color: ADMIN.oscuro }} onClick={() => oponer(true)} disabled={busy}>
              Excluir de los agregados
            </button>
            <button style={btnSm} onClick={() => oponer(false)} disabled={busy}>Volver a incluir</button>
          </div>
        </section>

        {/* ── Cancelación ────────────────────────────────────────────── */}
        <section style={{ ...card, border: `1.5px solid ${ADMIN.dangerBorde}` }}>
          <h2 style={{ ...h2, color: ADMIN.danger }}>Cancelación</h2>
          <p style={sub}>
            <strong>Es el único borrado real de todo el sistema y no se puede deshacer.</strong> Se borra
            el legajo entero y los boletines. Solo quedan un resumen anónimo (sin nombre ni
            identificadores) y el registro de auditoría. La confirma únicamente el super-admin.
          </p>

          {!pendiente ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={labelStyle}>Motivo del pedido</label>
                <input
                  value={motivo} placeholder="Quién lo pidió y cuándo"
                  onChange={(e) => setMotivo(e.target.value)} style={inputStyle}
                />
              </div>
              <button
                style={{ ...btnSm, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}
                onClick={solicitarCancelacion} disabled={busy}
              >Ver qué se borraría</button>
            </div>
          ) : (
            <div style={{ background: '#FBEFD9', border: `1.5px solid ${ADMIN.warnBorde}`, borderRadius: 12, padding: 16 }}>
              <p style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.warnTexto, margin: '0 0 8px' }}>
                {resumenDelPlan(pendiente.plan)}
              </p>
              <ul style={{ margin: '0 0 14px', paddingLeft: 20, fontFamily: QUICK, fontSize: 14, color: ADMIN.warnTexto }}>
                {lineasDelPlan(pendiente.plan).map((l) => <li key={l}>{l}</li>)}
              </ul>
              <label style={labelStyle}>Para confirmar, escribí BORRAR</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={tipeado} onChange={(e) => setTipeado(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 220 }}
                />
                <button
                  style={{
                    ...btnSm, background: ADMIN.danger, color: '#fff', borderColor: ADMIN.danger,
                    opacity: confirmacionValida(tipeado, 'BORRAR') ? 1 : .5,
                  }}
                  onClick={confirmarCancelacion} disabled={busy}
                >Borrar para siempre</button>
                <button style={btnSm} onClick={() => { setPendiente(null); setTipeado(''); }}>Cancelar</button>
              </div>
            </div>
          )}
        </section>

        {/* ── Casos ──────────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Casos</h2>
          <p style={sub}>Todo pedido queda registrado, incluso después de borrar al alumno.</p>
          {casos.length === 0 ? (
            <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Todavía no hay casos.</p>
          ) : casos.map((c) => {
            const e = copyEstadoArco(c.estado);
            const t = TIPO_ARCO_COPY[c.tipo];
            return (
              <div key={c.id} style={{
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                padding: '11px 0', borderTop: `1px solid ${ADMIN.bordeCalido}`,
              }}>
                <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink, minWidth: 120 }}>
                  {t?.titulo ?? c.tipo}
                </span>
                <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2, flex: 1, minWidth: 180 }}>
                  {c.alumno_id.slice(0, 8)}… · {c.created_at.slice(0, 10)}
                  {c.agregado ? ' · solo queda el resumen anónimo' : ''}
                </span>
                <span style={{
                  fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: '#fff',
                  background: e.color, borderRadius: 999, padding: '4px 12px',
                }}>{e.copy}</span>
                {c.tipo === 'cancelacion' && (c.estado === 'solicitado' || c.estado === 'confirmado') ? (
                  <button style={btnSm} onClick={() => rechazarCancelacion(c.id)} disabled={busy}>Rechazar</button>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>

      {/* ── Vista imprimible del legajo ──────────────────────────────── */}
      {legajo ? (
        <div className="legajo-vista" style={{ marginTop: 24 }}>
          <h2 style={{ fontFamily: BALOO, fontSize: 22, color: ADMIN.ink, margin: '0 0 4px' }}>
            Legajo del alumno · EDUTIA
          </h2>
          <p style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2, margin: '0 0 16px' }}>
            Emitido el {new Date().toLocaleDateString('es-AR')} en respuesta a un pedido de acceso
            (Ley 25.326).
          </p>
          {secciones.map((s) => (
            <div key={s.titulo} style={{ marginBottom: 18, breakInside: 'avoid' }}>
              <h3 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15.5, color: ADMIN.oscuro, margin: '0 0 6px' }}>
                {s.titulo}
              </h3>
              {s.vacio ? (
                <p style={{ fontFamily: QUICK, fontSize: 13.5, color: ADMIN.tinta2, margin: 0 }}>Sin datos.</p>
              ) : s.filas.map((f, i) => (
                <div key={`${s.titulo}-${i}`} style={{
                  display: 'flex', gap: 10, padding: '5px 0',
                  borderBottom: `1px solid ${ADMIN.bordeCalido}`, fontFamily: NUNITO, fontSize: 13.5,
                }}>
                  <span style={{ color: ADMIN.tinta2, minWidth: 170 }}>{f.etiqueta}</span>
                  <span style={{ color: ADMIN.ink }}>{f.valor}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
