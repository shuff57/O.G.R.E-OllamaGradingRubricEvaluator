#!/usr/bin/env bash
# Install OGRE from an AppImage into ~/.local and add a launcher entry.
# Usage: install-linux.sh [path/to/OGRE-x.y.z.AppImage]   (default: newest release from GitHub)
set -euo pipefail

REPO="shuff57/O.G.R.E-OllamaGradingRubricEvaluator"
DEST="$HOME/.local/share/ogre"
APPIMAGE="$DEST/OGRE.AppImage"   # fixed path: the in-app updater replaces this file in place

mkdir -p "$DEST" "$HOME/.local/share/applications" "$HOME/.local/share/icons"

if [[ $# -ge 1 ]]; then
  install -m 755 "$1" "$APPIMAGE"
else
  url=$(curl -fsSL "https://api.github.com/repos/$REPO/releases" \
    | grep -o 'https://[^"]*\.AppImage' | head -n1)
  [[ -n "$url" ]] || { echo "No AppImage found in GitHub releases" >&2; exit 1; }
  curl -fL "$url" -o "$APPIMAGE.tmp" && chmod 755 "$APPIMAGE.tmp" && mv "$APPIMAGE.tmp" "$APPIMAGE"
fi

icon="$HOME/.local/share/icons/ogre.png"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$here/../build/icon.png" ]] && cp "$here/../build/icon.png" "$icon"

cat > "$HOME/.local/share/applications/ogre-desktop.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=OGRE
Comment=Ollama Grading Rubric Evaluator
Exec=$APPIMAGE --no-sandbox %U
Icon=$icon
Categories=Education;
Terminal=false
StartupWMClass=ogre-desktop
DESK
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed to $APPIMAGE. Launch OGRE from your app menu; it checks for updates on start."
