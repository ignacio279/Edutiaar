'use client';
// Autorización de pase (alumno golondrina, ADR-011). ÚNICA pantalla pública
// del feature: la abre la FAMILIA desde el link que le pasó la escuela, sin
// cuenta y muchas veces desde un celular con poca señal.
//
// Decisiones de diseño: letra grande, una sola decisión por pantalla, cero
// jerga ("pase", no "transferencia de matrícula"). El token viaja en el
// fragment (#) — nunca llega al server en la URL —, así que se lee en el
// cliente y se manda en el body.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  VINCULOS, VINCULO_COPY, copyVencimiento, msgErrTransferencia,
  tokenDelFragmento, validarAutorizacion,
} from '@/lib/transferencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Pase = {
  alumno_nombre: string | null;
  escuela_origen: string | null;
  escuela_destino: string | null;
  expira_at: string;
};

async function llamar(accion: string, payload: Record<string, unknown>) {
  const r = await fetch(`${URL_SB}/functions/v1/transferencia-confirmar`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j: j as { error?: string; [k: string]: unknown } };
}

export default function AutorizarPase() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [token, setToken] = useState<string | null>(null);
  const [pase, setPase] = useState<Pase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [vinculo, setVinculo] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    const t = tokenDelFragmento(typeof window !== 'undefined' ? window.location.hash : null);
    setToken(t);
    if (!t) { setError(msgErrTransferencia({ error: 'token_invalido' })); setCargando(false); return; }
    llamar('ver', { transferencia_id: id, token: t }).then(({ ok, j }) => {
      if (!ok) setError(msgErrTransferencia(j));
      else setPase(j as unknown as Pase);
      setCargando(false);
    });
  }, [id]);

  async function autorizar() {
    const v = validarAutorizacion({ adulto_nombre: nombre, adulto_vinculo: vinculo });
    if (!v.ok) { setError(v.error); return; }
    setError(null);
    setEnviando(true);
    const { ok, j } = await llamar('confirmar', {
      transferencia_id: id, token,
      adulto_nombre: v.adulto_nombre, adulto_vinculo: v.adulto_vinculo,
    });
    setEnviando(false);
    if (!ok) { setError(msgErrTransferencia(j)); return; }
    setListo(String(j.escuela_destino ?? pase?.escuela_destino ?? 'la escuela nueva'));
  }

  const marco: React.CSSProperties = {
    minHeight: '100vh', background: '#FDF6E9', padding: '24px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: QUICK,
  };
  const tarjeta: React.CSSProperties = {
    background: '#fff', borderRadius: 20, padding: '28px 24px', maxWidth: 520, width: '100%',
    boxShadow: '0 8px 28px rgba(90,70,50,.12)', color: '#4A3B2A',
  };
  const titulo: React.CSSProperties = { fontFamily: BALOO, fontSize: 26, margin: '0 0 12px', lineHeight: 1.25 };
  const parrafo: React.CSSProperties = { fontSize: 18, lineHeight: 1.5, margin: '0 0 16px' };
  const campo: React.CSSProperties = {
    width: '100%', fontSize: 18, padding: '12px 14px', borderRadius: 12,
    border: '2px solid #E4D5BE', fontFamily: QUICK, boxSizing: 'border-box', background: '#fff',
  };
  const boton: React.CSSProperties = {
    width: '100%', fontSize: 19, fontFamily: BALOO, padding: '14px 18px', borderRadius: 14,
    border: 'none', background: '#7FB069', color: '#fff', cursor: 'pointer', marginTop: 8,
  };

  if (cargando) {
    return <main style={marco}><div style={tarjeta}><p style={parrafo}>Un segundito…</p></div></main>;
  }

  if (listo) {
    return (
      <main style={marco}>
        <div style={tarjeta}>
          <h1 style={titulo}>¡Listo! Gracias 💛</h1>
          <p style={parrafo}>
            Quedó registrada tu autorización. El recorrido de {pase?.alumno_nombre ?? 'tu chico o chica'} viaja
            con él a {listo}: no se pierde nada de lo que aprendió.
          </p>
          <p style={{ ...parrafo, fontSize: 16, color: '#7A6A58' }}>
            La maestra de la escuela nueva lo va a sumar a su clase y le va a dar un código nuevo para entrar.
          </p>
        </div>
      </main>
    );
  }

  if (!pase) {
    return (
      <main style={marco}>
        <div style={tarjeta}>
          <h1 style={titulo}>No pudimos abrir este pase</h1>
          <p style={parrafo}>{error}</p>
          <p style={{ ...parrafo, fontSize: 16, color: '#7A6A58', marginBottom: 0 }}>
            Si necesitás una mano, hablá con la escuela: te pueden mandar un link nuevo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={marco}>
      <div style={tarjeta}>
        <h1 style={titulo}>Pase de escuela</h1>
        <p style={parrafo}>
          <strong>{pase.alumno_nombre ?? 'Tu chico o chica'}</strong> pasa
          {pase.escuela_origen ? <> de <strong>{pase.escuela_origen}</strong></> : null}
          {' '}a <strong>{pase.escuela_destino}</strong>.
        </p>
        <p style={parrafo}>
          Si autorizás, todo lo que aprendió hasta ahora viaja con él y la maestra nueva lo va a poder
          acompañar desde donde quedó. Nada se borra.
        </p>

        <label style={{ display: 'block', fontSize: 16, margin: '18px 0 6px' }}>Tu nombre</label>
        <input
          style={campo} value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Como te llamás" autoComplete="name"
        />

        <label style={{ display: 'block', fontSize: 16, margin: '16px 0 6px' }}>¿Qué sos del chico o la chica?</label>
        <select style={campo} value={vinculo} onChange={(e) => setVinculo(e.target.value)}>
          <option value="">Elegí una opción</option>
          {VINCULOS.map((v) => <option key={v} value={v}>{VINCULO_COPY[v]}</option>)}
        </select>

        {error ? (
          <p style={{ ...parrafo, color: '#BB4F3F', fontSize: 16, margin: '16px 0 0' }}>{error}</p>
        ) : null}

        <button style={{ ...boton, opacity: enviando ? .6 : 1 }} onClick={autorizar} disabled={enviando}>
          {enviando ? 'Guardando…' : 'Sí, autorizo el pase'}
        </button>

        <p style={{ fontSize: 14, color: '#7A6A58', marginTop: 16, marginBottom: 0 }}>
          {copyVencimiento(pase.expira_at, new Date())}. Guardamos tu nombre y el vínculo solo como
          constancia de esta autorización.
        </p>
      </div>
    </main>
  );
}
