// Cliente Supabase para el navegador (componentes 'use client').
// anon key = pública, protegida por RLS.
import { createBrowserClient } from '@supabase/ssr';

// `detectSessionInUrl` viene prendido por defecto: supabase-js lee el fragment
// (#access_token=…) apenas arranca y lo borra de la URL. `/nueva-contrasena`
// necesita ese fragment en la mano para distinguir "link vencido" de "link
// bien" antes de tocar nada, así que lo apaga y llama setSession() él mismo.
export function createClient(opciones?: { detectSessionInUrl?: boolean }) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    opciones ? { auth: opciones } : undefined,
  );
}
