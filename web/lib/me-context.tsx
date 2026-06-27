'use client';
// Contexto del perfil logueado, provisto por /alumno/layout y consumido por
// las pantallas hijas (mapa, practicar).
import { createContext, useContext } from 'react';

export type Perfil = {
  id: string;
  nombre: string;
  avatar: string;
  grado: number;
  rol: string;
};

export const MeContext = createContext<Perfil | null>(null);

export function useMe() {
  return useContext(MeContext);
}
