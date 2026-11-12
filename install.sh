#!/bin/bash
# One-step installer for Xbox Cloud Gaming on Batocera (and HippOS).
# Run it from the extracted zip folder in a terminal (F1 > Applications >
# xterm, or SSH):
#     bash "/userdata/Xbox Cloud Gaming/install.sh"
# It copies the files into place and installs everything: the xcloud
# system, the Xbox Cloud Gaming app (downloading the Electron browser
# engine), Launch Single Game if you want it (it asks), and the shortcuts in
# F1 > Applications.
# Nothing goes in the Ports menu.
ROOT="$(cd "$(dirname "$0")" && pwd)"
USERDATA=/userdata
FILES=$USERDATA/system/add-ons/xcloud
LOGDIR=$USERDATA/system/logs

say()  { echo "[Xbox Cloud Gaming] $*"; }
fail() { echo "[Xbox Cloud Gaming] ERROR: $*" >&2; exit 1; }

[ -d "$USERDATA/system" ] || fail "This must be run on Batocera or HippOS ($USERDATA/system not found)."
OS=batocera
[ -f "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" ] && OS=hippos
[ -f "$ROOT/system/add-ons/xcloud/app.asar" ] || fail "Run this from the extracted zip folder (system/add-ons/xcloud not found next to it)."
command -v python3 >/dev/null 2>&1 || fail "Python 3 is needed and wasn't found."

# Can this device run it? The browser engine (Electron) exists for 64-bit
# PCs, 64-bit ARM and 32-bit ARM (ARMv7). See "Compatibility" in README.txt.
case "$(uname -m)" in
    x86_64|amd64)   ARCH=x64 ;;
    aarch64|arm64)  ARCH=arm64 ;;
    armv7*|armv8l)  ARCH=armv7l ;;
    armv6*)  fail "This device (ARMv6: Raspberry Pi 1 / Zero / Zero W) can't run Xbox Cloud Gaming: there is no browser engine for it. Nothing was installed." ;;
    i?86)    fail "This device runs 32-bit x86, which can't run Xbox Cloud Gaming: there is no browser engine for it. Nothing was installed." ;;
    *)       fail "This device's processor ($(uname -m)) isn't supported: there is no browser engine for it. Nothing was installed." ;;
esac
mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)"
say "Device: $(uname -m), ${mem_mb:-?} MB memory."
if [ -n "$mem_mb" ] && [ "$mem_mb" -lt 1800 ]; then
    say "Warning: this device has less than 2 GB of memory. The app may be very slow or close by itself."
    say "It installs anyway; see Compatibility in README.txt."
fi

