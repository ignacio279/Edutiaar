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

const NUNITO = 'var(--font-nunito)';
const QUICK = 'var(--font-quicksand), sans-serif';

const PRESET_INFO: readonly { plan: Plan; label: string; desc: string }[] = [
  { plan: 'basico', label: 'Básico', desc: 'Solo SOL: práctica de los chicos.' },
  { plan: 'docente', label: 'Docente', desc: 'SOL + LUNA completa para la maestra.' },
  { plan: 'completo', label: 'Completo', desc: 'Todo, incluido TERRA cuando llegue.' },
];

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  colegio_inexistente: 'Ese colegio no existe (¿lo borraron?).',
  flags_invalidos: 'Los flags no tienen un formato válido.',
  plan_invalido: 'Ese plan no existe.',
};

// Switch del mock: track 46×26, knob 20 que viaja de 3 a 23; prendido pero
// deshabilitado (hijos de LUNA) queda en petróleo lavado.
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
        padding: 0,
        flexShrink: 0,
        position: 'relative',
        background: on ? (deshabilitado ? ADMIN.switchOnDim : ADMIN.base) : ADMIN.switchOff,
        cursor: deshabilitado ? 'not-allowed' : 'pointer',
        transition: 'background .15s ease',
      }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: ADMIN.carta, transition: 'left .15s ease', boxShadow: '0 1px 4px rgba(58,51,42,.25)' }} />
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', paddingLeft: sub ? 28 : 0, borderBottom: `1px solid ${ADMIN.divisor}`, opacity: sw.deshabilitado && !chip ? 0.45 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink, display: 'flex', alignItems: 'center' }}>
          {titulo}
          {chip && (
            <span style={{ background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.base, borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 800, marginLeft: 8 }}>
              {chip}
            </span>
          )}
        </div>
        <div style={{ fontFamily: NUNITO, fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>{detalle}</div>
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
    <div>
      <FichaTabs colegioId={colegioId} />

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
            {PRESET_INFO.map((p) => {
              const activo = planActivo === p.plan;
              return (
                <button
                  key={p.plan}
                  onClick={() => aplicarPreset(p.plan, p.label)}
                  style={{
                    textAlign: 'left',
                    background: activo ? ADMIN.burbuja : ADMIN.carta,
                    border: `2px solid ${activo ? ADMIN.base : ADMIN.bordeCalido}`,
                    borderRadius: 20,
                    padding: '18px 20px',
                    cursor: activo ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: ADMIN.ink }}>{p.label}</span>
                    {activo && (
                      <span style={{ background: ADMIN.base, color: '#fff', borderRadius: 999, padding: '3px 11px', fontSize: 11.5, fontWeight: 800 }}>
                        Activo
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 5 }}>{p.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Personalizado */}
          <div style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22, maxWidth: 640 }}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              Personalizado
              {planActivo === 'custom' && (
                <span style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
                  Plan custom
                </span>
              )}
            </h2>
            <FilaToggle
              titulo="SOL"
              detalle="Ejercicios y práctica de los chicos"
              on={flags.sol}
              onToggle={() => guardarFlags({ ...flags, sol: !flags.sol })}
            />
            <FilaToggle
              titulo="LUNA"
              detalle="Copiloto de la maestra (switch maestro)"
              on={flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, activa: !flags.luna.activa } })}
            />
            <FilaToggle
              sub
              titulo="Alertas"
              detalle="Señales de rendimiento del aula"
              on={flags.luna.alertas}
              deshabilitado={!flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, alertas: !flags.luna.alertas } })}
            />
            <FilaToggle
              sub
              titulo="Boletines"
              detalle="Borradores para revisar y aprobar"
              on={flags.luna.boletines}
              deshabilitado={!flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, boletines: !flags.luna.boletines } })}
            />
            <FilaToggle
              sub
              titulo="Chat"
              detalle="Consultas pedagógicas 24/7"
              on={flags.luna.chat}
              deshabilitado={!flags.luna.activa}
              onToggle={() => guardarFlags({ ...flags, luna: { ...flags.luna, chat: !flags.luna.chat } })}
            />
            <FilaToggle
              titulo="TERRA"
              detalle="Copiloto para las familias"
              chip="próximamente"
              on={flags.terra}
              onToggle={() => guardarFlags({ ...flags, terra: !flags.terra })}
            />
            <p style={{ fontFamily: NUNITO, fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, margin: '14px 0 0' }}>
              Los cambios aplican al instante en la app de la maestra.
            </p>
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
