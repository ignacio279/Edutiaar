'use client';
// WP7 — CRM-lite: tab Notas de la ficha del colegio (Dashboard admin v3).
// Card de Contacto (patchea escuela.contacto vía editar_contacto) + timeline
// de notas de la relación (nota/contacto/acuerdo) contra admin-crm. Todo lo
// sirve la Edge Function con guard plataforma_admin: las tablas son
// server-only (migración 0019).
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FichaTabs from '@/components/admin/FichaTabs';
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

// Pills por tipo de nota como tuplas [bg, color, label] (colores del mock).
const TIPO_NOTA: Record<string, readonly [string, string, string]> = {
  nota: [ADMIN.hover, ADMIN.tinta2, 'Nota'],
  contacto: [ADMIN.claro, ADMIN.oscuro, 'Contacto'],
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
  width: '100%', padding: '11px 12px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};

const card: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
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
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 32px)', color: ADMIN.ink, margin: '0 0 14px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
          {/* Contacto del colegio (escuela.contacto) */}
          <div style={card}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 16px' }}>Contacto</h2>
            {CAMPOS_CONTACTO.map(({ clave, label }) => (
              <div key={clave} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6 }}>{label}</label>
                <input
                  value={contacto[clave] ?? ''}
                  onChange={(e) => setContacto((prev) => ({ ...prev, [clave]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <button
                onClick={guardarContacto}
                disabled={guardando}
                className="ed-primary"
                style={{ background: guardando ? ADMIN.borde : ADMIN.base, border: 'none', borderRadius: 999, padding: '11px 26px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: '#fff', cursor: guardando ? 'wait' : 'pointer' }}
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              {guardado && <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.okTexto }}>Guardado ✓</span>}
            </div>
          </div>

          {/* Notas internas: alta + timeline */}
          <div style={card}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px' }}>Notas internas</h2>
            <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
              {TIPOS.map((t) => {
                const activo = t === tipo;
                const [, , label] = TIPO_NOTA[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    className={activo ? undefined : 'ad-ghost-warm'}
                    style={{
                      background: activo ? ADMIN.base : ADMIN.carta,
                      color: activo ? '#fff' : ADMIN.tinta2,
                      border: activo ? 'none' : `1.5px solid ${ADMIN.bordeCalido}`,
                      borderRadius: 999, padding: '7px 15px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
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
              placeholder="Escribí la nota..."
              style={{ ...inputStyle, minHeight: 80, padding: '12px 14px', resize: 'vertical', lineHeight: 1.5, marginBottom: 10 }}
            />
            <button
              onClick={agregarNota}
              disabled={!cuerpo.trim() || agregando}
              className="ed-primary"
              style={{
                background: cuerpo.trim() && !agregando ? ADMIN.base : ADMIN.borde,
                border: 'none', borderRadius: 999, padding: '10px 24px', fontFamily: QUICK, fontWeight: 700,
                fontSize: 14, color: '#fff', cursor: cuerpo.trim() && !agregando ? 'pointer' : 'not-allowed',
              }}
            >
              {agregando ? 'Agregando…' : 'Agregar'}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              {notas.length === 0 ? (
                <p style={{ fontFamily: NUNITO, fontWeight: 600, fontSize: 14, color: ADMIN.tinta2, margin: 0 }}>
                  Todavía no hay notas de este colegio. La primera llamada, el primer acuerdo… todo queda acá.
                </p>
              ) : (
                notas.map((n) => {
                  const [bg, co, label] = TIPO_NOTA[n.tipo];
                  return (
                    <div key={n.id} style={{ background: ADMIN.suave, borderRadius: 14, padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <span style={{ background: bg, color: co, borderRadius: 999, padding: '3px 11px', fontSize: 11, fontWeight: 800 }}>{label}</span>
                        <span style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700 }}>
                          {fechaLinda(n.created_at)}{n.autor_email ? ` · ${n.autor_email}` : ''}
                        </span>
                        <button
                          onClick={() => borrarNota(n)}
                          disabled={borrando === n.id}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: ADMIN.danger, fontFamily: QUICK, fontWeight: 700, fontSize: 12, cursor: borrando === n.id ? 'wait' : 'pointer', padding: 0 }}
                        >
                          {borrando === n.id ? 'Borrando…' : 'Borrar'}
                        </button>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: ADMIN.ink, marginTop: 6, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{n.cuerpo}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
