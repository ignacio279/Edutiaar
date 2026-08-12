'use client';
// Login del panel institucional (alumno golondrina, migración 0025). Link
// aparte, como el de /admin: no se entra desde la app.
//
// La identidad vive en institucion_admin (tabla propia, fail-closed): si la
// cuenta no está ahí, institucion-panel devuelve 403 y acá se cierra la
// sesión con un error genérico — no se revela si el email existe.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN } from '@/lib/admin/tema';
import { postFn } from '@/lib/edge';

const BALOO = 'var(--font-baloo), cursive';
const NUNITO = 'var(--font-nunito)';
const QUICK = 'var(--font-quicksand), sans-serif';

const field: React.CSSProperties = {
  width: '100%', padding: '14px 16px', border: `2px solid ${ADMIN.bordeCalido}`,
  borderRadius: 14, fontFamily: NUNITO, fontSize: 16, color: ADMIN.ink,
  background: ADMIN.suave, marginBottom: 16, outline: 'none',
};
const label: React.CSSProperties = {
  display: 'block', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 6px',
};

export default function InstitucionLogin() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function entrar() {
    if (busy) return;
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) { setBusy(false); setError('Credenciales inválidas.'); return; }

    // La única forma de saber si es admin de institución es preguntárselo al
    // panel (la tabla es server-only, sin policies: el cliente no la ve).
    const r = await postFn('institucion-panel', { accion: 'resumen' }, { token: data.session?.access_token ?? '' });
    if (!r.ok) {
      await supabase.auth.signOut();
      setBusy(false);
      // Sin conexión NO es una credencial mala: decírselo sería mandarla a
      // pelearse con su contraseña cuando el problema es la señal.
      setError(
        r.data.error === 'sin_conexion' ? 'No pudimos conectarnos. Revisá la conexión y probá de nuevo.'
          : r.data.error === 'institucion_suspendida' ? 'La institución está en pausa. Escribinos y lo resolvemos.'
            : 'Credenciales inválidas.',
      );
      return;
    }
    router.push('/institucion');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', background: ADMIN.suave, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 22px' }}>
      <div style={{ width: '100%', maxWidth: 392, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 30, padding: 34, boxShadow: `0 12px 34px ${ADMIN.sombraFuerte}`, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 10px', borderRadius: 16, background: ADMIN.base, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: BALOO, fontWeight: 800, fontSize: 28 }}>E</div>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 25, color: ADMIN.ink, margin: '0 0 2px' }}>Panel institucional</h1>
        <p style={{ fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 22px', fontWeight: 600 }}>
          Tus colegios, en números.
        </p>

        <div style={{ textAlign: 'left' }}>
          <label style={label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} autoComplete="username" />
          <label style={label}>Contraseña</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') entrar(); }}
            style={field} autoComplete="current-password"
          />
        </div>
        {error ? (
          <p style={{ fontFamily: QUICK, fontSize: 13.5, color: ADMIN.danger, margin: '0 0 12px' }}>{error}</p>
        ) : null}
        <button
          onClick={entrar} disabled={busy}
          style={{
            width: '100%', background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 14,
            padding: '14px 18px', fontFamily: BALOO, fontSize: 17, cursor: 'pointer', opacity: busy ? .6 : 1,
          }}
        >{busy ? 'Entrando…' : 'Entrar'}</button>
      </div>
    </div>
  );
}
