'use client';
// Derechos de la familia — ARCO (Ley 25.326), alumno golondrina migración 0024.
// Restyle 2026-08 al mock Admin.dc.html: una tarjeta por derecho (Acceso,
// Rectificación, Oposición), la Cancelación aparte y en dos pasos numerados, y
// el legajo como hoja A4 lista para imprimir y entregar.
//
// La CANCELACIÓN es el único borrado físico de todo el sistema: por eso son
// DOS pasos con el dry-run a la vista y confirmación tipeada. Nada de un botón
// rojo suelto. Confirmar es solo del super — lo corta la fn, no el menú.
import { useEffect, useState } from 'react';
import { llamarAdmin, ERRS_ADMIN, ERRS_RED_ADMIN } from '@/lib/admin/api';
import {
  ADMIN, CAMPO, ETIQUETA, ESTADO_ALUMNO_PILL, ESTADO_ARCO_PILL, TIPO_ARCO_PILL,
} from '@/lib/admin/tema';
import { animal } from '@/lib/art';
import { toast } from '@/lib/toast';
import Pill from '@/components/admin/Pill';
import { useAdmin } from '../admin-context';
import {
  ERRS_ARCO, TIPO_ARCO_COPY, confirmacionValida, lineasDelPlan,
  nombreArchivoLegajo, resumenAnonimo, seccionesDelLegajo, type ItemBorrado,
} from '@/lib/arco';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Los cinco avatares reales de la app (web/lib/art.ts). La rectificación de
// identidad solo puede tocar nombre y avatar: nada más es "un dato mal
// cargado", el resto son hechos que pasaron.
const AVATARES = ['fox', 'owl', 'turtle', 'cat', 'sheep'] as const;

type Caso = {
  id: string; alumno_id: string; tipo: string; estado: string;
  detalle: { texto?: string | null; dry_run?: ItemBorrado[] } | null;
  agregado: Record<string, unknown> | null;
  ejecutado_at: string | null; created_at: string;
};
type Legajo = Record<string, unknown>;

const ERRS: Record<string, string> = { ...ERRS_ADMIN, ...ERRS_ARCO, ...ERRS_RED_ADMIN };
const copyError = (c?: string) => ERRS[c ?? ''] ?? (c?.startsWith('campo_no_rectificable')
  ? 'Solo se pueden rectificar el nombre y el avatar.' : 'Algo salió mal. Probá de nuevo.');

const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
};
const rotulo: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 800, color: ADMIN.tinta3, letterSpacing: '1.2px', marginBottom: 6,
};
const tituloCarta: React.CSSProperties = {
  fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.ink, margin: '0 0 6px',
};
const bajada: React.CSSProperties = {
  fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 16px', lineHeight: 1.45,
};
const btnPetroleo: React.CSSProperties = {
  background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px',
  fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999,
  padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
};

