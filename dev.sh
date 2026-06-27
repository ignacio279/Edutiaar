#!/usr/bin/env bash
# Servidor estático local para EDUTIA. La DB es la de Supabase (remota).
set -e
echo ""
echo "  EDUTIA corriendo. Dejá esta ventana abierta."
echo "  App:        http://localhost:5173/app/"
echo "  Smoke test: http://localhost:5173/"
echo "  (Ctrl+C para frenar)"
echo ""
exec python3 -m http.server 5173 --directory "$(dirname "$0")/frontend"
