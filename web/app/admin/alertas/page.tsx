'use client';
// WP7 + fase Observatorio y avisos — Alertas del operador (Dashboard admin
// v3): lista priorizada que LEE el snapshot precalculado de admin_alerta
// (admin-crm alertas_listar; el job nocturno admin-jobs lo recalcula solo cada
// noche y el botón "Recalcular ahora" lo dispara a mano por la misma ruta).
// "Listo ✓" persiste la clave determinística en admin_alerta_atendida
// (alerta_atender) y esa alerta no vuelve nunca para ese hecho puntual —
// patrón de /docente/luna.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type AlertaAdmin = {
  clave: string;
  tipo: 'trial_por_vencer' | 'colegio_inactivo' | 'costo_disparado';
  prioridad: 'alta' | 'media';
  escuelaId: string;
  escuelaNombre: string;
  titulo: string;
  detalle: string;
};

// Chips por prioridad como tuplas [bg, color, label] (patrón del tema admin).
const CHIP: Record<'alta' | 'media', readonly [string, string, string]> = {
  alta: [ADMIN.dangerFondo, ADMIN.danger, 'Alta'],
  media: [ADMIN.warnFondo, ADMIN.warnTexto, 'Media'],
};

// "hace un ratito / hace 3 horas / ayer / hace 5 días" — local a esta página
// (la de metricas.ts es de otro work-package, no se importa de ahí).
function relativo(iso: string, ahora: Date): string {
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return 'hace un ratito';
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

type Estado =
  | { modo: 'cargando' }
  | { modo: 'error'; mensaje: string }
  | { modo: 'lista'; alertas: AlertaAdmin[]; generadaAt: string | null };

export default function Page() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ modo: 'cargando' });
  const [recalculando, setRecalculando] = useState(false);
  const [toast, setToast] = useState('');

  const cargar = useCallback(async () => {
    const r = await llamarAdmin<{ alertas: AlertaAdmin[]; generada_at: string | null }>('admin-crm', 'alertas_listar');
    if (!r.ok) {
      setEstado({ modo: 'error', mensaje: ERRS_ADMIN[r.data.error ?? ''] ?? 'No pudimos cargar las alertas. Probá de nuevo en un ratito.' });
      return;
    }
    setEstado({ modo: 'lista', alertas: r.data.alertas ?? [], generadaAt: r.data.generada_at ?? null });
  }, []);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  // "Recalcular ahora": misma ruta de código que el cron nocturno (admin-jobs
  // accion nocturno, guard dual) — fallback humano si no querés esperar a la
  // noche. Si sale bien, recarga el snapshot.
  const recalcular = async () => {
    setRecalculando(true);
    setToast('');
    const r = await llamarAdmin('admin-jobs', 'nocturno');
    if (r.ok) {
      await cargar();
    } else {
      setToast(ERRS_ADMIN[r.data.error ?? ''] ?? 'No pudimos recalcular las alertas. Probá de nuevo en un ratito.');
    }
    setRecalculando(false);
  };

  // Optimista: la alerta sale de la vista al toque; la clave queda persistida
  // server-side y no vuelve nunca para ese hecho.
  const atender = async (a: AlertaAdmin) => {
    setEstado((prev) => (prev.modo === 'lista'
      ? { ...prev, alertas: prev.alertas.filter((x) => x.clave !== a.clave) }
      : prev));
    await llamarAdmin('admin-crm', 'alerta_atender', { clave: a.clave });
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' }}>Alertas</h1>
          <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.tinta2, fontWeight: 600, margin: 0 }}>
            Trials por vencer, colegios inactivos y costos disparados. «Listo ✓» la marca como atendida y no vuelve.
          </p>
          {estado.modo === 'lista' && (
            <p style={{ fontFamily: QUICK, fontSize: 13, color: ADMIN.tinta2, fontWeight: 700, margin: '4px 0 0' }}>
              {estado.generadaAt
                ? `Actualizadas ${relativo(estado.generadaAt, new Date())} · se recalculan solas cada noche`
                : 'Todavía no se calcularon. Tocá «Recalcular ahora».'}
            </p>
          )}
        </div>
        <button
          onClick={recalcular}
          disabled={recalculando}
          className="ad-ghost"
          title="Corre el mismo cálculo que el job nocturno, ahora"
          style={{ flexShrink: 0, background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 999, padding: '11px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.oscuro, cursor: recalculando ? 'wait' : 'pointer', opacity: recalculando ? 0.7 : 1 }}
        >
          {recalculando ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      </div>

      {toast && (
        <div style={{ margin: '0 0 16px', background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '12px 16px', fontFamily: NUNITO, fontWeight: 700, fontSize: 14, color: ADMIN.warnTexto }}>
          {toast}
        </div>
      )}

      {estado.modo === 'cargando' ? (
        <p style={{ fontFamily: QUICK, fontWeight: 700, color: ADMIN.tinta2 }}>Cargando…</p>
      ) : estado.modo === 'error' ? (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 22, padding: '18px 20px', fontFamily: NUNITO, fontWeight: 700, color: ADMIN.warnTexto }}>
          {estado.mensaje}
        </div>
      ) : estado.alertas.length === 0 ? (
        <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px', maxWidth: 820 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: ADMIN.ink }}>Todo tranquilo por acá</div>
          <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
            Cuando algo necesite tu atención, aparece en esta lista.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
          {estado.alertas.map((a) => {
            const [bg, co, label] = CHIP[a.prioridad];
            return (
              <div
                key={a.clave}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                  background: ADMIN.carta,
                  border: `2px solid ${a.prioridad === 'alta' ? ADMIN.dangerBorde : ADMIN.warnBorde}`,
                  borderRadius: 20,
                  padding: '18px 22px',
                  boxShadow: '0 3px 10px rgba(120,90,40,.05)',
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ background: bg, color: co, borderRadius: 999, padding: '4px 12px', fontSize: 11.5, fontWeight: 800 }}>{label}</span>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.ink }}>{a.titulo}</span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontFamily: NUNITO, fontSize: 14, color: ADMIN.tinta2, fontWeight: 600, lineHeight: 1.45 }}>{a.detalle}</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => router.push(`/admin/colegios/${a.escuelaId}`)}
                    className="ad-ghost"
                    style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '9px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    Ver colegio
                  </button>
                  <button
                    onClick={() => atender(a)}
                    className="ed-primary"
                    title="Marcar como atendida: no vuelve a aparecer"
                    style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '9px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(62,124,138,.26)' }}
                  >
                    Listo ✓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
