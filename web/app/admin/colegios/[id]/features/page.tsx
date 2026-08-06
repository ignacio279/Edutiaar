'use client';
// Features por colegio (WP4, Dashboard admin v3): tres cards de plan preset
// (Básico/Docente/Completo) + card "Personalizado" con toggles SOL / LUNA (con
// sub-features) / TERRA. Cada cambio pega a admin-features al instante con
// estado optimista y revert si falla. Los presets son azúcar: escriben los
// mismos flags (D5); el plan activo se deriva con detectarPlan.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import FichaTabs from '@/components/admin/FichaTabs';
import { ADMIN } from '@/lib/admin/tema';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { PRESETS, detectarPlan, normalizarFlags, type Flags, type Plan } from '@/lib/admin/planes';

const BALOO = 'var(--font-baloo), cursive';
const NUNITO = 'var(--font-nunito)';
const QUICK = 'var(--font-quicksand), sans-serif';

const PRESET_INFO: readonly { plan: Plan; label: string; desc: string }[] = [
  { plan: 'basico', label: 'Básico', desc: 'Solo SOL: los chicos practican, sin copiloto docente.' },
  { plan: 'docente', label: 'Docente', desc: 'SOL + LUNA completa: alertas, boletines y chat.' },
  { plan: 'completo', label: 'Completo', desc: 'SOL + LUNA + TERRA (familias, próximamente).' },
];

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  colegio_inexistente: 'Ese colegio no existe (¿lo borraron?).',
  flags_invalidos: 'Los flags no tienen un formato válido.',
  plan_invalido: 'Ese plan no existe.',
};

function Switch({ on, deshabilitado, onToggle, etiqueta }: {
  on: boolean;
  deshabilitado?: boolean;
  onToggle: () => void;
  etiqueta: string;
}) {
  return (
    <button
      onClick={() => !deshabilitado && onToggle()}
      disabled={deshabilitado}
      role="switch"
      aria-checked={on}
      aria-label={etiqueta}
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: 'none',
        padding: 3,
        flex: 'none',
        background: on ? ADMIN.base : ADMIN.bordeCalido,
        opacity: deshabilitado ? 0.45 : 1,
        cursor: deshabilitado ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background .15s ease',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  );
}

function FilaToggle({ titulo, detalle, chip, sub, ...sw }: {
  titulo: string;
  detalle: string;
  chip?: string;
  sub?: boolean;
  on: boolean;
  deshabilitado?: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', marginLeft: sub ? 26 : 0, opacity: sw.deshabilitado ? 0.55 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: sub ? 14 : 15.5, color: ADMIN.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
          {titulo}
          {chip && (
            <span style={{ background: ADMIN.warnFondo, color: ADMIN.warnTexto, border: `1px solid ${ADMIN.warnBorde}`, borderRadius: 999, padding: '2px 10px', fontSize: 11.5, fontWeight: 700 }}>
              {chip}
            </span>
          )}
        </div>
        <div style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, lineHeight: 1.4 }}>{detalle}</div>
      </div>
      <Switch on={sw.on} deshabilitado={sw.deshabilitado} onToggle={sw.onToggle} etiqueta={titulo} />
    </div>
  );
}

