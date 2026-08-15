'use client';
// Cola de revisión del mapeo NAP (Task 7, fase "marco NAP"). SOL propone a
// qué tema del marco curricular corresponde cada nodo al clasificar
// (dividir-nodos / admin-jobs:nap_backfill); acá una persona confirma o
// corrige. Mismo principio que LUNA: la máquina propone, la persona decide —
// un nodo confirmado (`nap_revisado = true`) nunca se reclasifica solo.
//
// Nunca datos de alumnos: esta pantalla trabaja sobre nodos y temas del
// currículum, no sobre chicos.
import { useEffect, useMemo, useState } from 'react';
import { ADMIN } from '@/lib/admin/tema';
import { llamarAdmin, ERRS_ADMIN, ERRS_RED_ADMIN } from '@/lib/admin/api';
import { toast } from '@/lib/toast';
import {
  agruparPorColegioMateria, agruparTemasPorMateria, alTope, temaPorId, textoConfianza,
  type NodoRevision,
} from '@/lib/admin/revision-nap';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  falta_nodo_id: 'Falta el nodo a confirmar.',
  nap_tema_id_invalido: 'El tema elegido no es válido. Recargá la página.',
  tema_no_existe: 'Ese tema ya no está en el catálogo. Recargá la página.',
  no_existe: 'Ese nodo ya no existe (puede que otra persona ya lo haya revisado).',
  ...ERRS_RED_ADMIN,
};
const copyError = (c?: string) => ERRS[c ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
};
const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.oscuro, margin: 0 };

const FUERA_DEL_MARCO = ''; // valor del <select> para "este nodo no corresponde a ningún tema"

