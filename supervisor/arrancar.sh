#!/usr/bin/env bash
# Arranca Sebastian, el supervisor, en remoto y sin squeezer.
# SEBASTIAN_ROL hace que los hooks de sebastian ignoren esta sesión (no se vigila a sí mismo).
# Usa la configuración de Claude de CLAUDE_CONFIG_DIR (o ~/.claude): un Sebastian por cada una.
# Se quita ANTHROPIC_BASE_URL por si squeezer la dejó puesta en el entorno: remote-control no funciona con ella.
# --rc Sebastian: sesión normal en la terminal, conectada también en remoto con el nombre "Sebastian".
# "arranca": primer mensaje, para que repase las sesiones nada más abrirse.
cd "$(dirname "$0")"
exec env -u ANTHROPIC_BASE_URL SEBASTIAN_ROL=supervisor claude --rc Sebastian arranca "$@"
