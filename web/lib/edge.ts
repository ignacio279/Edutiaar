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