# --- a newer version on GitHub? ---
# The app's home: github.com/rmach89/xcloud-batocera-hippos. Each version
# is a Release there with its zip. If a newer one than this package is out,
# it's offered (downloaded, unpacked and its installer run instead). No
# internet, or GitHub not answering: this package installs as usual.
# XCLOUD_NO_UPDATE_CHECK=1 skips the check; XCLOUD_UPDATE=yes / no answers
# the question ahead of time.
REPO="${XCLOUD_REPO:-rmach89/xcloud-batocera-hippos}"
THIS_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/system/add-ons/xcloud/app-source/package.json" 2>/dev/null | head -n1)"
newer_than() {   # is $1 a later version than $2?
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}
if [ -z "$XCLOUD_NO_UPDATE_CHECK" ] && [ -n "$THIS_VERSION" ] && command -v curl >/dev/null 2>&1; then
    say "This package: v$THIS_VERSION. Checking GitHub for a newer version..."
    latest_json="$(curl -fsSL -m 15 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null)"
    read -r LATEST LATEST_ZIP < <(printf '%s' "$latest_json" | python3 -c '
import json, sys
try:
    r = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tag = str(r.get("tag_name", "")).lstrip("vV")
zips = [a.get("browser_download_url", "") for a in r.get("assets", []) if str(a.get("name", "")).lower().endswith(".zip")]
if tag and zips:
    print(tag, zips[0])
' 2>/dev/null)
    if [ -z "$LATEST" ]; then
        say "Couldn't reach GitHub (or no release there yet): installing this package."
    elif newer_than "$LATEST" "$THIS_VERSION"; then
        say "A newer version is out: v$LATEST (this package is v$THIS_VERSION)."
        GET="${XCLOUD_UPDATE:-}"
        if [ -z "$GET" ]; then
            if [ -t 0 ]; then
                read -r -p "Download and install v$LATEST instead? [Y/n] " a
                case "$a" in n|N|no|NO) GET=no ;; *) GET=yes ;; esac
            else
                GET=no
                say "(No one to ask here: installing this package. Run the installer in a terminal to get v$LATEST.)"
            fi
        fi
        if [ "$GET" = yes ]; then
            TMPD="$(mktemp -d "$USERDATA/.xcloud-update.XXXXXX" 2>/dev/null)"
            if [ -n "$TMPD" ] && curl -fL -m 600 --progress-bar -o "$TMPD/update.zip" "$LATEST_ZIP" \
               && python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$TMPD/update.zip" "$TMPD/x" 2>/dev/null; then
                NEW_INSTALL="$(find "$TMPD/x" -maxdepth 3 -name install.sh -path '*/install.sh' | head -n1)"
                if [ -n "$NEW_INSTALL" ] && [ -f "$(dirname "$NEW_INSTALL")/system/add-ons/xcloud/app.asar" ]; then
                    say "Running the v$LATEST installer..."
                    XCLOUD_NO_UPDATE_CHECK=1 bash "$NEW_INSTALL"; rc=$?
                    rm -rf "$TMPD"
                    exit $rc
                fi
                say "The download didn't look like an Xbox Cloud Gaming package: installing this one instead."
            else
                say "Couldn't download v$LATEST: installing this package instead."
            fi
            [ -n "$TMPD" ] && rm -rf "$TMPD"
        fi
    else
        say "This is the newest version."
    fi
fi

if [ "$OS" = hippos ]; then
    say "Installing on HippOS $(head -n1 "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" 2>/dev/null): everything goes in /userdata."
else
    say "Installing on Batocera: nothing is saved into its system area; a service puts the F1 shortcuts and carousel art back at every boot."
fi
say "Copying files into place..."
mkdir -p "$FILES" "$LOGDIR" || fail "Could not create folders."
# reinstalling after an uninstall that kept the sign-ins and profiles
if [ -f "$FILES/KEPT-FOR-REINSTALL.txt" ]; then
    rm -f "$FILES/KEPT-FOR-REINSTALL.txt"
    say "Found your kept sign-ins, profiles and settings; using them."
fi
# copy the package files, but keep an existing config.json (your settings)
for f in "$ROOT/system/add-ons/xcloud/"*; do
    name="$(basename "$f")"
    if [ "$name" = "config.json" ] && [ -f "$FILES/config.json" ]; then
        say "Keeping your existing config.json."
        # an old default for the return-to-carousel wait becomes the new one
        sed -i -E 's/("return_to_carousel_delay": *)(1\.1|0\.8|0\.4)([,}[:space:]])/\10.3\3/' "$FILES/config.json" 2>/dev/null
        continue
    fi
    cp -rf "$f" "$FILES/" || fail "Could not copy $name."
done
# fix Windows line endings on the installer, in case the zip was unpacked on a PC
tr -d '\r' < "$FILES/Install-XboxCloudGaming.sh" > "$FILES/Install-XboxCloudGaming.sh.tmp" \
    && mv "$FILES/Install-XboxCloudGaming.sh.tmp" "$FILES/Install-XboxCloudGaming.sh"

