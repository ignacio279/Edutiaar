'use client';
// Instituciones (alumno golondrina, migración 0025) — restyle 2026-08 al mock
// Admin.dc.html. Provincias, fundaciones, redes y municipios que agrupan
// colegios. Este listado es la puerta: cada tarjeta abre la ficha
// (/admin/instituciones/[id]), que es donde se opera.
//
// OJO: el admin de institución JAMÁS ve alumnos individuales — su panel
// (/institucion) devuelve solo agregados. Acá se administra la institución,
// no a sus chicos.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamarAdmin, ERRS_ADMIN, ERRS_RED_ADMIN } from '@/lib/admin/api';
import { ADMIN, CAMPO, ETIQUETA, ESTADO_INSTITUCION_PILL } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import Pill from '@/components/admin/Pill';
import Modal from '@/components/admin/Modal';
import { ERRS_LICENCIAS, TIPOS_INSTITUCION, TIPO_INSTITUCION_COPY } from '@/lib/admin/licencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

type Institucion = {
  id: string; nombre: string; tipo: string | null; estado: string;
  colegios: number; admins: number; licencias: number;
};

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN, ...ERRS_LICENCIAS, ...ERRS_RED_ADMIN,
  no_existe: 'Esa institución ya no existe. Actualizá la lista.',
  nombre_vacio: 'Poné un nombre.',
  tipo_invalido: 'Elegí un tipo válido.',
  estado_invalido: 'Ese estado no es válido.',
};
const copyError = (c?: string) => ERRS[c ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

export default function AdminInstituciones() {
  const router = useRouter();
  const [instituciones, setInstituciones] = useState<Institucion[] | null>(null);
  const [modal, setModal] = useState(false);
  const [nueva, setNueva] = useState({ nombre: '', tipo: '' });
  const [busy, setBusy] = useState(false);

  async function cargar() {
    const r = await llamarAdmin<{ instituciones: Institucion[] }>('admin-instituciones', 'listar');
    if (!r.ok) { toast(copyError(r.data.error)); setInstituciones([]); return; }
    setInstituciones(r.data.instituciones ?? []);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function crear() {
    if (busy) return;
    if (!nueva.nombre.trim()) { toast(ERRS.nombre_vacio); return; }
    setBusy(true);
    const r = await llamarAdmin<{ institucion: { id: string } }>('admin-instituciones', 'crear', {
      nombre: nueva.nombre.trim(), tipo: nueva.tipo || null,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setModal(false);
    setNueva({ nombre: '', tipo: '' });
    toast('Institución creada.');
    // Igual que el mock: recién creada, se entra derecho a la ficha a cargarle
    // colegios y admins.
    if (r.data.institucion?.id) router.push(`/admin/instituciones/${r.data.institucion.id}`);
    else await cargar();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>
          Instituciones
        </h1>
        <button
          onClick={() => setModal(true)}
          className="ed-primary"
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}
        >
          + Nueva institución
        </button>
      </div>
      <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 20px', maxWidth: 660 }}>
        Provincias, fundaciones, redes de escuelas y municipios que agrupan varios colegios.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
        {instituciones === null ? (
          <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Cargando…</p>
        ) : instituciones.length === 0 ? (
          <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '44px 24px' }}>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>Todavía no hay instituciones</div>
            <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
              Creá la primera para agrupar colegios bajo un mismo paraguas.
            </div>
          </div>
        ) : instituciones.map((i) => (
          <button
            key={i.id}
            onClick={() => router.push(`/admin/instituciones/${i.id}`)}
            className="ad-row"
            style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 20, padding: '18px 22px', cursor: 'pointer', textAlign: 'left', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}` }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.ink }}>{i.nombre}</span>
                {i.tipo && (
                  <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800 }}>
                    {TIPO_INSTITUCION_COPY[i.tipo] ?? i.tipo}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {([[i.colegios, 'colegios'], [i.admins, 'admins'], [i.licencias, 'licencias']] as const).map(([n, label]) => (
                <div key={label}>
                  <div style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 22, color: ADMIN.oscuro, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 11.5, color: ADMIN.tinta2, fontWeight: 700 }}>{label}</div>
                </div>
              ))}
            </div>
            <Pill tupla={ESTADO_INSTITUCION_PILL[i.estado]} />
          </button>
        ))}
      </div>

      {modal && (
        <Modal
          titulo="Nueva institución"
          descripcion="Agrupa colegios y tiene su propio panel de números agregados."
          verbo="Crear institución"
          busy={busy}
          puede={!!nueva.nombre.trim()}
          confirmar={crear}
          onCerrar={() => setModal(false)}
        >
          <label style={ETIQUETA}>Nombre</label>
          <input
            value={nueva.nombre} placeholder="Fundación Raíz Norte"
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
            style={{ ...CAMPO, marginBottom: 12 }}
          />
          <label style={ETIQUETA}>Tipo</label>
          <select
            value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}
            style={{ ...CAMPO, fontWeight: 700, cursor: 'pointer' }}
          >
            <option value="">Sin especificar</option>
            {TIPOS_INSTITUCION.map((t) => <option key={t} value={t}>{TIPO_INSTITUCION_COPY[t]}</option>)}
          </select>
        </Modal>
      )}
    </div>
  );
}
