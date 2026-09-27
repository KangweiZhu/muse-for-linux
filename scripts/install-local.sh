#!/usr/bin/env bash
# Installs the freshly built AppImage for the current user so KRunner / app
# launchers pick it up. `--uninstall` removes it again.
set -euo pipefail

cd "$(dirname "$0")/.."
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA/muse-for-linux"
BIN="$HOME/.local/bin/muse"
DESKTOP="$DATA/applications/muse.desktop"
ICON="$DATA/icons/hicolor/256x256/apps/muse.png"

refresh() {
  update-desktop-database -q "$DATA/applications" 2>/dev/null || true
  gtk-update-icon-cache -q -t "$DATA/icons/hicolor" 2>/dev/null || true
  # KRunner/Kickoff read KDE's sycoca cache, not the directory directly.
  if command -v kbuildsycoca6 >/dev/null; then kbuildsycoca6 >/dev/null 2>&1 || true
  elif command -v kbuildsycoca5 >/dev/null; then kbuildsycoca5 >/dev/null 2>&1 || true
  fi
}

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -rf "$APP_DIR" "$BIN" "$DESKTOP" "$ICON"
  refresh
  echo "Removed Muse from ~/.local"
  exit 0
fi

appimage=$(ls -t dist/*.AppImage 2>/dev/null | head -1 || true)
if [[ -z "$appimage" ]]; then
  echo "No AppImage in dist/; run 'npm run dist:appimage' first." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$(dirname "$BIN")" "$(dirname "$DESKTOP")" "$(dirname "$ICON")"
install -m 755 "$appimage" "$APP_DIR/Muse.AppImage"
ln -sf "$APP_DIR/Muse.AppImage" "$BIN"
install -m 644 assets/icon.png "$ICON"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Muse
GenericName=AI Agent
Comment=Unofficial Linux desktop wrapper for muse.ai
Exec=$APP_DIR/Muse.AppImage %U
Icon=muse
Terminal=false
Categories=Utility;Network;
Keywords=Muse;Meta;AI;Agent;Chat;Assistant;
StartupWMClass=muse
StartupNotify=true
EOF

refresh
echo "Installed $appimage -> $APP_DIR/Muse.AppImage (search 'Muse' in KRunner)"
