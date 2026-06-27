#!/usr/bin/env bash
# EDUTIA — front en Next.js (web/). La DB es la de Supabase (remota).
set -e
echo ""
echo "  EDUTIA (Next.js) arrancando. Dejá esta ventana abierta."
echo "  App: http://localhost:3000/"
echo "  (Ctrl+C para frenar)"
echo ""
cd "$(dirname "$0")/web"
exec npm run dev
