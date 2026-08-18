'use client';
// Colegios (Dashboard admin v3 — WP1): listado con filtros y alta manual.
// Todo pasa por la Edge Function admin-colegios (guard plataforma_admin);
// esta página es solo UI. El filtro de estado va al server (acción `listar`
// con filtros); la búsqueda por nombre filtra en memoria sobre lo cargado.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN, ESTADO_COLEGIO, TIPO_COLEGIO } from '@/lib/admin/tema';
import { PROVINCIAS } from '@/lib/admin/provincias';
import { ANEXO_SEDE } from '@/lib/admin/identidad';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Pill from '@/components/admin/Pill';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

type ColegioFila = {
  id: string; nombre: string; zona: string | null; provincia: string | null;
  tipo: string | null; estado: string; trial_fin: string | null; plan: string;
  maestras: number; aulas: number; alumnos: number; created_at: string;
};

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  nombre_vacio: 'Poné el nombre del colegio.',
  tipo_invalido: 'Elegí el tipo de colegio.',
  zona_invalida: 'La zona no es válida.',
  provincia_invalida: 'Esa provincia no es válida.',
  cue_invalido: 'El CUE son 9 números (mirá el papel del ministerio).',
  cue_anexo_invalido: 'El anexo son 2 números; la sede es 00.',
  anexo_sin_cue: 'El anexo necesita su CUE.',
  cue_duplicado: 'Ya hay un colegio cargado con ese CUE.',
  matricula_invalida: 'La matrícula va de 1 a 10000 chicos.',
  matricula_anio_invalido: 'Ese año de matrícula no es válido.',
};
const errCopy = (code?: string) => (code && ERRS[code]) || 'Algo salió mal. Probá de nuevo.';

const input: React.CSSProperties = {
  padding: '12px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6,
};

// Días que faltan para el fin de la prueba (negativo = vencida).
function diasHasta(fecha: string, ahora: Date): number {
  return Math.ceil((new Date(`${fecha}T23:59:59`).getTime() - ahora.getTime()) / 86_400_000);
}

// "zona, provincia" sin repetir: la zona es texto libre y suele incluirla ya
// (ej. zona "Neuquén, Patagonia" + provincia "Neuquén").
function ubicacion(zona: string | null, provincia: string | null): string {
  if (!zona) return provincia ?? '';
  if (!provincia || zona.toLowerCase().includes(provincia.toLowerCase())) return zona;
  return `${zona}, ${provincia}`;
}

