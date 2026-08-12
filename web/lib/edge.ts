// Llamada a Edge Functions de Supabase (alumno-login, aula-students).
// El backend NO se toca en la migración: Next solo lo invoca, igual que el
// front viejo (frontend/app/app.js → callFn).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Código de error cuando la llamada NO llegó a destino: no hay internet, se
// cortó, la función no está deployada (404 sin headers CORS → el fetch tira
// TypeError). Es un error del mismo tipo que los del server, no una excepción:
// esto corre en escuelas rurales, y una conexión que se cae no puede tumbarle
// la pantalla a la maestra con un stack trace.
export const ERR_RED = 'sin_conexion';

// POST a una Edge Function que NUNCA lanza. `token` es el access_token del
// usuario cuando la función tiene guard propio; sin él va la anon key.
export async function postFn<T = Record<string, unknown>>(
  name: string,
  body: unknown,
  opts: { token?: string | null; ms?: number } = {},
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const r = await fetchConTimeout(`${URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${opts.token ?? KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, opts.ms ?? 60000);
    let data = {} as T & { error?: string };
    try {
      data = await r.json();
    } catch {
      /* cuerpo vacío */
    }
    return { ok: r.ok, status: r.status, data };
  } catch {
    // Red caída, timeout o función inexistente. status 0 = ni siquiera hubo
    // respuesta, así que el caller puede distinguirlo de un 4xx del server.
    return { ok: false, status: 0, data: { error: ERR_RED } as T & { error?: string } };
  }
}

export async function callFn<T = Record<string, unknown>>(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  return postFn<T>(name, body);
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
