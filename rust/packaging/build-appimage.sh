#!/usr/bin/env bash
# Builds OGRE as a single AppImage file that runs on other Linux computers
# without installing anything.
#
#   packaging/build-appimage.sh           use appimagetool from PATH or $APPIMAGETOOL
#   packaging/build-appimage.sh --fetch   download appimagetool first if it is missing
#
# The result is target/dist/OGRE-<version>-x86_64.AppImage.
#
# Chrome or Edge is not part of the file: OGRE drives the one installed on the
# computer it runs on.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
workspace=$(dirname "$here")
tool_url=https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage

metadata=$(cargo metadata --no-deps --format-version 1 --manifest-path "$workspace/Cargo.toml")
target_dir=$(python3 -c 'import json, sys; print(json.load(sys.stdin)["target_directory"])' <<<"$metadata")
version=$(python3 -c 'import json, sys; print(next(p["version"] for p in json.load(sys.stdin)["packages"] if p["name"] == "ogre-app"))' <<<"$metadata")

tool=${APPIMAGETOOL:-$(command -v appimagetool || true)}
if [[ -z $tool ]]; then
    # Kept in a folder of its own, apart from anything it could be mixed up with.
    tool=$target_dir/tools/appimagetool/appimagetool-x86_64.AppImage
    if [[ ! -x $tool ]]; then
        if [[ ${1:-} != --fetch ]]; then
            echo "appimagetool was not found. Install it, set APPIMAGETOOL, or run this with --fetch" >&2
            echo "to download it from $tool_url" >&2
            exit 1
        fi
        mkdir -p "$(dirname "$tool")"
        curl --fail --location --silent --show-error --output "$tool" "$tool_url"
        chmod +x "$tool"
    fi
fi

cargo build --release -p ogre-app --manifest-path "$workspace/Cargo.toml"

app_dir=$target_dir/dist/OGRE.AppDir
rm -rf "$app_dir"
install -Dm755 "$target_dir/release/ogre" "$app_dir/usr/bin/ogre"
install -Dm644 "$here/ogre.desktop" "$app_dir/usr/share/applications/ogre.desktop"
install -Dm644 "$here/ogre.png" "$app_dir/usr/share/icons/hicolor/512x512/apps/ogre.png"
# What an AppImage has at its top: the entry, the icon, and what to run.
cp "$here/ogre.desktop" "$app_dir/ogre.desktop"
cp "$here/ogre.png" "$app_dir/ogre.png"
ln -s ogre.png "$app_dir/.DirIcon"
cat >"$app_dir/AppRun" <<'EOF'
#!/bin/sh
exec "$(dirname "$(readlink -f "$0")")/usr/bin/ogre" "$@"
EOF
chmod +x "$app_dir/AppRun"

out=$target_dir/dist/OGRE-$version-x86_64.AppImage
rm -f "$out"
# The tool is itself an AppImage; unpacking it to run works without FUSE.
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$tool" --no-appstream "$app_dir" "$out"
rm -rf "$app_dir"
echo "Built $out"