// Fila de un nodo: propuesta, selector con el catálogo del grado (las cuatro
// materias — D3 del brief, no se filtra por la materia del programa) y el
// texto oficial del NAP del tema actualmente elegido, siempre a la vista
// antes de confirmar (D3: la etiqueta corta no alcanza para decidir).
function FilaNodo({
  nodo, seleccion, onCambiarSeleccion, busy, onConfirmar,
}: {
  nodo: NodoRevision;
  seleccion: string;
  onCambiarSeleccion: (v: string) => void;
  busy: boolean;
  onConfirmar: () => void;
}) {
  const grupos = useMemo(() => agruparTemasPorMateria(nodo.temas_posibles), [nodo.temas_posibles]);
  const temaElegido = temaPorId(nodo.temas_posibles, seleccion || null);
  const tope = alTope(nodo);
  const propuesta = temaPorId(nodo.temas_posibles, nodo.nap_tema_id);

  return (
    <div style={{ padding: '16px 4px', borderTop: `1px solid ${ADMIN.divisor}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink }}>{nodo.nombre}</div>
          <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 3 }}>
            {nodo.nap_tema_id
              ? `Propuesta: ${propuesta ? `${propuesta.nombre} (${propuesta.eje})` : 'tema fuera del catálogo actual'} · ${textoConfianza(nodo)}`
              : 'SOL no encontró un tema para este nodo'}
          </div>
        </div>
        {tope && (
          <span
            title="El clasificador lo intentó 3 veces y no le encontró tema: hace falta una persona."
            style={{ background: ADMIN.dangerFondo, color: ADMIN.danger, borderRadius: 999, padding: '5px 12px', fontFamily: QUICK, fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}
          >
            3 intentos sin tema
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <select
          value={seleccion}
          onChange={(e) => onCambiarSeleccion(e.target.value)}
          disabled={busy}
          style={{ padding: '9px 12px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 10, fontFamily: NUNITO, fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, background: ADMIN.suave, outline: 'none', cursor: busy ? 'default' : 'pointer', minWidth: 260, flex: '1 1 260px' }}
        >
          <option value={FUERA_DEL_MARCO}>— Fuera del marco —</option>
          {grupos.map((g) => (
            <optgroup key={g.materia} label={g.materia}>
              {g.temas.map((t) => (
                <option key={t.id} value={t.id} title={t.texto_oficial ?? undefined}>{t.nombre}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={onConfirmar}
          disabled={busy}
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1, whiteSpace: 'nowrap' }}
        >
          {busy ? 'Confirmando…' : 'Confirmar'}
        </button>
      </div>

      {/* Texto oficial del NAP del tema elegido en el select — la fuente de
          autoridad; la etiqueta corta de arriba no alcanza para decidir. */}
      <div style={{ marginTop: 10, background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, borderRadius: 12, padding: '10px 14px' }}>
        {temaElegido ? (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: ADMIN.oscuro, textTransform: 'uppercase', letterSpacing: '.4px' }}>
              {temaElegido.materia} · {temaElegido.eje}
            </div>
            <div style={{ fontSize: 13, color: ADMIN.ink, fontWeight: 600, marginTop: 4, lineHeight: 1.45, fontStyle: 'italic' }}>
              {temaElegido.texto_oficial ?? 'Este tema no tiene texto oficial cargado todavía.'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 600 }}>
            Este nodo quedaría marcado como fuera del marco curricular NAP.
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminRevisionNap() {
  const [nodos, setNodos] = useState<NodoRevision[] | null>(null);
  const [error, setError] = useState('');
  const [selecciones, setSelecciones] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cargar() {
    setNodos(null);
    setError('');
    const r = await llamarAdmin<{ nodos: NodoRevision[] }>('admin-colegios', 'nap_revision_listar', {});
    if (!r.ok) { setError(copyError(r.data.error)); setNodos([]); return; }
    const filas = r.data.nodos ?? [];
    setNodos(filas);
    // Default del selector: la propuesta de SOL si existe, o "Fuera del
    // marco" si nunca encontró tema. No pisa lo que ya venía tocando el admin.
    setSelecciones((prev) => {
      const next = { ...prev };
      for (const n of filas) if (!(n.id in next)) next[n.id] = n.nap_tema_id ?? FUERA_DEL_MARCO;
      return next;
    });
  }

  useEffect(() => { cargar(); }, []);

  async function confirmar(nodoId: string) {
    if (busyId) return;
    setBusyId(nodoId);
    const napTemaId = selecciones[nodoId] || null;
    const r = await llamarAdmin('admin-colegios', 'nap_revision_fijar', { nodo_id: nodoId, nap_tema_id: napTemaId });
    setBusyId(null);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Tema confirmado.');
    setNodos((prev) => (prev ?? []).filter((n) => n.id !== nodoId));
  }

  const grupos = agruparPorColegioMateria(nodos ?? []);
  const totalTope = (nodos ?? []).filter(alTope).length;

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' }}>
        Revisión del mapeo NAP
      </h1>
      <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px', maxWidth: 680, textWrap: 'pretty' }}>
        SOL propone a qué tema del marco curricular corresponde cada nodo. Acá confirmás la propuesta o la
        corregís — nunca se reclasifica solo un nodo ya revisado.
      </p>

      {totalTope > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ADMIN.dangerFondo, border: `1.5px solid ${ADMIN.danger}22`, borderRadius: 999, padding: '7px 16px', marginBottom: 16 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: ADMIN.danger }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: ADMIN.danger }}>
            {totalTope === 1
              ? '1 nodo llegó al tope de intentos del clasificador: ninguna máquina lo va a resolver sola'
              : `${totalTope} nodos llegaron al tope de intentos del clasificador: ninguna máquina los va a resolver sola`}
          </span>
        </div>
      )}

      {error && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '14px 18px', color: ADMIN.warnTexto, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {nodos === null && !error && (
        <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
      )}

      {nodos !== null && !error && grupos.length === 0 && (
        <div style={{ ...carta, textAlign: 'center', padding: '48px 24px', maxWidth: 640 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>No hay nada pendiente de revisar</div>
          <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
            Todos los nodos sin tema o con confianza baja ya fueron confirmados o corregidos.
          </div>
        </div>
      )}

      {grupos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grupos.map((g) => (
            <div key={`${g.colegio}|${g.materia}`} style={carta}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={h2}>{g.colegio} · {g.materia}</h2>
                <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                  {g.nodos.length} {g.nodos.length === 1 ? 'nodo' : 'nodos'}
                </span>
              </div>
              {g.nodos.map((n) => (
                <FilaNodo
                  key={n.id}
                  nodo={n}
                  seleccion={selecciones[n.id] ?? FUERA_DEL_MARCO}
                  onCambiarSeleccion={(v) => setSelecciones((prev) => ({ ...prev, [n.id]: v }))}
                  busy={busyId === n.id}
                  onConfirmar={() => confirmar(n.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
