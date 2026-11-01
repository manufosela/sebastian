#!/usr/bin/env bash
# Arranca Sebastian, el supervisor, en remoto y sin squeezer.
# SEBASTIAN_ROL hace que los hooks de sebastian ignoren esta sesión (no se vigila a sí mismo).
# Hay un único Sebastian: ve las sesiones de todas las configuraciones en ~/.sebastian.
# Él mismo usa siempre la configuración personal (~/.claude): se quita CLAUDE_CONFIG_DIR.
# Se quita ANTHROPIC_BASE_URL por si squeezer la dejó puesta en el entorno: remote-control no funciona con ella.
# --rc Sebastian: sesión normal en la terminal, conectada también en remoto con el nombre "Sebastian".
# "arranca": primer mensaje, para que repase las sesiones nada más abrirse.
set -e
estado="${SEBASTIAN_DIR:-$HOME/.sebastian}"
mkdir -p "$estado"
# Candado: claude hereda el descriptor 9, así que dura lo que dura la sesión y se suelta solo si se cae.
exec 9>"$estado/supervisor.lock"
if ! flock -n 9; then
  echo "Ya hay un Sebastian abierto. Búscalo en tus terminales o en el móvil." >&2
  exit 1
fi
cd "$(dirname "$0")"
exec env -u ANTHROPIC_BASE_URL -u CLAUDE_CONFIG_DIR SEBASTIAN_ROL=supervisor claude --rc Sebastian arranca "$@"
