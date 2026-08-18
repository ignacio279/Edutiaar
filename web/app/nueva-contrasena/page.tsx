'use client';
// Elegir contraseña. La abre una maestra (o un admin) desde el link de
// invitación que le pasó el equipo de EDUTIA — sin sesión previa y, muchas
// veces, desde el celular.
//
// Cómo llega acá: `generateLink({type:'recovery'})` apunta a esta ruta
// (_shared/invitacion.ts). Supabase valida el token y redirige con la sesión
// en el FRAGMENT (#access_token=…&refresh_token=…&type=recovery). El fragment
// no viaja al server: se lee acá, se canjea con setSession() y recién ahí se
// puede llamar updateUser({password}).
//
// El fragment se captura en el primer render, ANTES de crear el cliente, y el
// cliente va con detectSessionInUrl:false: si supabase-js llegara primero,
// limpiaría la URL y esta pantalla no sabría si el link estaba vencido.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LARGO_MINIMO_PASSWORD, errorDelFragmento, rutaDestino, tokensDelFragmento,
  validarNuevaPassword,
} from '@/lib/recuperacion';
import { sol } from '@/lib/art';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

const field: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  border: '2px solid #EFE3CE',
  borderRadius: 14,
  fontFamily: NUNITO,
  fontSize: 16,
  color: '#3A332A',
  background: '#FBF4E6',
  outline: 'none',
  boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#7A6F5F',
  marginBottom: 7,
};

export default function NuevaContrasena() {
  const router = useRouter();

  // Sincrónico y una sola vez: la URL con la que llegó, intacta.
  const [url] = useState(() => ({
    hash: typeof window !== 'undefined' ? window.location.hash : '',
    search: typeof window !== 'undefined' ? window.location.search : '',
  }));
  const destino = rutaDestino(new URLSearchParams(url.search).get('d'));

  const [estado, setEstado] = useState<'abriendo' | 'form' | 'roto'>('abriendo');
  const [error, setError] = useState<string | null>(null);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const msg = errorDelFragmento(url.hash);
    if (msg) { setError(msg); setEstado('roto'); return; }
    const tokens = tokensDelFragmento(url.hash);
    if (!tokens) {
      setError('Entrá con el link que te pasó el equipo de EDUTIA. Este link está incompleto.');
      setEstado('roto');
      return;
    }
    const supabase = createClient({ detectSessionInUrl: false });
    supabase.auth.setSession(tokens).then(({ error: e }) => {
      if (e) {
        setError('Este link ya venció o ya se usó. Pedile al equipo de EDUTIA uno nuevo.');
        setEstado('roto');
        return;
      }
      // Los tokens quedan fuera de la barra de direcciones (y del historial).
      window.history.replaceState(null, '', window.location.pathname + url.search);
      setEstado('form');
    });
  }, [url]);

  async function guardar() {
    if (busy) return;
    const v = validarNuevaPassword(p1, p2);
    if (!v.ok) { setError(v.error); return; }
    setError(null);
    setBusy(true);
    const supabase = createClient({ detectSessionInUrl: false });
    const { error: e } = await supabase.auth.updateUser({ password: v.password });
    if (e) {
      setBusy(false);
      setError('No pudimos guardar la contraseña. Probá de nuevo en un ratito.');
      return;
    }
    router.push(destino);
    router.refresh();
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 22px',
        animation: 'edFade .3s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 28,
          right: 36,
          width: 60,
          height: 60,
          opacity: 0.9,
          background: `${sol('happy')} center/contain no-repeat`,
        }}
      />
      <div
        style={{
          width: '100%',
          maxWidth: 392,
          background: '#FFFCF5',
          border: '2px solid #EFE3CE',
          borderRadius: 30,
          padding: '38px 34px',
          boxShadow: '0 12px 34px rgba(120,90,40,.14)',
        }}
      >
        {estado === 'abriendo' && (
          <p style={{ fontSize: 16, color: '#7A6F5F', margin: 0, fontWeight: 600 }}>Un segundito…</p>
        )}

        {estado === 'roto' && (
          <>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 28, color: '#3A332A', margin: '0 0 10px' }}>
              No pudimos abrir el link
            </h1>
            <p style={{ fontSize: 16, color: '#7A6F5F', margin: '0 0 22px', fontWeight: 600, lineHeight: 1.5 }}>
              {error}
            </p>
            <p style={{ fontSize: 15, color: '#7A6F5F', margin: '0 0 22px', lineHeight: 1.5 }}>
              Si te dieron una contraseña temporal, con esa podés entrar igual.
            </p>
            <button
              onClick={() => router.push('/login/docente')}
              className="ed-primary"
              style={{
                width: '100%', background: '#6FB7D4', color: '#fff', border: 'none', borderRadius: 14,
                padding: 15, fontFamily: QUICK, fontWeight: 700, fontSize: 18, cursor: 'pointer',
              }}
            >
              Ir a entrar
            </button>
          </>
        )}

        {estado === 'form' && (
          <>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 30, color: '#3A332A', margin: '0 0 4px' }}>
              Elegí tu contraseña
            </h1>
            <p style={{ fontSize: 16, color: '#7A6F5F', margin: '0 0 26px', fontWeight: 600, lineHeight: 1.5 }}>
              Es la que vas a usar de ahora en adelante para entrar a EDUTIA.
            </p>

            <label style={labelStyle}>Contraseña nueva</label>
            <input
              type="password"
              autoComplete="new-password"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && guardar()}
              style={{ ...field, marginBottom: 6 }}
            />
            <p style={{ fontSize: 13, color: '#9A8C7E', margin: '0 0 18px' }}>
              Al menos {LARGO_MINIMO_PASSWORD} caracteres.
            </p>

            <label style={labelStyle}>Repetila</label>
            <input
              type="password"
              autoComplete="new-password"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && guardar()}
              style={{ ...field, marginBottom: error ? 10 : 26 }}
            />

            {error && (
              <p style={{ fontSize: 14, color: '#BB4F3F', fontWeight: 700, margin: '0 0 18px' }}>{error}</p>
            )}

            <button
              onClick={guardar}
              className="ed-primary"
              style={{
                width: '100%', background: '#6FB7D4', color: '#fff', border: 'none', borderRadius: 14,
                padding: 15, fontFamily: QUICK, fontWeight: 700, fontSize: 18, cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(111,183,212,.3)',
              }}
            >
              {busy ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
