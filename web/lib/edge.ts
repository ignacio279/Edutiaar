// Llamada a Edge Functions de Supabase (alumno-login, aula-students).
// El backend NO se toca en la migración: Next solo lo invoca, igual que el
// front viejo (frontend/app/app.js → callFn).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function callFn<T = Record<string, unknown>>(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = {} as T;
  try {
    data = await r.json();
  } catch {
    /* vacío */
  }
  return { ok: r.ok, status: r.status, data };
}

// fetch con timeout: aborta a los `ms` para no dejar spinners infinitos en
// conexión mala. Lanza AbortError si se pasa (el caller lo cachea y avisa).
export async function fetchConTimeout(input: string, init: RequestInit = {}, ms = 60000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Timeout genérico para promesas que no se pueden abortar (p. ej. supabase.functions.invoke).
// Rechaza con Error('timeout') a los `ms`; la llamada de fondo sigue pero se ignora.
export function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}
