#!/usr/bin/env bash
# Builds OGRE with the built-in browser and starts it.
#
# The first build downloads Chromium (about 1 GB, into CEF_PATH) and needs
# CMake and Ninja. Later builds only compile what changed.
set -euo pipefail
cd "$(dirname "$0")"

export CEF_PATH="${CEF_PATH:-$HOME/.cache/ogre-cef}"
cargo build --release

# Chromium's library is loaded from where it was downloaded to.
library="$(find "$CEF_PATH" -maxdepth 3 -name libcef.so -print -quit)"
if [ -z "$library" ]; then
    echo "Chromium was not found under $CEF_PATH after the build." >&2
    exit 1
fi
export LD_LIBRARY_PATH="$(dirname "$library")${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec ./target/release/ogre-embedded "$@"
