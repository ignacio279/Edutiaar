'use client';
// Anuncios (Dashboard admin v3, WP8): el admin publica avisos que las maestras
// ven como banner in-app (AnuncioBanner). Alcance global o por colegio,
// vigencia opcional desde/hasta, activar/desactivar, edición inline y borrado
// con confirmación simple. Toda la escritura pasa por la Edge Function
// admin-anuncios (service_role + auditoría); acá solo UI + lecturas públicas
// (escuela_publica para el select de alcance — cero dependencia de otros WP).
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import Pill from '@/components/admin/Pill';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Anuncio = {
  id: string;
  titulo: string;
  cuerpo: string;
  escuela_id: string | null;
  escuela_nombre: string | null;
  activo: boolean;
  desde: string | null;
  hasta: string | null;
  created_at: string;
};
type EscuelaOpcion = { id: string; nombre: string };

type Form = { titulo: string; cuerpo: string; escuela_id: string; desde: string; hasta: string };
const FORM_VACIO: Form = { titulo: '', cuerpo: '', escuela_id: '', desde: '', hasta: '' };

const PILL_ACTIVO: readonly [string, string, string] = [ADMIN.okFondo, ADMIN.okTexto, 'Activo'];
const PILL_INACTIVO: readonly [string, string, string] = [ADMIN.neutroFondo, ADMIN.neutroTexto, 'Inactivo'];

