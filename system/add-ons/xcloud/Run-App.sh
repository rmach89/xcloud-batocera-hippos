#!/bin/bash
# Runs the Xbox Cloud Gaming app (Electron) with the right environment.
# Used by Launch-XboxCloudGaming.sh. Extra arguments are passed to the app.
# Exits with the app's exit code (1 if the app isn't set up).
FILES=/userdata/system/add-ons/xcloud
RUNTIME="$FILES/runtime"
LOGDIR=/userdata/system/logs
BIN="$RUNTIME/electron"
LIBCHECK="$RUNTIME/.libcheck"   # remembered result of the library check
mkdir -p "$LOGDIR"

# the processor type picks the stand-in library built for it (PCs, 64-bit
# ARM boards, 32-bit ARM boards)
case "$(uname -m)" in
    x86_64|amd64)   ARCH=x64 ;;
    aarch64|arm64)  ARCH=arm64 ;;
    armv7*|armv8l)  ARCH=armv7l ;;
    *)              ARCH="$(uname -m)" ;;
esac
STUB="$FILES/lib/$ARCH"

# an engine update downloaded from Settings > Update engine takes over now
if [ -x "$FILES/runtime.next/electron" ]; then
    rm -rf "$FILES/runtime.old"
    if { [ ! -e "$RUNTIME" ] || mv "$RUNTIME" "$FILES/runtime.old"; } && mv "$FILES/runtime.next" "$RUNTIME"; then
        echo "Browser engine updated: $(grep -o '"electron": *"[^"]*"' "$RUNTIME/.built-from.json" 2>/dev/null)"
        rm -rf "$FILES/runtime.old"
    else
        [ -e "$RUNTIME" ] || mv "$FILES/runtime.old" "$RUNTIME" 2>/dev/null
        echo "Could not switch to the downloaded browser engine; keeping the current one."
    fi
fi

# an Electron already on the system (Build-Runtime.py found it and wrote
# runtime-shared.json): run the app with it, nothing of our own needed
APP_ARG=""
SHARED="$FILES/runtime-shared.json"
if [ -f "$SHARED" ]; then
    EXT="$(python3 -I -c 'import json, sys
try:
    print(json.load(open(sys.argv[1])).get("path", ""))
except Exception:
    pass' "$SHARED" 2>/dev/null)"
    if [ -n "$EXT" ] && [ -x "$EXT" ]; then
        BIN="$EXT"; APP_ARG="$FILES/app.asar"; RUNTIME="$FILES"; LIBCHECK="$FILES/.libcheck"
        echo "Using the Electron already on this system: $EXT"
    else
        echo "The Electron this app used ($EXT) isn't on the system any more: setting up the app's own."
        python3 "$FILES/Build-Runtime.py" || exit 1
        [ -f "$SHARED" ] && exec bash "$0" "$@"
    fi
fi

if [ ! -x "$BIN" ]; then
    echo "Could not find $BIN."
    exit 1
fi

# Batocera has no printing library (libcups), which the engine requires even
# though the app never prints.
#  - BUA installed: use BUA's shared libraries, never the stand-in.
#  - No BUA: use the do-nothing stand-in in ./lib, and only if the system
#    doesn't have the real library.
# Checking the engine's libraries is slow (it's a large program), so the
# result is worked out once and remembered until the engine changes.
BUA_DEP=/userdata/system/add-ons/.dep
if [ -d "$BUA_DEP" ]; then
    export LD_LIBRARY_PATH="$BUA_DEP${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    echo "BUA found: using its libraries from $BUA_DEP."
else
    if [ ! -f "$LIBCHECK" ] || [ "$BIN" -nt "$LIBCHECK" ]; then
        if ldd "$BIN" 2>/dev/null | grep -q 'libcups.so.2 => not found'; then echo stub > "$LIBCHECK"; else echo system > "$LIBCHECK"; fi
        missing="$(LD_LIBRARY_PATH="$STUB" ldd "$BIN" 2>/dev/null | grep 'not found')"
        [ -n "$missing" ] && echo "Missing libraries:" && echo "$missing"
    fi
    if [ "$(cat "$LIBCHECK" 2>/dev/null)" = "stub" ]; then
        if [ -d "$STUB" ]; then
            export LD_LIBRARY_PATH="$STUB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            echo "No BUA: using the stand-in printing library from $STUB."
        else
            # installed without the stand-in (the system had libcups2 then)
            echo "libcups2 isn't on this system any more, and the app's stand-in for it wasn't installed: run the installer again."
        fi
    fi
fi

export HOME="$FILES"
export XCLOUD_HOME="$FILES"
export XCLOUD_APP_LOG="$LOGDIR/xcloud-app.log"
# The screen: Batocera runs X11 on PCs and Wayland (labwc) on most ARM
# boards and newer handhelds. Use whichever EmulationStation was started
# with (WAYLAND_DISPLAY or DISPLAY); if neither is set, look for a Wayland
# screen, and fall back to X11.
if [ -z "$WAYLAND_DISPLAY" ] && [ -z "$DISPLAY" ]; then
    for dir in "$XDG_RUNTIME_DIR" /run/user/0 /var/run /run /tmp; do
        [ -n "$dir" ] || continue
        for sock in "$dir"/wayland-[0-9]; do
            if [ -S "$sock" ]; then
                export XDG_RUNTIME_DIR="$dir" WAYLAND_DISPLAY="$(basename "$sock")"
                break 2
            fi
        done
    done
fi
if [ -n "$WAYLAND_DISPLAY" ]; then
    echo "Screen: Wayland ($WAYLAND_DISPLAY)."
    SCREEN_ARGS="--ozone-platform=wayland --enable-features=UseOzonePlatform"
else
    export DISPLAY="${DISPLAY:-:0.0}"
    echo "Screen: X11 ($DISPLAY)."
    SCREEN_ARGS="--ozone-platform=x11"
fi
echo "Device: $(uname -m), $(awk '/MemTotal/ {printf "%.1f GB memory", $2/1048576}' /proc/meminfo 2>/dev/null)"
ulimit -n 819200 2>/dev/null

cd "$RUNTIME" || exit 1
"$BIN" --no-sandbox $SCREEN_ARGS $APP_ARG "$@"
