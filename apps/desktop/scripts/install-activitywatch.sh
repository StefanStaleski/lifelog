#!/usr/bin/env bash
# Installs ActivityWatch for the current user (no sudo) and starts it on login.
#
#   apps/desktop/scripts/install-activitywatch.sh            # latest stable release
#   AW_VERSION=v0.13.2 apps/desktop/scripts/install-activitywatch.sh
#
# Safe to re-run: skips the download when that version is already installed, rewrites the
# autostart entry, and starts aw-qt if it isn't running. aw-qt (from the desktop session's
# autostart) starts aw-server, aw-watcher-afk and aw-watcher-window; it runs inside the X11
# session, so the watchers always get the right DISPLAY (a systemd user service would not on
# Cinnamon, which never activates graphical-session.target).
#
# Uninstall: pkill -f activitywatch/aw-; rm -rf ~/.local/opt/activitywatch ~/.config/autostart/aw-qt.desktop
# (collected data stays in ~/.local/share/activitywatch).
set -euo pipefail

PREFIX="${AW_PREFIX:-$HOME/.local/opt/activitywatch}"
AUTOSTART="$HOME/.config/autostart/aw-qt.desktop"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/lifelog-desktop"
API="https://api.github.com/repos/ActivityWatch/activitywatch/releases/latest"

log() { printf '[install-activitywatch] %s\n' "$*"; }

version="${AW_VERSION:-}"
if [[ -z "$version" ]]; then
  version="$(curl -fsSL "$API" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
  [[ -n "$version" ]] || { log "could not determine the latest release"; exit 1; }
fi

if [[ -f "$PREFIX/.version" && "$(cat "$PREFIX/.version")" == "$version" && -x "$PREFIX/aw-qt" ]]; then
  log "ActivityWatch $version already installed in $PREFIX"
else
  zip="activitywatch-$version-linux-x86_64.zip"
  mkdir -p "$CACHE"
  if [[ ! -s "$CACHE/$zip" ]]; then
    log "downloading $zip"
    curl -fSL --retry 3 -o "$CACHE/$zip.part" \
      "https://github.com/ActivityWatch/activitywatch/releases/download/$version/$zip"
    mv "$CACHE/$zip.part" "$CACHE/$zip"
  fi
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  unzip -q "$CACHE/$zip" -d "$tmp"
  [[ -x "$tmp/activitywatch/aw-qt" ]] || { log "unexpected archive layout"; exit 1; }

  # Stop a running copy before replacing its files.
  pkill -f "$PREFIX/aw-" 2>/dev/null || true
  sleep 1
  mkdir -p "$(dirname "$PREFIX")"
  rm -rf "$PREFIX.new"
  mv "$tmp/activitywatch" "$PREFIX.new"
  rm -rf "$PREFIX"
  mv "$PREFIX.new" "$PREFIX"
  echo "$version" >"$PREFIX/.version"
  rm -f "$CACHE"/activitywatch-*-linux-x86_64.zip
  log "installed ActivityWatch $version in $PREFIX"
fi

mkdir -p "$(dirname "$AUTOSTART")"
cat >"$AUTOSTART" <<EOF
[Desktop Entry]
Name=ActivityWatch
Comment=Time tracking (feeds lifelog-desktop)
Exec=$PREFIX/aw-qt
Icon=$PREFIX/media/logo/logo.png
Terminal=false
Type=Application
Hidden=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
EOF
log "autostart entry: $AUTOSTART"

if pgrep -f "$PREFIX/aw-qt" >/dev/null; then
  log "aw-qt already running"
elif [[ -n "${DISPLAY:-}" ]]; then
  log "starting aw-qt"
  setsid -f "$PREFIX/aw-qt" >/dev/null 2>&1 </dev/null
else
  log "no DISPLAY: aw-qt will start at the next login"
  exit 0
fi

for _ in $(seq 1 30); do
  if curl -fsS -m 2 http://localhost:5600/api/0/info >/dev/null 2>&1; then
    log "aw-server is up: $(curl -fsS -m 2 http://localhost:5600/api/0/info)"
    exit 0
  fi
  sleep 1
done
log "aw-server did not answer on http://localhost:5600 within 30 s"
exit 1