# Launch Single Game (optional): picking Xbox Cloud Gaming in the carousel
# opens the app straight away instead of showing its game list first.
# Asked here; XCLOUD_SINGLE_LAUNCH=yes or =no answers it ahead of time.
SINGLE="${XCLOUD_SINGLE_LAUNCH:-}"
if [ -z "$SINGLE" ]; then
    # optional on both systems: off unless you ask for it. Installing again
    # keeps what you chose before (xcloud already in launchsingle.systems).
    SINGLE=no
    tr -d '\r' 2>/dev/null < "$USERDATA/system/launchsingle.systems" | grep -qx '[[:space:]]*xcloud[[:space:]]*' && SINGLE=yes
    if [ -t 0 ]; then
        cat <<'SINGLE_EOF'

------------------------------------------------------------------------
 Launch Single Game (optional)
------------------------------------------------------------------------
 What it is: a small add-on for EmulationStation. When you pick a system
 in the carousel that holds exactly one game, it starts that game for you
 instead of showing a list with one entry in it.

 With it (Yes):
   - Pick Xbox Cloud Gaming in the carousel: the app opens straight away.
   - Close the app: you're back on the carousel.

 Without it (No):
   - Pick Xbox Cloud Gaming in the carousel: you see its list, with one
     entry, "Xbox Cloud Gaming". Press A on it to open the app.
   - Close the app: you're back on that list (B goes to the carousel).

 Good to know:
   - It only acts on the systems named in
     /userdata/system/launchsingle.systems. This installer adds just
     xcloud, so your other systems behave as before. If you already use
     Launch Single Game for other systems, they're left as they are.
   - With Settings > Batocera game list turned on, the Xbox Cloud list
     holds your cloud games, so single launch is switched off for it
     automatically while the list is on, whichever you choose here.
   - It's entirely up to you; Xbox Cloud Gaming works the same either
     way. Pressing Enter keeps what you have now (No on a first install).
   - Changed your mind? Run this installer again and answer the other
     way. Your sign-ins and settings are kept.
------------------------------------------------------------------------
SINGLE_EOF
        if [ "$SINGLE" = yes ]; then
            read -r -p "Keep Launch Single Game? [Y/n] " a
            case "$a" in n|N|no|NO) SINGLE=no ;; esac
        else
            read -r -p "Install Launch Single Game? [y/N] " a
            case "$a" in y|Y|yes|YES) SINGLE=yes ;; esac
        fi
    fi
fi
case "$SINGLE" in no|n|N|NO|0|false) SINGLE=no ;; *) SINGLE=yes ;; esac
if [ "$SINGLE" = yes ]; then
    say "Installing Xbox Cloud Gaming and Launch Single Game (downloads about 100 MB the first time)..."
else
    say "Installing Xbox Cloud Gaming without Launch Single Game (downloads about 100 MB the first time)..."
fi
XCLOUD_SINGLE_LAUNCH="$SINGLE" bash "$FILES/Install-XboxCloudGaming.sh"
cat "$LOGDIR/xcloud-install.log" 2>/dev/null
[ -f "$FILES/Uninstall-XboxCloudGaming.sh" ] || fail "Xbox Cloud Gaming didn't install; see above."

if [ -x "$FILES/runtime/electron" ]; then
    # check the same way the app runs: BUA's libraries if BUA is
    # installed, otherwise the stand-in printing library
    if [ -d "$USERDATA/system/add-ons/.dep" ]; then
        libpath="$USERDATA/system/add-ons/.dep"
    else
        libpath="$FILES/lib/$ARCH"
    fi
    missing="$(LD_LIBRARY_PATH="$libpath" ldd "$FILES/runtime/electron" 2>/dev/null | grep 'not found')"
    if [ -n "$missing" ]; then
        say "Warning: this system is missing libraries the app needs:"
        echo "$missing"
    else
        say "The newest browser engine is installed."
    fi
else
    say "The browser engine will download the first time you launch Xbox Cloud Gaming."
fi

echo
say "Done. Xbox Cloud Gaming appears in the carousel after EmulationStation restarts."
if [ -t 0 ]; then
    say "To see it, restart EmulationStation from Main Menu > Quit > Restart EmulationStation."
    read -r -p "Press Enter to exit the installer. " _
fi
exit 0
