#!/bin/bash
# Uninstaller for Xbox Cloud Gaming on Batocera (and HippOS).
# Run it in a terminal (F1 > Applications > xterm, or SSH):
#     bash /userdata/system/add-ons/xcloud/uninstall.sh
# It asks whether to keep Launch Single Game (which came with this
# package) and what to keep for a later reinstall: everything (the
# default), the settings only (profiles removed), or nothing.
# Add --all to remove everything without being asked:
#     bash /userdata/system/add-ons/xcloud/uninstall.sh --all
# The "Xbox Cloud Gaming Uninstaller" shortcut in F1 > Applications runs
# this in a terminal window with --from-menu (waits for Enter at the end).
# This file lives in the folder it may delete (--all), so read it whole
# before doing anything.
{
USERDATA=/userdata
FILES=$USERDATA/system/add-ons/xcloud
ES=$USERDATA/system/configs/emulationstation
PORTS=$USERDATA/roms/ports
LOGDIR=$USERDATA/system/logs
ALL=0
FROM_MENU=0
for arg in "$@"; do
    case "$arg" in
        --all) ALL=1 ;;
        --from-menu) FROM_MENU=1 ;;
    esac
done

say() { echo "[Xbox Cloud Gaming] $*"; }
finish() {   # finish <exit code>: in the menu's window, wait so you can read it
    if [ "$FROM_MENU" = 1 ] && [ -t 0 ]; then
        echo
        read -r -p "Press Enter to exit the uninstaller. " _
    fi
    exit "$1"
}

[ -d "$USERDATA/system" ] || { echo "This must be run on Batocera or HippOS."; finish 1; }

# --- a child or teen plays on this machine: the adult PIN first ---
# (a child's or teen's profile is set up). Without the PIN nothing is
# removed, with --all too.
child_here() {
    python3 - "$FILES" <<'CHILD_EOF'
import json, os, sys
f = sys.argv[1]
def load(n):
    try:
        with open(os.path.join(f, n), encoding="utf-8") as h:
            return json.load(h)
    except Exception:
        return {}
p = load("profiles.json")
child = any(isinstance(x, dict) and x.get("age") in ("Child", "Teen") for x in p.get("profiles", []))
sys.exit(0 if child else 1)
CHILD_EOF
}
pin_ok() {   # pin_ok <code>: matches the salted SHA-256 in "pin"
    python3 - "$FILES/pin" "$1" <<'PIN_EOF'
import hashlib, sys
try:
    salt, h = open(sys.argv[1], encoding="utf-8").read().strip().split(":")
except Exception:
    sys.exit(1)
sys.exit(0 if hashlib.sha256((salt + ":" + sys.argv[2]).encode()).hexdigest() == h else 1)
PIN_EOF
}
if [ -d "$FILES" ] && command -v python3 >/dev/null 2>&1 && child_here; then
    echo
    say "A child's or teen's profile is set up on this machine, so removing Xbox Cloud Gaming"
    say "needs the adult PIN (the one the app asks for)."
    if [ ! -s "$FILES/pin" ]; then
        say "No PIN has been set yet. Open an adult's profile in the app to create one"
        say "(or remove the child's or teen's profile there), then run the uninstaller again."
        say "Nothing was changed."
        finish 1
    fi
    if [ ! -t 0 ]; then
        say "Run this in a terminal to enter the PIN. Nothing was changed."
        finish 1
    fi
    tries=0
    while :; do
        read -r -s -p "PIN: " code; echo
        if pin_ok "$code"; then break; fi
        tries=$((tries + 1))
        if [ "$tries" -ge 3 ]; then
            say "Wrong PIN. Nothing was changed."
            echo "$(date): uninstall stopped: wrong PIN (a child's profile is set up)" >> "$LOGDIR/xcloud-install.log"
            finish 1
        fi
        say "Wrong PIN, try again."
    done
fi

# --- are you sure? ---
if [ "$ALL" != 1 ] && [ -t 0 ]; then
    echo
    say "You are about to remove Xbox Cloud Gaming."
    read -r -p "Are you sure? [y/N] " a
    case "$a" in
        y|Y|yes|YES) ;;
        *) say "Nothing was changed."; finish 0 ;;
    esac
fi

# --- HippOS: our logo in its built-in theme, and its start script ---
if [ -s "$FILES/hippos-theme-files.txt" ]; then
    while IFS=$'\t' read -r dest src; do
        [ -n "$dest" ] && [ -e "$dest" ] && cmp -s "$src" "$dest" && sudo -n rm -f "$dest" 2>/dev/null
    done < "$FILES/hippos-theme-files.txt"
fi
rm -f "$ES/scripts/start/xcloud-theme-logo.sh"

