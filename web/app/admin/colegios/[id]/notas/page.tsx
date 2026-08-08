'use client';
// WP7 — CRM-lite: tab Notas de la ficha del colegio (Dashboard admin v3).
// Card de Contacto (patchea escuela.contacto vía editar_contacto) + timeline
// de notas de la relación (nota/contacto/acuerdo) contra admin-crm. Todo lo
// sirve la Edge Function con guard plataforma_admin: las tablas son
// server-only (migración 0019).
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FichaTabs from '@/components/admin/FichaTabs';
import Pill from '@/components/admin/Pill';
import { ADMIN } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Nota = {
  id: string;
  tipo: 'nota' | 'contacto' | 'acuerdo';
  cuerpo: string;
  autor_id: string;
  autor_email: string | null;
  created_at: string;
};

type Contacto = { director?: string; telefono?: string; email?: string; notas?: string };

// Pills por tipo de nota como tuplas [bg, color, label] (patrón del tema).
const TIPO_NOTA: Record<string, readonly [string, string, string]> = {
  nota: [ADMIN.burbuja, ADMIN.medio, 'Nota'],
  contacto: [ADMIN.warnFondo, ADMIN.warnTexto, 'Contacto'],
  acuerdo: [ADMIN.okFondo, ADMIN.okTexto, 'Acuerdo'],
};

const TIPOS: Nota['tipo'][] = ['nota', 'contacto', 'acuerdo'];

