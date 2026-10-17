#!/usr/bin/env bash
# Arranca la sesión supervisora en remoto, sin squeezer.
# SEBASTIAN_ROL hace que los hooks de sebastian ignoren esta sesión (no se vigila a sí misma).
# Usa la configuración de Claude de CLAUDE_CONFIG_DIR (o ~/.claude): un Sebastian por cada una.
# Se quita ANTHROPIC_BASE_URL por si squeezer la dejó puesta en el entorno: remote-control no funciona con ella.
cd "$(dirname "$0")"
exec env -u ANTHROPIC_BASE_URL SEBASTIAN_ROL=supervisora claude remote-control "$@"