const hoy = () => new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function AdminArco() {
  const me = useAdmin();
  const esSuper = me?.nivel === 'super';

  const [casos, setCasos] = useState<Caso[]>([]);
  const [alumnoId, setAlumnoId] = useState('');
  const [legajo, setLegajo] = useState<Legajo | null>(null);
  const [hoja, setHoja] = useState(false);
  const [busy, setBusy] = useState(false);

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [avatar, setAvatar] = useState('');
  const [diff, setDiff] = useState('');

  const [motivo, setMotivo] = useState('');
  const [pendiente, setPendiente] = useState<{ caso_id: string; plan: ItemBorrado[] } | null>(null);
  const [tipeado, setTipeado] = useState('');

  async function cargarCasos() {
    const r = await llamarAdmin<{ casos: Caso[] }>('admin-arco', 'casos_listar');
    if (!r.ok) { toast(copyError(r.data.error)); setCasos([]); return; }
    setCasos(r.data.casos ?? []);
  }
  useEffect(() => { cargarCasos(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const perfil = (legajo?.perfil ?? null) as Record<string, unknown> | null;
  const nombre = typeof perfil?.nombre === 'string' ? perfil.nombre : '';
  const excluido = perfil?.excluido_procesamiento === true;
  const secciones = legajo ? seccionesDelLegajo(legajo) : [];

  // Colegio y adulto responsable salen del propio legajo: la última matrícula y
  // el último consentimiento registrado. No hay otra fuente (el admin de
  // plataforma no lee `perfil` desde el cliente).
  const arr = (k: string): Record<string, unknown>[] => {
    const v = legajo?.[k];
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  };
  const ultimaMatricula = arr('matriculas').at(-1);
  const ultimoConsentimiento = arr('consentimientos').at(-1);

  function limpiar() {
    setLegajo(null); setHoja(false); setNuevoNombre(''); setAvatar(''); setDiff('');
    setPendiente(null); setTipeado(''); setMotivo('');
  }

  const pedirAlumno = () => {
    if (!alumnoId.trim()) { toast('Poné el identificador del alumno.'); return false; }
    return true;
  };

  async function exportar() {
    if (!pedirAlumno() || busy) return;
    setBusy(true);
    const r = await llamarAdmin<{ legajo: Legajo }>('admin-arco', 'exportar_legajo', { alumno_id: alumnoId.trim() });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    const l = r.data.legajo;
    setLegajo(l);
    const p = (l?.perfil ?? {}) as Record<string, unknown>;
    setNuevoNombre(typeof p.nombre === 'string' ? p.nombre : '');
    setAvatar(typeof p.avatar === 'string' ? p.avatar : '');
    toast('Legajo cargado.');
    await cargarCasos();
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
    const cambios: Record<string, string> = {};
    if (nuevoNombre.trim() && nuevoNombre.trim() !== nombre) cambios.nombre = nuevoNombre.trim();
    if (avatar && avatar !== perfil?.avatar) cambios.avatar = avatar;
    if (Object.keys(cambios).length === 0) { toast('No cambiaste nada todavía.'); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'rectificar', { alumno_id: alumnoId.trim(), cambios });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setDiff(cambios.nombre ? `Nombre: «${nombre}» → «${cambios.nombre}»` : `Avatar: «${perfil?.avatar}» → «${cambios.avatar}»`);
    // El legajo se parchea en memoria a propósito: `exportar_legajo` REGISTRA un
    // caso ARCO de acceso cada vez que se llama, así que refrescar por ahí
    // inventaría pedidos de acceso que la familia nunca hizo.
    setLegajo({ ...legajo, perfil: { ...perfil, ...cambios } });
    toast('Corrección guardada. Queda el diff en el caso.');
    await cargarCasos();
  }

  async function oponer(valor: boolean) {
    if (!pedirAlumno() || busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'oponer', { alumno_id: alumnoId.trim(), excluido: valor });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    // Mismo motivo que en rectificar: no se re-exporta el legajo, se parchea.
    setLegajo({ ...legajo, perfil: { ...perfil, excluido_procesamiento: valor } });
    toast(valor ? 'Listo: queda fuera de los agregados.' : 'Listo: vuelve a contarse en los agregados.');
    await cargarCasos();
  }

  async function verQueSeBorraria() {
    if (!pedirAlumno() || busy) return;
    setBusy(true);
    const r = await llamarAdmin<{ caso: { id: string }; dry_run: ItemBorrado[] }>(
      'admin-arco', 'cancelacion_solicitar', { alumno_id: alumnoId.trim(), detalle_texto: motivo },
    );
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setPendiente({ caso_id: r.data.caso.id, plan: r.data.dry_run ?? [] });
    setTipeado('');
    await cargarCasos();
  }

  async function borrarParaSiempre() {
    if (!pendiente || busy) return;
    if (!confirmacionValida(tipeado, 'BORRAR')) { toast('Escribí BORRAR para confirmar.'); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'cancelacion_confirmar', { caso_id: pendiente.caso_id });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setAlumnoId('');
    limpiar();
    toast('Cancelación ejecutada. Solo queda el agregado anónimo y la auditoría.');
    await cargarCasos();
  }

  async function rechazar(casoId: string) {
    if (busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-arco', 'cancelacion_rechazar', { caso_id: casoId });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    if (pendiente?.caso_id === casoId) { setPendiente(null); setTipeado(''); }
    toast('Pedido rechazado. Queda asentado igual.');
    await cargarCasos();
  }

  // ── Hoja A4 del legajo ────────────────────────────────────────────────────
  if (hoja && legajo) {
    return (
      <div>
        <style>{`@media print {
          [data-noprint] { display: none !important; }
          body { background: #fff !important; }
          [data-hoja] { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; }
        }`}</style>
        <div data-noprint style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
          <button
            onClick={() => setHoja(false)}
            style={{ background: 'none', border: 'none', color: ADMIN.tinta2, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', padding: 0 }}
          >
            ‹ Derechos de la familia
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 700 }}>
            Así se imprime y se le entrega a la familia · A4
          </span>
          <button
            onClick={() => window.print()}
            style={{ ...btnPetroleo, padding: '11px 24px', fontSize: 14, boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}
          >
            Imprimir
          </button>
        </div>

        <div
          data-hoja
          style={{ width: 794, maxWidth: '100%', margin: '0 auto', background: '#fff', border: `1px solid ${ADMIN.chipBorde}`, boxShadow: '0 10px 30px rgba(120,90,40,.12)', padding: '52px 56px', fontFamily: NUNITO, color: ADMIN.ink }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, borderBottom: `2px solid ${ADMIN.ink}`, paddingBottom: 16, marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 26, lineHeight: 1.1 }}>Legajo del alumno · EDUTIA</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#5A5145', marginTop: 6 }}>Emitido el {hoy()}</div>
            </div>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: ADMIN.base, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: BALOO, fontWeight: 800, fontSize: 26, flexShrink: 0 }}>E</div>
          </div>
          <p style={{ fontSize: 15, color: '#5A5145', fontWeight: 600, margin: '0 0 26px', lineHeight: 1.5 }}>
            Copia entregada a la familia en ejercicio del derecho de acceso (ley 25.326 de protección de
            datos personales). EDUTIA no registra documentos ni identificadores estatales de los chicos.
          </p>
          {secciones.map((s) => (
            <div key={s.titulo} style={{ marginBottom: 26, breakInside: 'avoid' }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: ADMIN.oscuro, borderBottom: '1px solid #D9CDB6', paddingBottom: 6, marginBottom: 12 }}>
                {s.titulo}
              </div>
              {s.vacio ? (
                <div style={{ fontSize: 16, color: '#5A5145', fontWeight: 600, padding: '7px 0' }}>Sin datos.</div>
              ) : s.filas.map((f, i) => (
                <div key={`${s.titulo}-${i}`} style={{ display: 'flex', gap: 18, padding: '7px 0', fontSize: 16, lineHeight: 1.45 }}>
                  <span style={{ minWidth: 190, color: '#5A5145', fontWeight: 700 }}>{f.etiqueta}</span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{f.valor}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ borderTop: '1px solid #D9CDB6', paddingTop: 14, fontSize: 15, color: '#5A5145', fontWeight: 600, lineHeight: 1.5 }}>
            Si algo de este legajo no es correcto, la familia puede pedir que se corrija su identidad, que
            el chico salga de los reportes agregados o que se borre todo. Se pide en la escuela.
          </div>
        </div>
      </div>
    );
  }

  const listo = !!legajo;

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' }}>
        Derechos de la familia
      </h1>
      <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 20px', maxWidth: 720, textWrap: 'pretty' }}>
        Ley 25.326 de protección de datos personales. Los pedidos los hace un adulto responsable de la
        familia; acá se ejecutan y queda constancia de todo.
      </p>

      {/* ── Sobre quién es el pedido ─────────────────────────────────────── */}
      <div style={{ ...carta, padding: '20px 22px', marginBottom: 18, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          {/* Sin lista de chicos a propósito: el panel de plataforma no tiene
              lectura sobre `perfil`. El identificador lo trae la escuela con el
              pedido de la familia. */}
          <label style={ETIQUETA}>¿Sobre qué chico o chica es el pedido? (identificador)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={alumnoId} placeholder="UUID del alumno"
              onChange={(e) => { setAlumnoId(e.target.value.trim()); limpiar(); }}
              style={{ ...CAMPO, flex: 1, minWidth: 220, width: 'auto', fontSize: 15, fontWeight: 700 }}
            />
            <button onClick={exportar} disabled={busy} style={btnPetroleo}>
              {busy ? 'Buscando…' : 'Traer el legajo'}
            </button>
          </div>
          {/* Traer el legajo ES el derecho de acceso: la fn deja el caso
              registrado. Que el operador sepa que no es una consulta gratis. */}
          <div style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 600, marginTop: 6 }}>
            Traerlo queda asentado como un pedido de acceso de la familia.
          </div>
        </div>
        {listo && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tupla={ESTADO_ALUMNO_PILL[String(perfil?.estado ?? '')]} />
            {ultimaMatricula?.escuela != null && (
              <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '5px 13px', fontSize: 12.5, fontWeight: 800 }}>
                {String(ultimaMatricula.escuela)}
              </span>
            )}
            {ultimoConsentimiento?.adulto_nombre != null && (
              <span style={{ background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '5px 13px', fontSize: 12.5, fontWeight: 800 }}>
                Adulto: {String(ultimoConsentimiento.adulto_nombre)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Acceso / Rectificación / Oposición ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 18, alignItems: 'start', marginBottom: 18, opacity: listo ? 1 : .55, pointerEvents: listo ? 'auto' : 'none' }}>
        <div style={carta}>
          <div style={rotulo}>ACCESO</div>
          <h2 style={tituloCarta}>Entregar el legajo completo</h2>
          <p style={bajada}>
            Todo lo que EDUTIA guarda de {nombre || 'este chico'}, en el formato que la familia prefiera.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={bajarJson} style={btnPetroleo}>Bajar JSON</button>
            <button onClick={() => setHoja(true)} className="ad-ghost" style={btnGhost}>Versión imprimible</button>
          </div>
        </div>

        <div style={carta}>
          <div style={rotulo}>RECTIFICACIÓN</div>
          <h2 style={tituloCarta}>Corregir la identidad</h2>
          <p style={{ ...bajada, marginBottom: 14 }}>
            Solo nombre y avatar. El resto del legajo son hechos que pasaron: no se rectifican.
          </p>
          <label style={ETIQUETA}>Nombre</label>
          <input
            value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
            style={{ ...CAMPO, padding: '11px 13px', marginBottom: 12 }}
          />
          <label style={ETIQUETA}>Avatar</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {AVATARES.map((a) => (
              <button
                key={a} onClick={() => setAvatar(a)} title={a}
                style={{
                  width: 46, height: 46, borderRadius: 14, cursor: 'pointer', padding: 3,
                  background: avatar === a ? ADMIN.burbuja : ADMIN.suave,
                  border: `2px solid ${avatar === a ? ADMIN.base : ADMIN.bordeCalido}`,
                }}
              >
                <span style={{ display: 'block', width: '100%', height: '100%', background: `${animal(a)} center/contain no-repeat` }} />
              </button>
            ))}
          </div>
          <button onClick={rectificar} disabled={busy} style={btnPetroleo}>Guardar corrección</button>
          {diff && (
            <div style={{ background: ADMIN.burbuja, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 14, padding: '13px 15px', marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: ADMIN.oscuro, letterSpacing: '.6px', marginBottom: 5 }}>QUEDÓ REGISTRADO</div>
              <div style={{ fontSize: 13.5, color: ADMIN.oscuro, fontWeight: 700, lineHeight: 1.45 }}>{diff}</div>
            </div>
          )}
        </div>

        <div style={carta}>
          <div style={rotulo}>OPOSICIÓN</div>
          <h2 style={tituloCarta}>Salir de los agregados</h2>
          <p style={bajada}>
            {nombre || 'El chico'} deja de contarse en el observatorio y en los reportes. No afecta su
            práctica ni lo que ve su maestra.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: ADMIN.suave, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink }}>Excluir del observatorio</div>
              <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>
                {excluido ? 'Excluido: no entra en ningún agregado' : 'Hoy entra en los agregados anónimos'}
              </div>
            </div>
            <button
              onClick={() => oponer(!excluido)} disabled={busy}
              aria-label={excluido ? 'Volver a incluir en los agregados' : 'Excluir de los agregados'}
              style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: excluido ? ADMIN.base : ADMIN.switchOff, position: 'relative', flexShrink: 0, padding: 0 }}
            >
              <span style={{ position: 'absolute', top: 3, left: excluido ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: ADMIN.carta, transition: 'left .15s ease', boxShadow: '0 1px 4px rgba(58,51,42,.25)' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Cancelación: el único borrado real ──────────────────────────── */}
      <div style={{ ...carta, border: `2px solid ${ADMIN.dangerBorde}`, padding: 26, marginBottom: 18, maxWidth: 900, opacity: listo ? 1 : .55, pointerEvents: listo ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ ...rotulo, color: ADMIN.danger, marginBottom: 0 }}>CANCELACIÓN</div>
          <span style={{ background: ADMIN.dangerFondo, border: `1px solid ${ADMIN.dangerBorde}`, color: ADMIN.danger, borderRadius: 999, padding: '3px 11px', fontSize: 11, fontWeight: 800 }}>
            Único borrado real del sistema
          </span>
        </div>
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink, margin: '0 0 6px' }}>
          Borrar el legajo de {nombre || 'este chico'}
        </h2>
        <p style={{ fontSize: 14, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 20px', maxWidth: 640, lineHeight: 1.5, textWrap: 'pretty' }}>
          Es un derecho de la familia y lo ejecutamos. Después de esto no queda nada del chico: solo un
          resumen anónimo, sin nombre ni identificadores, y el registro de este pedido.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={paso(true)}>1</span>
              <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink }}>Ver qué se borraría</span>
            </div>
            {!pendiente ? (
              <>
                <label style={ETIQUETA}>Motivo del pedido</label>
                <input
                  value={motivo} placeholder="Quién lo pidió y cuándo"
                  onChange={(e) => setMotivo(e.target.value)}
                  style={{ ...CAMPO, marginBottom: 12 }}
                />
                <button
                  onClick={verQueSeBorraria} disabled={busy} className="ad-ghost-danger"
                  style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.dangerBorde}`, color: ADMIN.danger, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
                >
                  Ver qué se borraría
                </button>
              </>
            ) : (
              <div style={{ background: ADMIN.dangerFondo, border: `1.5px solid ${ADMIN.dangerBorde}`, borderRadius: 16, padding: '16px 18px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: ADMIN.danger, marginBottom: 10 }}>
                  Se van a borrar para siempre:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {lineasDelPlan(pendiente.plan).length === 0 ? (
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: ADMIN.ink }}>El legajo ya está vacío.</div>
                  ) : lineasDelPlan(pendiente.plan).map((l) => (
                    <div key={l} style={{ fontSize: 13.5, fontWeight: 700, color: ADMIN.ink }}>{l}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ opacity: pendiente ? 1 : .45, pointerEvents: pendiente ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={paso(!!pendiente)}>2</span>
              <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink }}>Confirmar el borrado</span>
            </div>
            {esSuper ? (
              <>
                <label style={ETIQUETA}>Escribí BORRAR para confirmar</label>
                <input
                  value={tipeado} placeholder="BORRAR"
                  onChange={(e) => setTipeado(e.target.value)}
                  style={{ ...CAMPO, maxWidth: 220, border: `2px solid ${ADMIN.dangerBorde}`, fontWeight: 800, letterSpacing: 2, fontSize: 15, marginBottom: 14 }}
                />
                <div>
                  <button
                    onClick={borrarParaSiempre} disabled={busy}
                    style={{
                      background: confirmacionValida(tipeado, 'BORRAR') ? ADMIN.danger : ADMIN.dangerBorde,
                      color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px',
                      fontFamily: QUICK, fontWeight: 700, fontSize: 14,
                      cursor: confirmacionValida(tipeado, 'BORRAR') ? 'pointer' : 'not-allowed',
                      boxShadow: confirmacionValida(tipeado, 'BORRAR') ? '0 6px 16px rgba(187,79,63,.3)' : 'none',
                    }}
                  >
                    Borrar para siempre
                  </button>
                </div>
              </>
            ) : (
              <div style={{ background: ADMIN.hover, border: `1.5px solid ${ADMIN.chipBorde}`, borderRadius: 14, padding: '14px 16px', fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 700, lineHeight: 1.45 }}>
                Este paso lo confirma solo el super-admin. El pedido ya quedó asentado: avisale al equipo.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pedidos registrados ──────────────────────────────────────────── */}
      <div style={{ ...carta, maxWidth: 900 }}>
        <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 4px' }}>
          Pedidos registrados
        </h2>
        <p style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 12px' }}>
          Los pedidos de chicos ya borrados siguen acá: del chico no queda nada, solo la constancia del pedido.
        </p>
        {casos.length === 0 ? (
          <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2, margin: 0 }}>Todavía no hay pedidos.</p>
        ) : casos.map((c) => {
          const borrado = !!c.agregado;
          return (
            <div
              key={c.id}
              style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '13px 0', borderBottom: `1px solid ${ADMIN.divisor}`, background: borrado ? ADMIN.suave : 'transparent' }}
            >
              <Pill tupla={TIPO_ARCO_PILL[c.tipo] ?? ['#F6EFDF', '#7A6F5F', TIPO_ARCO_COPY[c.tipo]?.titulo ?? c.tipo]} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: borrado ? ADMIN.neutroTexto : ADMIN.ink, fontStyle: borrado ? 'italic' : 'normal' }}>
                  {borrado
                    ? `Sin datos · caso #${c.alumno_id.slice(0, 8)} — del chico ya no queda nada`
                    : `Alumno ${c.alumno_id.slice(0, 8)}…`}
                </div>
                <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
                  {/* De un caso ejecutado se muestra el agregado anónimo: es
                      literalmente todo lo que sobrevivió al borrado. */}
                  {borrado ? resumenAnonimo(c.agregado) : (c.detalle?.texto || TIPO_ARCO_COPY[c.tipo]?.detalle || '')}
                </div>
              </div>
              <Pill tupla={ESTADO_ARCO_PILL[c.estado]} />
              <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700, minWidth: 88, textAlign: 'right' }}>
                {c.created_at.slice(0, 10)}
              </span>
              {/* No está en el mock, pero es conducta que ya existía: un pedido
                  de cancelación mal encaminado se rechaza y queda asentado. */}
              {c.tipo === 'cancelacion' && (c.estado === 'solicitado' || c.estado === 'confirmado') && (
                <button
                  onClick={() => rechazar(c.id)} disabled={busy} className="ad-ghost-warm"
                  style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2, borderRadius: 999, padding: '7px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Rechazar
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Círculo numerado de los dos pasos de la cancelación: apagado hasta que el
// paso anterior se cumplió.
function paso(activo: boolean): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: '50%',
    background: activo ? ADMIN.dangerFondo : ADMIN.neutroFondo,
    color: activo ? ADMIN.danger : ADMIN.neutroTexto,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: QUICK, fontWeight: 800, fontSize: 13, flexShrink: 0,
  };
}
