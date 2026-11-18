#!/bin/bash
# One-step installer for Xbox Cloud Gaming on Batocera (and HippOS).
# Run it on its own in a terminal (F1 > Applications > xterm, or SSH): it
# downloads the newest version straight from the project's main branch on
# GitHub and installs that, so it's always up to date:
#     curl -fsSL https://raw.githubusercontent.com/rmach89/xcloud-batocera-hippos/main/install.sh -o /tmp/xcloud-install.sh
#     bash /tmp/xcloud-install.sh
# Run from a copy of the repository (git clone), it installs that copy,
# after offering the newer one if main has moved on.
# XCLOUD_TAG=v1.3.2 installs that tagged version instead of main, and keeps
# the app on it (Settings > Updates then follows the tag, not main): for a
# distribution that wants to pin a known version.
# It copies the files into place and installs everything: the xcloud
# system, the Xbox Cloud Gaming app (downloading the Electron browser
# engine), Launch Single Game if you want it (it asks), and the shortcuts in
# F1 > Applications.
# Nothing goes in the Ports menu.
# The package folder is the one this script is in. Piped in (curl ... | bash)
# it isn't in any folder, so it downloads the package (standalone, below)
# rather than taking whatever folder it happens to be run from.
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    ROOT=/nonexistent
fi
USERDATA=/userdata
FILES=$USERDATA/system/add-ons/xcloud
LOGDIR=$USERDATA/system/logs

say()  { echo "[Xbox Cloud Gaming] $*"; }
fail() { echo "[Xbox Cloud Gaming] ERROR: $*" >&2; exit 1; }

[ -d "$USERDATA/system" ] || fail "This must be run on Batocera or HippOS ($USERDATA/system not found)."
OS=batocera
[ -f "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" ] && OS=hippos
# On HippOS the installer asks nothing (so it can also be run by a tool that can't answer):
# Launch Single Game is left off and a newer version on main, if any, is installed.
ASK=1
[ "$OS" = hippos ] && ASK=''
can_ask() { [ -n "$ASK" ] && [ -t 0 ]; }
# Run from BUA (Batocera Unofficial Add-ons): BUA puts in its own "dialog"
# that shows the question on its screen and hands back the answer. Plain
# terminal prompts would wait unseen there, so questions go through dialog.
BUA=
[ "$(type -t dialog 2>/dev/null)" = function ] && BUA=1
ask_bua() {   # ask_bua <title> <text>: yes / no on BUA's screen (0 = yes)
    dialog --title "$1" --yesno "$2" 0 0
}
# on its own (no package next to it): the package comes from GitHub, below
STANDALONE=
[ -f "$ROOT/system/add-ons/xcloud/app.asar" ] || STANDALONE=1
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

# --- where the newest version comes from: the main branch on GitHub ---
# Its version is the one in main's package.json; the whole branch comes as
# one download (GitHub packs it on request), is unpacked into a temporary
# folder in /userdata, installed from there and then deleted.
# XCLOUD_REPO / XCLOUD_BRANCH pick another copy, XCLOUD_TAG a tagged
# version; XCLOUD_VERSION_URL and XCLOUD_PACKAGE_URL point both downloads
# elsewhere (for testing).
REPO="${XCLOUD_REPO:-rmach89/xcloud-batocera-hippos}"
if [ -n "$XCLOUD_TAG" ]; then
    BRANCH="$XCLOUD_TAG"; REFPATH="refs/tags/$XCLOUD_TAG"
else
    BRANCH="${XCLOUD_BRANCH:-main}"; REFPATH="refs/heads/$BRANCH"
fi
VER_URL="${XCLOUD_VERSION_URL:-https://raw.githubusercontent.com/$REPO/$BRANCH/system/add-ons/xcloud/app-source/package.json}"
PKG_URL="${XCLOUD_PACKAGE_URL:-https://codeload.github.com/$REPO/zip/$REFPATH}"
main_version() {   # the version on main, or nothing (no internet)
    curl -fsSL -m 20 "$VER_URL?t=$(date +%s)" 2>/dev/null | python3 -I -c '
import json, sys
try:
    print(str(json.load(sys.stdin).get("version", "")).strip())
except Exception:
    pass' 2>/dev/null
}
fetch_main() {   # fetch_main <empty dir>: downloads and unpacks main there; prints its package folder
    curl -fL -m 900 --progress-bar -o "$1/package.zip" "$PKG_URL" || return 1
    python3 -I -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1/package.zip" "$1/x" 2>/dev/null || return 1
    rm -f "$1/package.zip"
    local inst; inst="$(find "$1/x" -maxdepth 3 -name install.sh | head -n1)"
    [ -n "$inst" ] && [ -f "$(dirname "$inst")/system/add-ons/xcloud/app.asar" ] || return 1
    dirname "$inst"
}
run_installer() {   # run_installer <package folder>: its own installer, asking in this terminal
    if [ -n "$ASK" ] && [ -z "$BUA" ] && [ ! -t 0 ] && ( : < /dev/tty ) 2>/dev/null; then
        XCLOUD_NO_UPDATE_CHECK=1 bash "$1/install.sh" < /dev/tty
    else
        XCLOUD_NO_UPDATE_CHECK=1 bash "$1/install.sh"
    fi
}