export default function Page() {
  const params = useParams();
  const colegioId = String(params.id);

  const [flags, setFlags] = useState<Flags | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await llamarAdmin<{ flags?: unknown }>('admin-features', 'obtener', { escuela_id: colegioId });
      if (!vivo) return;
      if (!r.ok) {
        setErrorCarga(ERRS[r.data.error ?? ''] ?? 'No se pudieron cargar las features. Probá de nuevo.');
      } else {
        setFlags(normalizarFlags(r.data.flags));
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [colegioId]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const avisar = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  // Estado optimista: pinto el cambio ya, y si el server dice que no, revierto.
  const guardarFlags = async (nuevos: Flags) => {
    const previos = flags;
    setFlags(nuevos);
    const r = await llamarAdmin('admin-features', 'set_features', { escuela_id: colegioId, flags: nuevos });
    if (!r.ok) {
      setFlags(previos);
      avisar(ERRS[r.data.error ?? ''] ?? 'No se pudo guardar el cambio. Probá de nuevo.');
    }
  };

  const aplicarPreset = async (plan: Plan, label: string) => {
    if (!flags) return;
    if (detectarPlan(flags) === plan) return; // ya está activo
    if (!window.confirm(`¿Aplicar el plan ${label} a este colegio? Los toggles se pisan con los del plan.`)) return;
    const previos = flags;
    setFlags(PRESETS[plan]);
    const r = await llamarAdmin('admin-features', 'aplicar_preset', { escuela_id: colegioId, plan });
    if (!r.ok) {
      setFlags(previos);
      avisar(ERRS[r.data.error ?? ''] ?? 'No se pudo aplicar el plan. Probá de nuevo.');
    }
  };

  const planActivo = flags ? detectarPlan(flags) : null;

  return (
    <div style={{ maxWidth: 860 }}>
      <FichaTabs colegioId={colegioId} />
      <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: '0 0 6px' }}>Features del colegio</h1>
      <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 20px', lineHeight: 1.5 }}>
        Qué copilotos ve este colegio. Los cambios aplican al instante para todas sus maestras.
      </p>

      {cargando && (
        <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontFamily: QUICK, fontWeight: 700 }}>
          Cargando features…
        </div>
      )}

      {!cargando && errorCarga && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.warnTexto, fontFamily: QUICK, fontWeight: 700 }}>
          {errorCarga}
        </div>
      )}

      {!cargando && !errorCarga && flags && (
        <>
          {/* Planes preset */}
          <h2 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 10px' }}>Planes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 26 }}>
            {PRESET_INFO.map((p) => {
              const activo = planActivo === p.plan;
              return (
                <button
                  key={p.plan}
                  onClick={() => aplicarPreset(p.plan, p.label)}
                  style={{
                    textAlign: 'left',
                    background: activo ? ADMIN.claro : ADMIN.carta,
                    border: `2px solid ${activo ? ADMIN.base : ADMIN.borde}`,
                    borderRadius: 22,
                    padding: '16px 18px',
                    cursor: activo ? 'default' : 'pointer',
                    boxShadow: `0 4px 14px ${ADMIN.sombra}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 17, color: activo ? ADMIN.oscuro : ADMIN.ink }}>{p.label}</span>
                    {activo && (
                      <span style={{ background: ADMIN.okFondo, color: ADMIN.okTexto, borderRadius: 999, padding: '2px 10px', fontFamily: QUICK, fontWeight: 700, fontSize: 11.5 }}>
                        Activo
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, lineHeight: 1.45 }}>{p.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Personalizado */}
          <h2 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            Personalizado
            {planActivo === 'custom' && (
              <span style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '3px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 12 }}>
                Plan custom
              </span>
            )}
          </h2>
          <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '14px 22px', boxShadow: `0 4px 14px ${ADMIN.sombraCalida}` }}>
            <FilaToggle
              titulo="SOL"
              detalle="El copiloto de los chicos: práctica, mapa y ejercicios adaptados."
              on={flags.sol}
              onToggle={() => guardarFlags({ ...flags, sol: !flags.sol })}
            />
            <div style={{ borderTop: `1px solid ${ADMIN.bordeCalido}` }} />
            <FilaToggle
              titulo="LUNA"
              detalle="El copiloto de la maestra: dashboard, alertas, boletines y chat."
              on={flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, activa: !flags.luna.activa } })}
            />
            <FilaToggle
              sub
              titulo="Alertas"
              detalle="Alertas de rendimiento priorizadas en el dashboard."
              on={flags.luna.alertas}
              deshabilitado={!flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, alertas: !flags.luna.alertas } })}
            />
            <FilaToggle
              sub
              titulo="Boletines"
              detalle="Boletines mensuales por alumno (LUNA propone, la maestra decide)."
              on={flags.luna.boletines}
              deshabilitado={!flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, boletines: !flags.luna.boletines } })}
            />
            <FilaToggle
              sub
              titulo="Chat"
              detalle="Chat 24/7 con contexto real del aula."
              on={flags.luna.chat}
              deshabilitado={!flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, chat: !flags.luna.chat } })}
            />
            <div style={{ borderTop: `1px solid ${ADMIN.bordeCalido}` }} />
            <FilaToggle
              titulo="TERRA"
              detalle="El copiloto de las familias. El flag ya funciona; el copiloto todavía no existe."
              chip="próximamente"
              on={flags.terra}
              onToggle={() => guardarFlags({ ...flags, terra: !flags.terra })}
            />
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: ADMIN.danger, color: '#fff', borderRadius: 14, padding: '12px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, boxShadow: '0 10px 26px rgba(58,51,42,.35)', zIndex: 70 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
