#!/usr/bin/env bash
# Builds lifelog-desktop and installs it as a systemd user timer (no sudo).
#
#   apps/desktop/scripts/install.sh              # build, install, enable + start the timer
#   apps/desktop/scripts/install.sh --uninstall  # stop and remove (keeps config, queue and state)
#
# Installed to a stable location, independent of this checkout:
#   ~/.local/opt/lifelog-desktop/lifelog-desktop.mjs   single-file bundle (node 22)
#   ~/.local/bin/lifelog-desktop                       wrapper for manual runs
#   ~/.config/systemd/user/lifelog-desktop.{service,timer}
#   ~/.config/lifelog-desktop/config.json              created once (placeholder token), never overwritten
# Queue and cursor live in ~/.local/state/lifelog-desktop/.
#
# The unit runs the node binary found now (absolute path); re-run this script after changing
# Node versions (nvm).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${LIFELOG_DESKTOP_PREFIX:-$HOME/.local/opt/lifelog-desktop}"
BIN="$HOME/.local/bin/lifelog-desktop"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/lifelog-desktop/config.json"

log() { printf '[install] %s\n' "$*"; }

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user disable --now lifelog-desktop.timer 2>/dev/null || true
  rm -f "$UNIT_DIR/lifelog-desktop.service" "$UNIT_DIR/lifelog-desktop.timer" "$BIN"
  rm -rf "$PREFIX"
  systemctl --user daemon-reload
  log "removed; config ($CONFIG) and queue (~/.local/state/lifelog-desktop) kept"
  exit 0
fi

NODE="$(command -v node || true)"
[[ -n "$NODE" ]] || { log "node not found (need Node 22)"; exit 1; }
NODE="$(readlink -f "$NODE")"
major="$("$NODE" -p 'process.versions.node.split(".")[0]')"
(( major >= 22 )) || { log "need Node 22+, found $("$NODE" --version)"; exit 1; }

log "building"
[[ -x "$APP_DIR/node_modules/.bin/esbuild" ]] || { log "run 'pnpm install' at the repo root first"; exit 1; }
# npm only runs the package script here (esbuild from node_modules); dependencies come from pnpm.
(cd "$APP_DIR" && PATH="$(dirname "$NODE"):$PATH" npm run --silent build >/dev/null)

mkdir -p "$PREFIX" "$(dirname "$BIN")" "$UNIT_DIR" "$(dirname "$CONFIG")"
install -m 0755 "$APP_DIR/dist/lifelog-desktop.mjs" "$PREFIX/lifelog-desktop.mjs"
install -m 0644 "$APP_DIR/README.md" "$PREFIX/README.md"
cat >"$BIN" <<EOF
#!/bin/sh
exec "$NODE" "$PREFIX/lifelog-desktop.mjs" "\$@"
EOF
chmod 0755 "$BIN"

for unit in lifelog-desktop.service lifelog-desktop.timer; do
  sed -e "s|@NODE@|$NODE|g" -e "s|@PREFIX@|$PREFIX|g" "$APP_DIR/systemd/$unit" >"$UNIT_DIR/$unit"
done

if [[ ! -f "$CONFIG" ]]; then
  (umask 077 && cat >"$CONFIG" <<'EOF'
{
  "baseUrl": "http://localhost:3000",
  "token": "REPLACE_WITH_DESKTOP_TOKEN"
}
EOF
  )
  log "created $CONFIG (placeholder token: events are queued, not uploaded, until you set it)"
fi

systemctl --user daemon-reload
systemctl --user enable --now lifelog-desktop.timer
log "installed $PREFIX (node $NODE)"
systemctl --user list-timers lifelog-desktop.timer --no-pager