export default function ColegiosPage() {
  const router = useRouter();

  const [colegios, setColegios] = useState<ColegioFila[] | null>(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [modal, setModal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [provincia, setProvincia] = useState('');
  const [zona, setZona] = useState('');
  const [tipo, setTipo] = useState('');
  const [cue, setCue] = useState('');
  const [cueAnexo, setCueAnexo] = useState('');
  const [busy, setBusy] = useState(false);

  async function cargar(estado: string) {
    setColegios(null);
    const r = await llamarAdmin<{ colegios: ColegioFila[] }>(
      'admin-colegios', 'listar', estado ? { filtros: { estado } } : {},
    );
    if (!r.ok) { toast(errCopy(r.data.error)); setColegios([]); return; }
    setColegios(r.data.colegios ?? []);
  }

  useEffect(() => {
    cargar(filtroEstado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  async function crear() {
    if (busy) return;
    if (!nombre.trim()) { toast(ERRS.nombre_vacio); return; }
    if (!tipo) { toast(ERRS.tipo_invalido); return; }
    setBusy(true);
    const r = await llamarAdmin<{ colegio: { id: string } }>('admin-colegios', 'crear', {
      nombre: nombre.trim(), zona: zona.trim() || null, provincia: provincia || null, tipo,
      // El CUE viaja como lo tipearon (con guiones o sin): el server normaliza.
      ...(cue.trim() ? { cue: cue.trim(), cue_anexo: cueAnexo.trim() || ANEXO_SEDE } : {}),
    });
    setBusy(false);
    if (!r.ok) { toast(errCopy(r.data.error)); return; }
    toast('¡Colegio creado! Arranca con 30 días de prueba.');
    setModal(false);
    setNombre(''); setProvincia(''); setZona(''); setTipo(''); setCue(''); setCueAnexo('');
    router.push(`/admin/colegios/${r.data.colegio.id}`);
  }

  const visibles = (colegios ?? []).filter(
    (c) => !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>Colegios</h1>
        <button
          onClick={() => setModal(true)}
          className="ed-primary"
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}
        >
          + Nuevo colegio
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ ...input, padding: '11px 14px', fontWeight: 700, background: ADMIN.carta, cursor: 'pointer' }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_COLEGIO).map(([k, [, , lbl]]) => (
            <option key={k} value={k}>{lbl}</option>
          ))}
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre..."
          style={{ ...input, flex: 1, minWidth: 200, maxWidth: 340, padding: '11px 16px', background: ADMIN.carta }}
        />
      </div>

      {colegios === null ? (
        <p style={{ color: ADMIN.tinta2, fontWeight: 700, fontFamily: QUICK }}>Cargando colegios…</p>
      ) : visibles.length === 0 ? (
        <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px' }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>
            {colegios.length === 0 && !filtroEstado ? 'Todavía no hay colegios' : 'No encontramos colegios con ese filtro'}
          </div>
          <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
            {colegios.length === 0 && !filtroEstado ? 'Creá el primero con «+ Nuevo colegio».' : 'Probá con otro estado u otro nombre.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibles.map((c) => {
            const dias = c.estado === 'trial' && c.trial_fin ? diasHasta(c.trial_fin, new Date()) : null;
            return (
              <button
                key={c.id}
                onClick={() => router.push(`/admin/colegios/${c.id}`)}
                className="ad-row"
                style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 20, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 3px 10px rgba(120,90,40,.05)', fontFamily: NUNITO }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.ink }}>{c.nombre}</span>
                    {c.tipo && (
                      <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800 }}>
                        {TIPO_COLEGIO[c.tipo] ?? c.tipo}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 3 }}>
                    {ubicacion(c.zona, c.provincia)}
                    {(c.zona || c.provincia) ? ' · ' : ''}
                    {c.maestras} {c.maestras === 1 ? 'maestra' : 'maestras'} · {c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'} · {c.alumnos} {c.alumnos === 1 ? 'alumno' : 'alumnos'}
                  </div>
                </div>
                {dias !== null && (
                  <span style={{ fontSize: 13, color: ADMIN.warnTexto, fontWeight: 700 }}>
                    {dias >= 0 ? `vence en ${dias} ${dias === 1 ? 'día' : 'días'}` : `venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`}
                  </span>
                )}
                <Pill tupla={ESTADO_COLEGIO[c.estado]} />
              </button>
            );
          })}
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: ADMIN.velo, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 60 }} onClick={() => !busy && setModal(false)}>
          <div style={{ width: '100%', maxWidth: 440, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 24, padding: 28, boxShadow: '0 20px 50px rgba(58,51,42,.25)', animation: 'adPop .25s ease' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: ADMIN.ink, margin: '0 0 4px' }}>Nuevo colegio</h2>
            <p style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px' }}>
              Nace en Prueba con 30 días.
            </p>
            <label style={label}>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Escuela 9 · Arroyo Seco" style={{ ...input, width: '100%', marginBottom: 12 }} />
            <label style={label}>Provincia</label>
            <select value={provincia} onChange={(e) => setProvincia(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>
              <option value="">Elegí la provincia…</option>
              {PROVINCIAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <label style={label}>Zona</label>
            <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Arroyo Seco, Misiones" style={{ ...input, width: '100%', marginBottom: 12 }} />
            {/* CUE: opcional en el alta, pero es la llave con la que el
                ministerio cruza este colegio contra el Padrón Oficial. */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 2 }}>
                <label style={label}>CUE <span style={{ fontWeight: 600, color: ADMIN.tinta2 }}>(opcional)</span></label>
                <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder="740123400" inputMode="numeric" style={{ ...input, width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Anexo</label>
                <input value={cueAnexo} onChange={(e) => setCueAnexo(e.target.value)} placeholder={ANEXO_SEDE} inputMode="numeric" style={{ ...input, width: '100%' }} />
              </div>
            </div>
            <label style={label}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...input, width: '100%', marginBottom: 20, fontWeight: 700, cursor: 'pointer' }}>
              <option value="">Elegí un tipo…</option>
              {Object.entries(TIPO_COLEGIO).map(([k, lbl]) => (
                <option key={k} value={k}>{lbl}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} disabled={busy} className="ad-ghost-warm" style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={crear}
                disabled={busy}
                className="ed-primary"
                style={{ background: busy ? ADMIN.borde : ADMIN.base, border: 'none', borderRadius: 999, padding: '11px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', boxShadow: busy ? 'none' : `0 6px 16px ${ADMIN.sombraCTA}` }}
              >
                {busy ? 'Creando…' : 'Crear colegio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
