#!/usr/bin/env bash
# Runs the bridge check with its drag-and-drop part, on a made-up screen, and
# does the dragging: the red box onto the green one, with a made-up pointer.
# Needs xvfb-run and xdotool. Build first: cargo build --release --example bridge_check
set -euo pipefail
cd "$(dirname "$0")"
export CEF_PATH="${CEF_PATH:-$HOME/.cache/ogre-cef}"
library="$(find "$CEF_PATH" -maxdepth 3 -name libcef.so -print -quit)"
export LD_LIBRARY_PATH="$(dirname "$library")${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
log="$(mktemp)"
export log
env -u WAYLAND_DISPLAY xvfb-run -a -s "-screen 0 1280x900x24" bash -c '
    OGRE_CHECK_DRAG=1 timeout 300 ./target/release/examples/bridge_check > "$log" 2>&1 &
    check=$!
    for _ in $(seq 1 240); do
        grep -q "READY FOR A DRAG" "$log" && break
        kill -0 "$check" 2>/dev/null || break
        sleep 1
    done
    window="$(xdotool search --name "OGRE built-in browser check" | head -1)"
    if [ -n "$window" ] && grep -q "READY FOR A DRAG" "$log"; then
        sleep 1
        # Press on the red box, move off it in steps, as a hand does, and
        # let go over the green one.
        xdotool mousemove --window "$window" 128 128
        sleep 0.4
        xdotool mousedown 1
        sleep 0.4
        for x in 136 150 170 200 240 280 320 360 400 408; do
            xdotool mousemove --window "$window" "$x" 140
            sleep 0.2
        done
        xdotool mouseup 1
    fi
    wait "$check"
' && status=0 || status=$?
grep -v "^\[[0-9]*:[0-9]*:.*\(ERROR\|WARNING\|INFO\)" "$log" | tail -6
rm -f "$log"
exit "$status"
