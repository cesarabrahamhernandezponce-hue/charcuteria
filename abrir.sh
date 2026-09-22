#!/usr/bin/env bash
# Levanta la app en http://localhost:8080 (hace falta para que funcione offline de verdad)
cd "$(dirname "$0")"
echo "Mostrador en → http://localhost:8080"
python3 -m http.server 8080
