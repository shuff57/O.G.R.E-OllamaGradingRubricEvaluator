#!/usr/bin/env bash
# Builds OGRE and installs it for this user: the program, a menu entry and
# its icon. Nothing is installed system-wide and no password is needed.
#
#   packaging/install.sh            build and install
#   packaging/install.sh --remove   take the program, menu entry and icon away
#
# The app's own data (settings, session records, its Chrome profile) lives in
# ~/.local/share/ogre and is never touched by either command.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
workspace=$(dirname "$here")
bin_dir=${XDG_BIN_HOME:-$HOME/.local/bin}
data_dir=${XDG_DATA_HOME:-$HOME/.local/share}
program=$bin_dir/ogre
entry=$data_dir/applications/ogre.desktop
icon=$data_dir/icons/hicolor/512x512/apps/ogre.png

refresh_menu() {
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$data_dir/applications" >/dev/null 2>&1 || true
    fi
}

if [[ ${1:-} == --remove ]]; then
    rm -f "$program" "$entry" "$icon"
    refresh_menu
    echo "Removed OGRE. Your data in $data_dir/ogre was left alone."
    exit 0
fi

cargo build --release -p ogre-app --manifest-path "$workspace/Cargo.toml"
target_dir=$(cargo metadata --no-deps --format-version 1 --manifest-path "$workspace/Cargo.toml" |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["target_directory"])')

install -Dm755 "$target_dir/release/ogre" "$program"
install -Dm644 "$here/ogre.png" "$icon"
mkdir -p "$(dirname "$entry")"
# The menu entry is named after the window's own id, "ogre", so the desktop
# shows this icon for the window.
sed "s|^Exec=.*|Exec=$program|" "$here/ogre.desktop" >"$entry"
refresh_menu

echo "Installed $program"
echo "It is in your applications menu as \"OGRE Grader\"."
case ":$PATH:" in
*":$bin_dir:"*) ;;
*) echo "Note: $bin_dir is not on your PATH, so start it from the menu." ;;
esac
