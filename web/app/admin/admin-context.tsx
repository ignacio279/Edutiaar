'use client';
// Contexto del admin logueado (Dashboard admin v3): expone el nivel para que
// las páginas oculten ítems soloSuper y deshabiliten acciones destructivas al
// operativo. El gate real está SIEMPRE server-side (guard de plataforma_admin
// en cada Edge Function); esto es solo UI.
import { createContext, useContext } from 'react';

export type AdminMe = { nivel: 'super' | 'operativo' };

export const AdminContext = createContext<AdminMe | null>(null);
export const useAdmin = () => useContext(AdminContext);