# --- on its own: download the newest version and install that ---
if [ -n "$STANDALONE" ]; then
    command -v curl >/dev/null 2>&1 || fail "curl is needed to download Xbox Cloud Gaming and wasn't found. Nothing was installed."
    say "Getting the newest version from GitHub ($REPO, $BRANCH)..."
    MAIN_VER="$(main_version)"
    [ -n "$MAIN_VER" ] && say "Newest version: v$MAIN_VER. Downloading..."
    TMPD="$(mktemp -d "$USERDATA/.xcloud-download.XXXXXX" 2>/dev/null)" || fail "Couldn't make a folder in $USERDATA to download into."
    PKG="$(fetch_main "$TMPD")" || { rm -rf "$TMPD"; fail "Couldn't download or unpack the newest version (no internet, or GitHub didn't answer). Nothing was installed."; }
    say "Downloaded. Running its installer..."
    run_installer "$PKG"; rc=$?
    rm -rf "$TMPD"
    exit $rc
fi

# --- a newer version on GitHub? ---
# The app's home: github.com/rmach89/xcloud-batocera-hippos. If main holds
# a newer version than this copy, it's offered (downloaded, unpacked and its
# installer run instead). No internet, or GitHub not answering: this copy
# installs as usual.
# XCLOUD_NO_UPDATE_CHECK=1 skips the check; XCLOUD_UPDATE=yes / no answers
# the question ahead of time.
THIS_VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/system/add-ons/xcloud/app-source/package.json" 2>/dev/null | head -n1)"
newer_than() {   # is $1 a later version than $2?
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}
if [ -z "$XCLOUD_NO_UPDATE_CHECK" ] && [ -n "$THIS_VERSION" ] && command -v curl >/dev/null 2>&1; then
    say "This package: v$THIS_VERSION. Checking GitHub for a newer version..."
    LATEST="$(main_version)"
    if [ -z "$LATEST" ]; then
        say "Couldn't reach GitHub: installing this package."
    elif newer_than "$LATEST" "$THIS_VERSION"; then
        say "A newer version is out: v$LATEST (this package is v$THIS_VERSION)."
        GET="${XCLOUD_UPDATE:-}"
        [ -z "$GET" ] && [ "$OS" = hippos ] && GET=yes   # nothing asked on HippOS: the newer one
        if [ -z "$GET" ] && [ -n "$BUA" ] && [ -n "$ASK" ]; then
            if ask_bua "Xbox Cloud Gaming" "A newer version is out: v$LATEST (this package is v$THIS_VERSION). Download and install v$LATEST instead?"; then GET=yes; else GET=no; fi
        fi
        if [ -z "$GET" ]; then
            if can_ask; then
                read -r -p "Download and install v$LATEST instead? [Y/n] " a
                case "$a" in n|N|no|NO) GET=no ;; *) GET=yes ;; esac
            else
                GET=no
                say "(No one to ask here: installing this package. Run the installer in a terminal to get v$LATEST.)"
            fi
        fi
        if [ "$GET" = yes ]; then
            TMPD="$(mktemp -d "$USERDATA/.xcloud-update.XXXXXX" 2>/dev/null)"
            if [ -n "$TMPD" ] && PKG="$(fetch_main "$TMPD")"; then
                say "Running the v$LATEST installer..."
                run_installer "$PKG"; rc=$?
                rm -rf "$TMPD"
                exit $rc
            fi
            say "Couldn't download v$LATEST: installing this package instead."
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
# the full instructions, next to the app
[ -f "$ROOT/README.txt" ] && cp -f "$ROOT/README.txt" "$FILES/README.txt"
# pinned to a tag (XCLOUD_TAG): the app's own updates follow that tag, not main
if [ -n "$XCLOUD_TAG" ]; then
    echo "tag $XCLOUD_TAG" > "$FILES/update-ref"
    say "Pinned to $XCLOUD_TAG: Settings > Updates follows that tag, not main."
else
    rm -f "$FILES/update-ref"
fi
# fix Windows line endings on the installer, in case it was copied from a PC
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
    if [ "$OS" = hippos ]; then
        # nothing asked on HippOS: no Launch Single Game (XCLOUD_SINGLE_LAUNCH=yes adds it)
        SINGLE=no
        say "HippOS: Launch Single Game is left off (XCLOUD_SINGLE_LAUNCH=yes bash install.sh adds it)."
    elif [ -n "$BUA" ]; then
        if ask_bua "Launch Single Game (optional)" "With it, picking Xbox Cloud Gaming in the carousel opens the app straight away, and closing the app takes you back to the carousel. Without it, you see Xbox Cloud Gaming's list first and press A on it. It only acts on Xbox Cloud Gaming; your other systems behave as before. Xbox Cloud Gaming works the same either way.

Install Launch Single Game?"; then SINGLE=yes; else SINGLE=no; fi
    elif can_ask; then
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
if [ -z "$BUA" ] && can_ask; then
    say "To see it, restart EmulationStation from Main Menu > Quit > Restart EmulationStation."
    read -r -p "Press Enter to exit the installer. " _
fi
exit 0
