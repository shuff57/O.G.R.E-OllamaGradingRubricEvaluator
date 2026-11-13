#!/usr/bin/env bash
# Builds OGRE with the built-in browser and installs it for this user: the
# program with the Chromium it brings, a command to start it, a menu entry
# and its icon. Nothing is installed system-wide and no password is needed.
#
#   ./install.sh            build and install
#   ./install.sh --remove   take all of that away again
#
# It installs beside the usual OGRE, not instead of it, and shares its data
# (settings, session records, saved rubrics and mappings) in
# ~/.local/share/ogre, which neither command touches.
#
# The first build downloads Chromium (about 1 GB, into CEF_PATH) and needs
# CMake and Ninja.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
bin_dir=${XDG_BIN_HOME:-$HOME/.local/bin}
data_dir=${XDG_DATA_HOME:-$HOME/.local/share}
lib_dir=${OGRE_LIB_HOME:-$HOME/.local/lib}/ogre-built-in
command=$bin_dir/ogre-built-in
entry=$data_dir/applications/ogre-built-in.desktop
icon=$data_dir/icons/hicolor/512x512/apps/ogre.png

refresh_menu() {
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$data_dir/applications" >/dev/null 2>&1 || true
    fi
}

if [[ ${1:-} == --remove ]]; then
    rm -rf "$lib_dir"
    rm -f "$command" "$entry"
    refresh_menu
    echo "Removed OGRE with the built-in browser. Your data in $data_dir/ogre was left alone,"
    echo "and so was the icon, which the usual OGRE uses too."
    exit 0
fi

export CEF_PATH="${CEF_PATH:-$HOME/.cache/ogre-cef}"
(cd "$here" && cargo build --release)

library=$(find "$CEF_PATH" -maxdepth 3 -name libcef.so -print -quit)
if [[ -z $library ]]; then
    echo "Chromium was not found under $CEF_PATH after the build." >&2
    exit 1
fi
chromium=$(dirname "$library")

# The program and what Chromium needs to run, all in one folder. Left out:
# what is only there for building, and chrome-sandbox, which Chromium
# refuses to start beside unless root owns it. Without it Chromium uses the
# sandbox the system gives every user.
rm -rf "$lib_dir"
mkdir -p "$lib_dir"
install -m755 "$here/target/release/ogre-embedded" "$lib_dir/ogre-embedded"
for item in "$chromium"/*; do
    case $(basename "$item") in
    include | libcef_dll | cmake | CMakeLists.txt | archive.json | CREDITS.html | chrome-sandbox) ;;
    *) cp -r "$item" "$lib_dir/" ;;
    esac
done
# As downloaded, Chromium's library carries about 1.2 GB of debugging
# information that running it does not need.
if command -v strip >/dev/null 2>&1; then
    strip --strip-unneeded "$lib_dir/libcef.so" || true
fi

mkdir -p "$bin_dir"
cat >"$command" <<LAUNCHER
#!/usr/bin/env bash
# Starts OGRE with the built-in browser. Written by rust/embedded/install.sh.
export LD_LIBRARY_PATH="$lib_dir\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
exec "$lib_dir/ogre-embedded" "\$@"
LAUNCHER
chmod 755 "$command"

install -Dm644 "$here/../packaging/ogre.png" "$icon"
mkdir -p "$(dirname "$entry")"
# Named after the window's own id, "ogre", so the desktop shows the icon.
cat >"$entry" <<ENTRY
[Desktop Entry]
Type=Application
Name=OGRE Grader (built-in browser)
GenericName=Grading assistant
Comment=Grade written answers with an AI, with the grading site inside OGRE's window
Exec=$command
Icon=ogre
Categories=Education;
Terminal=false
StartupWMClass=ogre
ENTRY
refresh_menu

echo "Installed $command ($(du -sh "$lib_dir" | cut -f1) in $lib_dir)"
echo "It is in your applications menu as \"OGRE Grader (built-in browser)\"."
case ":$PATH:" in
*":$bin_dir:"*) ;;
*) echo "Note: $bin_dir is not on your PATH, so start it from the menu." ;;
esac