// Copys locales sobre los códigos de admin-anuncios (se suman a ERRS_ADMIN).
const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  titulo_vacio: 'Poné un título.',
  titulo_largo: 'El título es muy largo (máximo 120 caracteres).',
  cuerpo_vacio: 'Escribí el texto del anuncio.',
  cuerpo_largo: 'El texto es muy largo (máximo 500 caracteres).',
  desde_invalida: 'La fecha "desde" no es válida.',
  hasta_invalida: 'La fecha "hasta" no es válida.',
  fechas_invertidas: 'La fecha "hasta" tiene que ser posterior a "desde".',
  escuela_invalida: 'Ese colegio no existe.',
  no_encontrado: 'Ese anuncio ya no existe. Actualizá la lista.',
};
const copyError = (codigo?: string) => ERRS[codigo ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

// Espejo chiquito de estaVigente (validar.ts de admin-anuncios): ¿se muestra hoy?
function vigenteHoy(a: Anuncio, now: Date): boolean {
  if (!a.activo) return false;
  const t = now.getTime();
  if (a.desde && new Date(a.desde).getTime() > t) return false;
  if (a.hasta && new Date(a.hasta).getTime() < t) return false;
  return true;
}

const fFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

function textoVigencia(a: Anuncio): string {
  const d = fFecha(a.desde);
  const h = fFecha(a.hasta);
  if (d && h) return `Del ${d} al ${h}`;
  if (d) return `Desde el ${d}`;
  if (h) return `Hasta el ${h}`;
  return 'Sin vencimiento';
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6,
};
const btnSm: React.CSSProperties = {
  background: ADMIN.carta, color: ADMIN.oscuro, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 999,
  padding: '7px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};
const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
};

// Campos compartidos por el alta y la edición inline.
function CamposAnuncio({ form, setForm, escuelas }: {
  form: Form; setForm: (f: Form) => void; escuelas: EscuelaOpcion[];
}) {
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Título</label>
        <input
          value={form.titulo} maxLength={120} placeholder="Ej: Mantenimiento el sábado"
          onChange={(e) => setForm({ ...form, titulo: e.target.value })} style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Cuerpo</label>
          <span style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700 }}>{form.cuerpo.length}/500</span>
        </div>
        <textarea
          value={form.cuerpo} maxLength={500} placeholder="Lo que van a leer las maestras en el banner."
          onChange={(e) => setForm({ ...form, cuerpo: e.target.value })}
          style={{ ...inputStyle, minHeight: 80, padding: '12px 14px', resize: 'vertical', lineHeight: 1.45, margin: '6px 0 0' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Alcance</label>
        <select
          value={form.escuela_id}
          onChange={(e) => setForm({ ...form, escuela_id: e.target.value })}
          style={{ ...inputStyle, fontWeight: 700, cursor: 'pointer' }}
        >
          <option value="">Todos los colegios</option>
          {escuelas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Desde (opcional)</label>
          <input
            type="date" value={form.desde}
            onChange={(e) => setForm({ ...form, desde: e.target.value })} style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Hasta (opcional)</label>
          <input
            type="date" value={form.hasta}
            onChange={(e) => setForm({ ...form, hasta: e.target.value })} style={inputStyle}
          />
        </div>
      </div>
    </>
  );
}

export default function AnunciosAdmin() {
  const [anuncios, setAnuncios] = useState<Anuncio[] | null>(null);
  const [escuelas, setEscuelas] = useState<EscuelaOpcion[]>([]);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdit, setFormEdit] = useState<Form>(FORM_VACIO);
  const [busy, setBusy] = useState(false);

  async function cargar() {
    const r = await llamarAdmin<{ anuncios: Anuncio[] }>('admin-anuncios', 'listar');
    if (!r.ok) { toast(copyError(r.data.error)); setAnuncios([]); return; }
    setAnuncios(r.data.anuncios ?? []);
  }

  useEffect(() => {
    cargar();
    (async () => {
      // Vista pública mínima (0018): id + nombre alcanzan para el select.
      const supabase = createClient();
      const { data } = await supabase.from('escuela_publica').select('id, nombre').order('nombre');
      setEscuelas((data as EscuelaOpcion[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear() {
    if (busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-anuncios', 'crear', {
      titulo: form.titulo, cuerpo: form.cuerpo, escuela_id: form.escuela_id || null,
      desde: form.desde || null, hasta: form.hasta || null,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setForm(FORM_VACIO);
    toast('Anuncio publicado');
    await cargar();
  }

  function empezarEdicion(a: Anuncio) {
    setEditandoId(a.id);
    setFormEdit({
      titulo: a.titulo, cuerpo: a.cuerpo, escuela_id: a.escuela_id ?? '',
      desde: a.desde ? a.desde.slice(0, 10) : '', hasta: a.hasta ? a.hasta.slice(0, 10) : '',
    });
  }

  async function guardarEdicion() {
    if (busy || !editandoId) return;
    setBusy(true);
    const r = await llamarAdmin('admin-anuncios', 'editar', {
      anuncio_id: editandoId,
      titulo: formEdit.titulo, cuerpo: formEdit.cuerpo, escuela_id: formEdit.escuela_id || null,
      desde: formEdit.desde || null, hasta: formEdit.hasta || null,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setEditandoId(null);
    toast('Anuncio actualizado');
    await cargar();
  }

  async function alternar(a: Anuncio) {
    if (busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-anuncios', a.activo ? 'desactivar' : 'activar', { anuncio_id: a.id });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast(a.activo ? 'Anuncio desactivado' : 'Anuncio activado');
    await cargar();
  }

  async function borrar(a: Anuncio) {
    if (busy) return;
    if (!window.confirm(`¿Borrar el anuncio "${a.titulo}"? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    const r = await llamarAdmin('admin-anuncios', 'borrar', { anuncio_id: a.id });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Anuncio borrado');
    await cargar();
  }

  const now = new Date();

  const incompleto = busy || !form.titulo.trim() || !form.cuerpo.trim();

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' }}>Anuncios</h1>
      <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px' }}>
        Avisos que las maestras ven como banner al entrar. Podés apuntarlos a un colegio o a todos, con vigencia opcional.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
        {/* ── Alta + preview ── */}
        <div style={carta}>
          <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 16px' }}>Nuevo anuncio</h2>
          <CamposAnuncio form={form} setForm={setForm} escuelas={escuelas} />
          <button
            onClick={crear}
            disabled={incompleto}
            className={incompleto ? undefined : 'ed-primary'}
            style={{
              background: incompleto ? ADMIN.borde : ADMIN.base,
              color: '#fff', border: 'none', borderRadius: 999, padding: '12px 28px',
              fontFamily: QUICK, fontWeight: 700, fontSize: 15,
              cursor: incompleto ? 'not-allowed' : 'pointer',
              boxShadow: incompleto ? 'none' : `0 6px 16px ${ADMIN.sombraCTA}`,
            }}
          >
            {busy ? 'Un momento…' : 'Publicar'}
          </button>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: ADMIN.tinta2, letterSpacing: '.8px', marginBottom: 8 }}>
              ASÍ LO VE LA MAESTRA
            </div>
            <div style={{ background: ADMIN.warnFondo, border: `1.5px solid ${ADMIN.sol}`, borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink }}>
                {form.titulo || 'Título del anuncio'}
              </div>
              <div style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 3, whiteSpace: 'pre-wrap' }}>
                {form.cuerpo || 'Acá va el cuerpo del mensaje que ven las maestras al entrar.'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Lista ── */}
        {anuncios === null ? (
          <div style={{ fontFamily: QUICK, fontWeight: 700, color: ADMIN.tinta2 }}>Cargando anuncios…</div>
        ) : anuncios.length === 0 ? (
          <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px' }}>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>Todavía no hay anuncios</div>
            <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
              El primero que publiques aparece acá.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {anuncios.map((a) => (
              <div key={a.id} style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 20, padding: '18px 20px' }}>
                {editandoId === a.id ? (
                  <>
                    <CamposAnuncio form={formEdit} setForm={setFormEdit} escuelas={escuelas} />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditandoId(null)} className="ad-ghost-warm" style={{ ...btnSm, color: ADMIN.tinta2, borderColor: ADMIN.bordeCalido }}>Cancelar</button>
                      <button
                        onClick={guardarEdicion} disabled={busy}
                        className="ed-primary"
                        style={{ ...btnSm, background: ADMIN.base, color: '#fff', border: 'none' }}
                      >
                        {busy ? 'Un momento…' : 'Guardar'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <Pill tupla={a.activo ? PILL_ACTIVO : PILL_INACTIVO} />
                      <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800 }}>
                        {a.escuela_id ? (a.escuela_nombre ?? 'Un colegio') : 'Todos los colegios'}
                      </span>
                      <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                        {textoVigencia(a)}
                        {a.activo && !vigenteHoy(a, now) && <span style={{ color: ADMIN.warnTexto }}> · hoy no se muestra</span>}
                      </span>
                    </div>
                    <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.ink, marginTop: 8 }}>{a.titulo}</div>
                    <div style={{ fontFamily: NUNITO, fontSize: 14, color: ADMIN.tinta2, fontWeight: 600, marginTop: 3, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{a.cuerpo}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button onClick={() => alternar(a)} disabled={busy} className="ad-ghost" style={btnSm}>
                        {a.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button onClick={() => empezarEdicion(a)} disabled={busy} className="ad-ghost-warm" style={{ ...btnSm, color: ADMIN.tinta2, borderColor: ADMIN.bordeCalido }}>Editar</button>
                      <button onClick={() => borrar(a)} disabled={busy} className="ad-ghost-danger" style={{ ...btnSm, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
                        Borrar
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
