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

const PILL_ACTIVO: readonly [string, string, string] = ['#E6F0DC', '#4E7A3A', 'Activo'];
const PILL_INACTIVO: readonly [string, string, string] = ['#EFE3CE', '#9A8E78', 'Inactivo'];

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
        <label style={labelStyle}>Texto</label>
        <textarea
          value={form.cuerpo} maxLength={500} rows={3} placeholder="Lo que van a leer las maestras en el banner."
          onChange={(e) => setForm({ ...form, cuerpo: e.target.value })}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }}
        />
        <div style={{ fontFamily: QUICK, fontSize: 11.5, color: ADMIN.tinta2, textAlign: 'right', marginTop: 3 }}>
          {form.cuerpo.length}/500
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Alcance</label>
          <select
            value={form.escuela_id}
            onChange={(e) => setForm({ ...form, escuela_id: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Todos los colegios</option>
            {escuelas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Desde (opcional)</label>
          <input
            type="date" value={form.desde}
            onChange={(e) => setForm({ ...form, desde: e.target.value })} style={inputStyle}
          />
        </div>
        <div>
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

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: '0 0 6px' }}>Anuncios</h1>
      <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 20px', lineHeight: 1.5 }}>
        Avisos que las maestras ven como banner al entrar. Podés apuntarlos a un colegio o a todos, con vigencia opcional.
      </p>

      {/* ── Alta ── */}
      <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '20px 22px', marginBottom: 26, boxShadow: `0 4px 14px ${ADMIN.sombraCalida}` }}>
        <h2 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 18, color: ADMIN.oscuro, margin: '0 0 14px' }}>Nuevo anuncio</h2>
        <CamposAnuncio form={form} setForm={setForm} escuelas={escuelas} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={crear}
            disabled={busy || !form.titulo.trim() || !form.cuerpo.trim()}
            style={{
              background: busy || !form.titulo.trim() || !form.cuerpo.trim() ? ADMIN.borde : ADMIN.base,
              color: '#fff', border: 'none', borderRadius: 12, padding: '11px 22px',
              fontFamily: QUICK, fontWeight: 700, fontSize: 14.5,
              cursor: busy || !form.titulo.trim() || !form.cuerpo.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Un momento…' : 'Publicar anuncio'}
          </button>
        </div>
      </div>

      {/* ── Lista ── */}
      {anuncios === null ? (
        <div style={{ fontFamily: QUICK, fontWeight: 700, color: ADMIN.tinta2 }}>Cargando anuncios…</div>
      ) : anuncios.length === 0 ? (
        <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontFamily: QUICK, fontWeight: 700 }}>
          Todavía no hay anuncios.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {anuncios.map((a) => (
            <div key={a.id} style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '18px 20px' }}>
              {editandoId === a.id ? (
                <>
                  <CamposAnuncio form={formEdit} setForm={setFormEdit} escuelas={escuelas} />
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                    <button onClick={() => setEditandoId(null)} style={btnSm}>Cancelar</button>
                    <button
                      onClick={guardarEdicion} disabled={busy}
                      style={{ ...btnSm, background: ADMIN.base, color: '#fff', border: 'none' }}
                    >
                      {busy ? 'Un momento…' : 'Guardar'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15.5, color: ADMIN.ink }}>{a.titulo}</span>
                    <Pill tupla={a.activo ? PILL_ACTIVO : PILL_INACTIVO} />
                    <span style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>
                      {a.escuela_id ? (a.escuela_nombre ?? 'Un colegio') : 'Todos los colegios'}
                    </span>
                  </div>
                  <p style={{ fontFamily: NUNITO, fontSize: 14, color: ADMIN.tinta2, margin: '0 0 10px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.cuerpo}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2 }}>
                      {textoVigencia(a)}
                      {a.activo && !vigenteHoy(a, now) && (
                        <span style={{ color: ADMIN.warnTexto }}> · Hoy no se muestra</span>
                      )}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => alternar(a)} disabled={busy} style={btnSm}>
                      {a.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => empezarEdicion(a)} disabled={busy} style={btnSm}>Editar</button>
                    <button onClick={() => borrar(a)} disabled={busy} style={{ ...btnSm, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
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
  );
}