# --- Launch Single Game: keep it? (the default is keep) ---
LS_ARM="$ES/scripts/system-selected/launchsingle-arm.sh"
LS_LAUNCH="$ES/scripts/game-selected/launchsingle-launch.sh"
launchsingle=keep
if [ -f "$LS_ARM" ] || [ -f "$LS_LAUNCH" ]; then
    if [ "$ALL" = 1 ]; then
        launchsingle=remove
    elif [ -t 0 ]; then
        echo
        say "This package came with Launch Single Game, which opens a system's game"
        say "straight away when that system has exactly one game."
        read -r -p "Keep Launch Single Game for your other systems? [Y/n] " a
        case "$a" in n|N|no|NO) launchsingle=remove ;; esac
    fi
fi

# --- remove Xbox Cloud Gaming ---
if [ -f "$FILES/Uninstall-XboxCloudGaming.sh" ]; then
    say "Removing Xbox Cloud Gaming..."
    XCLOUD_LAUNCHSINGLE="$launchsingle" bash "$FILES/Uninstall-XboxCloudGaming.sh"
    cat "$LOGDIR/xcloud-install.log" 2>/dev/null
elif [ -f "$PORTS/Uninstall Xbox Cloud Gaming.sh" ]; then
    # installed by an older version, which kept its uninstaller in Ports
    say "Removing Xbox Cloud Gaming (older version)..."
    bash "$PORTS/Uninstall Xbox Cloud Gaming.sh"
    cat "$LOGDIR/xcloud-install.log" 2>/dev/null
    if [ "$launchsingle" = remove ]; then
        rm -f "$LS_ARM" "$LS_LAUNCH" /tmp/launchsingle_armed
        rm -rf "$USERDATA/system/launchsingle"
        say "Removed Launch Single Game."
    fi
else
    say "Xbox Cloud Gaming's uninstaller wasn't found; removing its files directly..."
    rm -f "$ES/es_systems_xcloud.cfg"
    rm -f "$USERDATA/roms/xcloud/Xbox Cloud Gaming.xcloud" "$USERDATA/roms/xcloud/gamelist.xml" "$USERDATA/roms/xcloud/images/xcloud.png"
    rmdir "$USERDATA/roms/xcloud/images" "$USERDATA/roms/xcloud" 2>/dev/null
    rm -rf "$FILES/runtime" "$FILES/runtime.old" "$FILES/runtime.next" "$FILES/update-staged" "$FILES/update-staged.new"
    rm -f "$USERDATA/system/.local/share/applications/xcloud-xbox-cloud-gaming.desktop" \
          "$USERDATA/system/.local/share/applications/xcloud-uninstall.desktop" \
          "$USERDATA/system/.local/share/applications/xcloud-settings.desktop" \
          /usr/share/applications/xcloud-xbox-cloud-gaming.desktop \
          /usr/share/applications/xcloud-uninstall.desktop \
          /usr/share/applications/xcloud-settings.desktop \
          "$USERDATA/.local/share/applications/xcloud-xbox-cloud-gaming.desktop" \
          "$USERDATA/.local/share/applications/xcloud-uninstall.desktop" \
          "$USERDATA/.local/share/applications/xcloud-settings.desktop"
    rm -rf "$USERDATA/system/.cache/menus"
    # the xcloud service, or the custom.sh line
    if [ -f "$USERDATA/system/services/xcloud" ]; then
        for svc in batocera-services hippos-services; do
            command -v $svc >/dev/null 2>&1 && { $svc stop xcloud >/dev/null 2>&1; $svc disable xcloud >/dev/null 2>&1; }
        done
        rm -f "$USERDATA/system/services/xcloud"
    fi
    if [ -f "$USERDATA/system/custom.sh" ] && grep -q '# xcloud-boot-restore' "$USERDATA/system/custom.sh"; then
        grep -v '# xcloud-boot-restore' "$USERDATA/system/custom.sh" > "$USERDATA/system/custom.sh.tmp" \
            && cat "$USERDATA/system/custom.sh.tmp" > "$USERDATA/system/custom.sh" && rm -f "$USERDATA/system/custom.sh.tmp"
        if [ -f "$FILES/created-custom-sh" ] && ! grep -vqE '^[[:space:]]*(#.*)?$' "$USERDATA/system/custom.sh"; then
            rm -f "$USERDATA/system/custom.sh"
        fi
    fi
    if [ -f "$FILES/added-to-list" ] && [ -f "$USERDATA/system/launchsingle.systems" ]; then
        tr -d '\r' < "$USERDATA/system/launchsingle.systems" | grep -vx '[[:space:]]*xcloud[[:space:]]*' > "$USERDATA/system/launchsingle.systems.tmp"
        mv "$USERDATA/system/launchsingle.systems.tmp" "$USERDATA/system/launchsingle.systems"
    fi
    if [ "$launchsingle" = remove ]; then
        rm -f "$LS_ARM" "$LS_LAUNCH" /tmp/launchsingle_armed
        rm -rf "$USERDATA/system/launchsingle"
        say "Removed Launch Single Game."
    fi