const CAMPOS_CONTACTO: { clave: keyof Contacto; label: string }[] = [
  { clave: 'director', label: 'Director/a' },
  { clave: 'telefono', label: 'Teléfono' },
  { clave: 'email', label: 'Email' },
  { clave: 'notas', label: 'Notas del contacto' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};

const card: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22,
  padding: '20px 22px', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`,
};

function fechaLinda(iso: string): string {
  const f = new Date(iso);
  return f.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Page() {
  const params = useParams();
  const id = String(params.id);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [notas, setNotas] = useState<Nota[]>([]);

  // Contacto
  const [contacto, setContacto] = useState<Contacto>({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  // Alta de nota
  const [tipo, setTipo] = useState<Nota['tipo']>('nota');
  const [cuerpo, setCuerpo] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await llamarAdmin<{ escuela: { nombre: string; contacto: Contacto | null }; notas: Nota[] }>(
        'admin-crm', 'notas_listar', { escuela_id: id },
      );
      if (!r.ok) {
        setError(ERRS_ADMIN[r.data.error ?? ''] ?? (r.data.error === 'escuela_inexistente' ? 'Ese colegio no existe.' : 'No pudimos cargar las notas. Probá de nuevo.'));
        setCargando(false);
        return;
      }
      setNombre(r.data.escuela.nombre);
      setContacto(r.data.escuela.contacto ?? {});
      setNotas(r.data.notas ?? []);
      setCargando(false);
    })();
  }, [id]);

  const guardarContacto = async () => {
    setGuardando(true);
    setGuardado(false);
    const r = await llamarAdmin('admin-crm', 'editar_contacto', { escuela_id: id, contacto });
    setGuardando(false);
    if (!r.ok) { setError(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo guardar el contacto.'); return; }
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  const agregarNota = async () => {
    if (!cuerpo.trim() || agregando) return;
    setAgregando(true);
    const r = await llamarAdmin<{ nota: Nota }>('admin-crm', 'nota_crear', { escuela_id: id, tipo, cuerpo: cuerpo.trim() });
    setAgregando(false);
    if (!r.ok) { setError(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo agregar la nota.'); return; }
    setNotas((prev) => [r.data.nota, ...prev]);
    setCuerpo('');
  };

  const borrarNota = async (n: Nota) => {
    if (!window.confirm('¿Borrar esta nota? No se puede deshacer.')) return;
    setBorrando(n.id);
    const r = await llamarAdmin('admin-crm', 'nota_borrar', { nota_id: n.id });
    setBorrando(null);
    if (!r.ok) { setError(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo borrar la nota.'); return; }
    setNotas((prev) => prev.filter((x) => x.id !== n.id));
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: '0 0 14px' }}>
        {nombre || 'Colegio'}
      </h1>
      <FichaTabs colegioId={id} />

      {error && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '12px 16px', fontFamily: NUNITO, fontWeight: 700, fontSize: 14, color: ADMIN.warnTexto, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {cargando ? (
        <p style={{ fontFamily: QUICK, fontWeight: 700, color: ADMIN.tinta2 }}>Cargando…</p>
      ) : (
        <>
          {/* Contacto del colegio (escuela.contacto) */}
          <div style={card}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 14px' }}>Contacto</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {CAMPOS_CONTACTO.map(({ clave, label }) => (
                <label key={clave} style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2, marginBottom: 5 }}>{label}</span>
                  <input
                    value={contacto[clave] ?? ''}
                    onChange={(e) => setContacto((prev) => ({ ...prev, [clave]: e.target.value }))}
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <button
                onClick={guardarContacto}
                disabled={guardando}
                style={{ background: guardando ? ADMIN.borde : ADMIN.base, border: 'none', borderRadius: 12, padding: '10px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: '#fff', cursor: guardando ? 'wait' : 'pointer' }}
              >
                {guardando ? 'Guardando…' : 'Guardar contacto'}
              </button>
              {guardado && <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.okTexto }}>Guardado ✓</span>}
            </div>
          </div>

          {/* Alta de nota */}
          <div style={{ ...card, marginTop: 16 }}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px' }}>Nueva nota</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {TIPOS.map((t) => {
                const activo = t === tipo;
                const [bg, co, label] = TIPO_NOTA[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    style={{
                      background: activo ? bg : 'none',
                      color: activo ? co : ADMIN.tinta2,
                      border: `2px solid ${activo ? bg : ADMIN.bordeCalido}`,
                      borderRadius: 999, padding: '6px 15px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={3}
              placeholder="¿Qué pasó con este colegio? (llamados, acuerdos, próximos pasos…)"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
            <button
              onClick={agregarNota}
              disabled={!cuerpo.trim() || agregando}
              style={{
                marginTop: 10, background: cuerpo.trim() && !agregando ? ADMIN.oscuro : ADMIN.borde,
                border: 'none', borderRadius: 12, padding: '10px 20px', fontFamily: QUICK, fontWeight: 700,
                fontSize: 14.5, color: '#fff', cursor: cuerpo.trim() && !agregando ? 'pointer' : 'not-allowed',
              }}
            >
              {agregando ? 'Agregando…' : 'Agregar'}
            </button>
          </div>

          {/* Timeline (descendente, ya viene ordenado del server) */}
          <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '24px 0 12px' }}>Historial</h2>
          {notas.length === 0 ? (
            <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '18px 22px', fontFamily: NUNITO, fontWeight: 600, fontSize: 14.5, color: ADMIN.medio }}>
              Todavía no hay notas de este colegio. La primera llamada, el primer acuerdo… todo queda acá.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notas.map((n) => (
                <div key={n.id} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.ink }}>{fechaLinda(n.created_at)}</span>
                      <Pill tupla={TIPO_NOTA[n.tipo]} />
                      {n.autor_email && <span style={{ fontFamily: NUNITO, fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>{n.autor_email}</span>}
                    </div>
                    <p style={{ margin: '6px 0 0', fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.ink, fontWeight: 600, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.cuerpo}</p>
                  </div>
                  <button
                    onClick={() => borrarNota(n)}
                    disabled={borrando === n.id}
                    style={{ alignSelf: 'flex-start', flexShrink: 0, background: 'none', border: `1.5px solid ${ADMIN.dangerBorde}`, borderRadius: 999, padding: '6px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, color: ADMIN.danger, cursor: borrando === n.id ? 'wait' : 'pointer' }}
                  >
                    {borrando === n.id ? 'Borrando…' : 'Borrar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
