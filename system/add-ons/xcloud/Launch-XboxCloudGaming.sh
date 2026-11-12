#!/bin/bash
# Starts the Xbox Cloud Gaming app fullscreen.
#   from the carousel (the xcloud system):  Launch-XboxCloudGaming.sh --from-es <entry>
#     (a game's entry holds its Microsoft Store ID: the app opens that game)
#   from F1 > Applications:                 Launch-XboxCloudGaming.sh
#   the settings screen only (F1 shortcut): Launch-XboxCloudGaming.sh --settings
FILES=/userdata/system/add-ons/xcloud
RUNTIME="$FILES/runtime"
LOGDIR=/userdata/system/logs
mkdir -p "$LOGDIR"
exec > "$LOGDIR/xcloud.log" 2>&1
echo "$(date): launching Xbox Cloud Gaming${1:+ ($1)}"
# an app update from Settings > Updates still being installed (it runs in the
# background after the app closes): wait for it, up to 3 minutes
for i in $(seq 1 180); do
    [ -e /tmp/xcloud-updating ] && kill -0 "$(cat /tmp/xcloud-updating 2>/dev/null)" 2>/dev/null || break
    [ "$i" = 1 ] && echo "an app update is still being installed: waiting for it"
    sleep 1
done
OS=batocera
[ -f "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" ] && OS=hippos

# Launched from EmulationStation: get the "back to the carousel" keyboard
# ready now, so it can act the moment the app closes (see
# Return-To-Carousel.py and config.json).
TRIGGER=""
# a game from Batocera's list (Settings > Batocera game list): its ID
GAME_ARG=""
if [ "$1" = "--from-es" ] && [ -f "$2" ]; then
    id="$(head -c 64 "$2" | tr -d '\r\n[:space:]')"
    if printf '%s' "$id" | grep -qE '^[0-9A-Z]{12}$'; then
        GAME_ARG="--xcloud-game=$id"
        echo "game from Batocera's list: $id ($(basename "$2"))"
    fi
fi
# with the games in Batocera's list, you come back to that list (as with any
# other system), so there's no going back to the carousel
GAME_LIST=off
grep -qE '"game_list": *"(all|picked)"' "$FILES/config.json" 2>/dev/null && GAME_LIST=on
# Launch Single Game is optional: without it (or with xcloud not in its list)
# picking Xbox Cloud Gaming shows its list, and you come back to that list too
LS_SCRIPT=/userdata/system/configs/emulationstation/scripts/game-selected/launchsingle-launch.sh
LS_LIST=/userdata/system/launchsingle.systems
SINGLE=off
if [ -f "$LS_SCRIPT" ]; then
    if [ ! -f "$LS_LIST" ] || tr -d '\r' < "$LS_LIST" | grep -qx '[[:space:]]*xcloud[[:space:]]*'; then SINGLE=on; fi
fi
[ "$1" = "--from-es" ] && [ "$GAME_LIST" = off ] && [ "$SINGLE" = off ] && echo "Launch Single Game isn't set up for xcloud: back to its list afterwards"
if [ "$1" = "--from-es" ] && [ "$GAME_LIST" = off ] && [ "$SINGLE" = on ]; then
    TRIGGER="/tmp/xcloud-app-closed.$$"
    rm -f "$TRIGGER"
    setsid python3 "$FILES/Return-To-Carousel.py" --armed "$TRIGGER" < /dev/null > /dev/null 2>&1 &
fi

# F1 > Applications shortcuts: they have to live in a system folder, which a
# Batocera update replaces. Put back any that went missing, from the copies
# kept in /userdata.
APPS=/userdata/system/.local/share/applications
SYSAPPS=/usr/share/applications
restored=0
# (not on HippOS: its desktop menu reads them from /userdata)
[ "$OS" = hippos ] && APPS=/nonexistent
for f in xcloud-xbox-cloud-gaming.desktop xcloud-settings.desktop xcloud-uninstall.desktop; do
    if [ -f "$APPS/$f" ] && [ ! -f "$SYSAPPS/$f" ] && cp -f "$APPS/$f" "$SYSAPPS/$f" 2>/dev/null; then
        chmod 755 "$SYSAPPS/$f"
        restored=$((restored+1))
    fi
done
if [ "$restored" -gt 0 ]; then
    echo "Put back $restored F1 > Applications shortcut(s) (after a Batocera update)."
    rm -rf /userdata/system/.cache/menus
fi

# The browser engine: only run the (slower) setup step when it's missing or
# the app inside it is out of date; normally this is skipped.
if [ ! -x "$RUNTIME/electron" ] || ! cmp -s "$FILES/app.asar" "$RUNTIME/resources/app.asar"; then
    python3 "$FILES/Build-Runtime.py" || { echo "Could not set up the app; see the message above."; exit 1; }
fi

# HippOS turns controller button combos into key presses (Select+Start ->
# Esc, Select+B -> Space...), meant for EmulationStation and emulators. In
# the app those would land on the Xbox page, so while it's open the combos
# are switched off (volume and screenshot keep working); the app's own
# Select+Start (View+Menu) hold quits it. Back to EmulationStation's after.
HOTKEYS=""
if [ "$OS" = hippos ] && command -v hippos-hotkeys >/dev/null 2>&1; then
    HOTKEYS=hippos-hotkeys
    hippos-hotkeys --new-context xcloud '{}' >/dev/null 2>&1 && echo "HippOS: its controller hotkeys are off while the app is open"
fi

if [ "$1" = "--settings" ]; then
    bash "$FILES/Run-App.sh" --xcloud-settings
else
    bash "$FILES/Run-App.sh" $GAME_ARG
fi
echo "$(date): Xbox Cloud Gaming exited with code $?"
[ -n "$HOTKEYS" ] && hippos-hotkeys --default-context >/dev/null 2>&1

# tell the waiting keyboard the app has closed; EmulationStation comes back
# as soon as this script ends
if [ -n "$TRIGGER" ]; then
    # while EmulationStation comes back, Launch Single Game must not start
    # the app again (removed once the return to the carousel is done)
    echo xcloud > /tmp/launchsingle_hold
    : > "$TRIGGER"
    # tidy up the marker if nothing picked it up (e.g. the return is turned off)
    setsid bash -c "sleep 5; rm -f '$TRIGGER'" < /dev/null > /dev/null 2>&1 &
fi
# the game list changed while the app was open: EmulationStation reloads its
# games once it's back, so the new list shows
if [ -f /tmp/xcloud-gamelist-changed ]; then
    rm -f /tmp/xcloud-gamelist-changed
    echo "Batocera's game list changed: reloading EmulationStation's games"
    setsid bash -c "sleep 2; curl -s -m 5 http://127.0.0.1:1234/reloadgames" < /dev/null > /dev/null 2>&1 &
fi
# an app update downloaded with Settings > Updates: installed now, in the
# background (from a copy in /tmp, since it replaces this script too), so
# EmulationStation comes back straight away; xcloud-update.log has the result
if [ -f "$FILES/update-staged/ready" ] && [ -f "$FILES/xcloud-apply-update.sh" ]; then
    cp -f "$FILES/xcloud-apply-update.sh" /tmp/xcloud-apply-update.sh \
        && setsid bash /tmp/xcloud-apply-update.sh < /dev/null >> "$LOGDIR/xcloud-update.log" 2>&1 &
    echo "installing the app update downloaded in Settings (see xcloud-update.log)"
fi
exit 0
