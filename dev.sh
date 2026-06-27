#!/usr/bin/env bash
# Servidor estático local para EDUTIA. Sirve frontend/ en http://localhost:5173
# La DB es la de Supabase (remota) — ver frontend/config.js
exec python3 -m http.server 5173 --directory "$(dirname "$0")/frontend"