fi
# nothing of this package left in Ports
rm -f "$PORTS/Install Xbox Cloud Gaming.sh" "$PORTS/Uninstall Xbox Cloud Gaming.sh" \
      "$PORTS/Install Launch Single Game.sh" "$PORTS/Uninstall Launch Single Game.sh"

# --- sign-ins, profiles and settings: what to keep for a reinstall (the default is everything) ---
#   1 keep everything   2 remove the profiles, keep the settings   3 remove everything
if [ -d "$FILES" ]; then
    keep=1
    if [ "$ALL" = 1 ]; then
        keep=3
    elif [ -t 0 ]; then
        echo
        say "What should be kept for a later reinstall?"
        echo "  1) Keep everything: everyone's Xbox sign-ins, profiles, PIN and settings"
        echo "  2) Remove the profiles (sign-ins, gamerpics and the PIN), keep the settings"
        echo "  3) Remove everything"
        read -r -p "Choose 1, 2 or 3 [1]: " a
        case "$a" in 2) keep=2 ;; 3) keep=3 ;; esac
    fi
    if [ "$keep" = 3 ]; then
        rm -rf "$FILES"
        say "Deleted $FILES (sign-ins, profiles, PIN and settings)."
    else
        # the package's own files go; what belongs to the people who play
        # stays (profile, profiles.json, profile-settings, profile-pics, pin,
        # config.json, picked-games.json and the small "seen it" files)
        ( cd "$FILES" 2>/dev/null && rm -rf app.asar app-source lib launchsingle runtime runtime.old runtime.next runtime.new \
            electron-* theme-backups ./*.sh ./*.py es_systems_xcloud.cfg gamelist.xml xcloud.png xcloud1.png \
            xcloud-icon.png xcloud-settings-icon.png xcloud-uninstall-icon.png xcloud-hippos.png xcloud-hippos-logo.sh hippos-theme-files.txt xcloud-apply-update.sh last-version xcloud-background.jpg xcloud-intro.mp4 xcloud-intro.webm xcloud-intro-frames.webp xcloud-intro-audio.ogg \
            README.txt added-to-list theme-installed.txt )
        if [ "$keep" = 2 ]; then
            # everyone's sign-in and profile go: the browser storage, the
            # profiles and their own settings, gamerpics, the PIN and the
            # "a child signed in" note
            ( cd "$FILES" 2>/dev/null && rm -rf profile profiles.json profile-settings profile-pics pin reset-pin \
                children-mode rating-cache.json pick-tip-due )
            cat > "$FILES/KEPT-FOR-REINSTALL.txt" <<'KEPT_EOF'
Xbox Cloud Gaming was uninstalled. The profiles, everyone's Xbox sign-in
and the PIN were removed; the settings (config.json) were kept, so a
reinstall keeps your Settings choices. Everyone signs in again.

To remove the settings too, delete this whole folder:
    /userdata/system/add-ons/xcloud
KEPT_EOF
            say "Removed the profiles, sign-ins and PIN; kept the settings in $FILES."
        else
            cat > "$FILES/KEPT-FOR-REINSTALL.txt" <<'KEPT_EOF'
Xbox Cloud Gaming was uninstalled, but these were kept so a reinstall
picks up where you left off: everyone's Xbox sign-in (profile), the
profiles (profiles.json, profile-settings, profile-pics), the PIN and
the settings (config.json).

To remove them too, delete this whole folder:
    /userdata/system/add-ons/xcloud
KEPT_EOF
            say "Kept the sign-ins, profiles, PIN and settings in $FILES, so a reinstall keeps them."
        fi
        say "(To remove what's left later, delete that folder.)"
    fi
fi

echo
say "Done. Xbox Cloud Gaming has been removed."
# EmulationStation reloads its systems and games by itself (the same as Main
# Menu > Game settings > Update gamelists), so it leaves the carousel without a restart
if command -v curl >/dev/null 2>&1; then
    setsid bash -c "sleep 2; curl -s -m 10 http://127.0.0.1:1234/reloadgames" < /dev/null > /dev/null 2>&1 &
    say "EmulationStation updates its carousel in a moment."
else
    say "To see it gone from the carousel: Main Menu > Game settings > Update gamelists."
fi
finish 0
}
