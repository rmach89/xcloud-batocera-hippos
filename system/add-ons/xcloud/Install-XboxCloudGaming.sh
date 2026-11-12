#!/bin/bash
# Xbox Cloud Gaming for Batocera
# Adds an "xcloud" system to the EmulationStation carousel that opens
# the Xbox Cloud Gaming app fullscreen (xbox.com/play and Microsoft
# sign-in only), installs Launch Single Game, and adds two shortcuts to
# F1 > Applications ("Xbox Cloud Gaming" and "Uninstall Xbox Cloud
# Gaming"). It puts nothing in the Ports menu (and clears entries older
# versions left there). Run by install.sh:
#     bash "/userdata/Xbox Cloud Gaming/install.sh"
#
# It uses the files in /userdata/system/add-ons/xcloud/ (from the zip):
#   xcloud.png  xcloud1.png  xcloud-background.jpg (optional)
#   es_systems_xcloud.cfg  gamelist.xml
#   Launch-XboxCloudGaming.sh  Build-Runtime.py  config.json  app.asar
# and downloads the Electron browser engine from GitHub (about 100 MB).
LOGDIR=/userdata/system/logs
LOG=$LOGDIR/xcloud-install.log
mkdir -p "$LOGDIR"
exec > "$LOG" 2>&1

FILES=/userdata/system/add-ons/xcloud
ES=/userdata/system/configs/emulationstation
ROMS=/userdata/roms/xcloud
LIST=/userdata/system/launchsingle.systems
LS_SCRIPT=/userdata/system/configs/emulationstation/scripts/game-selected/launchsingle-launch.sh
THEMES=/usr/share/emulationstation/themes
PORTS=/userdata/roms/ports
APPS=/userdata/system/.local/share/applications
SYSAPPS=/usr/share/applications   # where Batocera's F1 > Applications looks (system area)
GAME="Xbox Cloud Gaming.xcloud"
# Batocera or HippOS (a Debian-based system built like Batocera: same
# /userdata, same EmulationStation family). On HippOS EmulationStation runs
# as a normal user and every update replaces the system area, so nothing
# goes there: no theme art in system themes, no shortcuts in /usr, no
# service to put them back.
OS=batocera
[ -f "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" ] && OS=hippos
# HippOS's desktop (F1) reads its menu from here (HOME=/userdata there)
DESK_APPS=/userdata/.local/share/applications

echo "$(date): installing Xbox Cloud Gaming"
if [ "$OS" = hippos ]; then
    echo "System: HippOS $(head -n1 "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" 2>/dev/null)"
else
    echo "System: Batocera $(head -n1 /usr/share/batocera/batocera.version 2>/dev/null)"
fi

# make sure the package files were copied over
missing=""
for f in xcloud.png xcloud-hippos.png xcloud-hippos-logo.sh xcloud-icon.png xcloud-uninstall-icon.png xcloud-settings-icon.png xcloud1.png es_systems_xcloud.cfg gamelist.xml Launch-XboxCloudGaming.sh Run-App.sh Return-To-Carousel.py uninstall.sh Uninstall-From-Menu.sh Build-Runtime.py Sync-GameList.py gamebox3d.py xcloud-service.sh config.json app.asar launchsingle/launchsingle-arm.sh launchsingle/launchsingle-launch.sh; do
    [ -s "$FILES/$f" ] || missing="$missing $f"
done
if [ -n "$missing" ]; then
    echo "Install failed: missing from $FILES:$missing"
    echo "Copy the zip's 'system' folder onto the Batocera share, then run this again."
    exit 1
fi

mkdir -p "$ES" "$ROMS/images" || { echo "Install failed: could not create folders."; exit 1; }

# strip any Windows line endings picked up while copying, then set permissions
for f in es_systems_xcloud.cfg gamelist.xml xcloud-hippos-logo.sh Launch-XboxCloudGaming.sh Run-App.sh Return-To-Carousel.py uninstall.sh Uninstall-From-Menu.sh Build-Runtime.py Sync-GameList.py gamebox3d.py xcloud-service.sh config.json launchsingle/launchsingle-arm.sh launchsingle/launchsingle-launch.sh; do
    tr -d '\r' < "$FILES/$f" > "$FILES/$f.tmp" && mv "$FILES/$f.tmp" "$FILES/$f"
done
chmod +x "$FILES/xcloud-service.sh" "$FILES/xcloud-hippos-logo.sh" "$FILES/Launch-XboxCloudGaming.sh" "$FILES/Run-App.sh" "$FILES/Return-To-Carousel.py" "$FILES/uninstall.sh" "$FILES/Uninstall-From-Menu.sh" "$FILES/Build-Runtime.py" "$FILES/Sync-GameList.py"

# --- Launch Single Game (optional: install.sh asks; XCLOUD_SINGLE_LAUNCH=yes/no) ---
# Two EmulationStation event scripts: when you pick a system that holds
# exactly one game, that game launches straight away.
SINGLE="${XCLOUD_SINGLE_LAUNCH:-yes}"
LS_DIR="$ES/scripts"
LS_ARM="$LS_DIR/system-selected/launchsingle-arm.sh"
LS_WAS_INSTALLED=0
[ -f "$LS_SCRIPT" ] && [ -f "$LS_ARM" ] && LS_WAS_INSTALLED=1
# remember the choice (the app and the game list leave single launch alone without it)
python3 - "$FILES/config.json" "$SINGLE" <<'CFG_EOF' || true
import json, sys
p, single = sys.argv[1], sys.argv[2] == "yes"
try:
    c = json.load(open(p))
except Exception:
    c = {}
c["single_launch"] = single
open(p, "w").write(json.dumps(c, indent=2) + "\n")
CFG_EOF
if [ "$SINGLE" != yes ]; then
    echo "Launch Single Game: not installed (you chose to skip it)."
    # xcloud out of its list, if this package put it there
    if [ -f "$FILES/added-to-list" ] && [ -f "$LIST" ]; then
        tr -d '\r' < "$LIST" | grep -vx '[[:space:]]*xcloud[[:space:]]*' > "$LIST.tmp" && mv "$LIST.tmp" "$LIST"
        rm -f "$FILES/added-to-list"
        echo "Took xcloud out of $LIST."
    fi
    if [ "$LS_WAS_INSTALLED" = 1 ] && [ ! -f "$LIST" ]; then
        echo "Note: Launch Single Game is installed with no $LIST, so every one-game system (xcloud too) still opens straight away."
    fi
else
mkdir -p "$LS_DIR/system-selected" "$LS_DIR/game-selected"
# remove copies from a manual install so the scripts don't run twice
for f in "$LS_DIR/system-selected/arm.sh" "$LS_DIR/game-selected/launch.sh"; do
    if [ -f "$f" ] && grep -q launchsingle "$f"; then rm -f "$f"; fi
done
cp -f "$FILES/launchsingle/launchsingle-arm.sh" "$LS_ARM"
cp -f "$FILES/launchsingle/launchsingle-launch.sh" "$LS_SCRIPT"
chmod +x "$LS_ARM" "$LS_SCRIPT"
if [ "$LS_WAS_INSTALLED" = 1 ]; then
    echo "Launch Single Game was already installed; updated it."
else
    echo "Installed Launch Single Game."
fi
fi
# nothing of this package goes in Ports; remove entries older versions left there
rm -f "$PORTS/Install Launch Single Game.sh" "$PORTS/Uninstall Launch Single Game.sh" \
      "$PORTS/Install Xbox Cloud Gaming.sh" "$PORTS/Uninstall Xbox Cloud Gaming.sh"

# the xcloud system
cp -f "$FILES/es_systems_xcloud.cfg" "$ES/es_systems_xcloud.cfg"

# one placeholder "game", its name and your artwork
echo "Placeholder for Xbox Cloud Gaming. Launching it opens the Xbox Cloud Gaming app." > "$ROMS/$GAME"
# the game list: the app's entry (description, developer, genre, players...)
# replaces an older one; anything else already in the list is kept
if [ ! -f "$ROMS/gamelist.xml" ]; then
    cp "$FILES/gamelist.xml" "$ROMS/gamelist.xml"
else
    python3 - "$ROMS/gamelist.xml" "$FILES/gamelist.xml" <<'GAMELIST_EOF' || cp -f "$FILES/gamelist.xml" "$ROMS/gamelist.xml"
import re, sys
mine, ours = sys.argv[1], sys.argv[2]
text = open(mine, encoding="utf-8", errors="replace").read()
entry = re.search(r"[ \t]*<game>.*?</game>\s*", open(ours, encoding="utf-8").read(), re.S).group(0)
if "</gameList>" not in text:
    raise SystemExit(1)
# drop the old entry for the app (by its path), keep the rest
text = re.sub(r"[ \t]*<game>(?:(?!</game>).)*?<path>\./Xbox Cloud Gaming\.xcloud</path>.*?</game>\s*", "", text, flags=re.S)
text = text.replace("</gameList>", entry + "</gameList>", 1)
open(mine, "w", encoding="utf-8").write(text)
GAMELIST_EOF
fi
# the entry's picture (screenshot/thumbnail): the cloud icon, square, fits the tile
cp -f "$FILES/xcloud-icon.png" "$ROMS/images/xcloud.png"

# launch-single-game allow-list (only when it was chosen)
if [ "$SINGLE" != yes ]; then
    :
elif [ -f "$LIST" ]; then
    if tr -d '\r' < "$LIST" | grep -qx '[[:space:]]*xcloud[[:space:]]*'; then
        echo "xcloud is already in $LIST."
    else
        [ -n "$(tail -c 1 "$LIST")" ] && echo >> "$LIST"
        echo xcloud >> "$LIST"
        touch "$FILES/added-to-list"
        echo "Added xcloud to $LIST."
    fi
elif [ "$LS_WAS_INSTALLED" = 1 ]; then
    # you deleted the list on purpose: every one-game system auto-launches
    echo "No $LIST, so every one-game system auto-launches, including xcloud."
else
    cat > "$LIST" <<'LIST_EOF'
# Launch Single Game: systems that open their game straight away when they
# hold exactly one game. One system short name per line (the same as its
# folder name under /userdata/roms, e.g. ports, nes, snes).
# Lines starting with # are ignored. Delete this file to allow every system.
xcloud
LIST_EOF
    touch "$FILES/added-to-list"
    echo "Created $LIST with xcloud."
fi

# links from an earlier install come down first (copying onto one of
# our own links would write over the app's own picture); put back after
bash "$FILES/xcloud-service.sh" stop >/dev/null 2>&1
# theme artwork (best effort; on Batocera, xcloud-service.sh puts the system
# themes' copies back at every boot)
# Themes look for a system's carousel logo and background by its name
# (xcloud), sometimes in per-region folders (br/ jp/ us/) and as a "-w"
# variant, so put a copy everywhere the theme might look.
[ -f "$FILES/theme-installed.txt" ] || : > "$FILES/theme-installed.txt"

theme_put() {   # theme_put <source file> <destination>
    local src="$1" dest="$2"
    [ -f "$src" ] || return 0
    # back up a file the theme already had, once (mirrored under theme-backups)
    if [ -e "$dest" ] && [ ! -e "$FILES/theme-backups$dest" ] && ! grep -qxF "$dest" "$FILES/theme-installed.txt"; then
        mkdir -p "$(dirname "$FILES/theme-backups$dest")"
        cp -a "$dest" "$FILES/theme-backups$dest"
    fi
    if cp -f "$src" "$dest" 2>/dev/null; then
        grep -qxF "$dest" "$FILES/theme-installed.txt" || echo "$dest" >> "$FILES/theme-installed.txt"
    else
        echo "Could not copy to $dest"
    fi
}

# older versions also put a second logo in themes under another name: put
# back what the theme had there (or remove it), and drop the old copy
rm -f "$FILES/greenlight.png"
if [ -f "$FILES/theme-installed.txt" ] && grep -q '/greenlight\.png$' "$FILES/theme-installed.txt"; then
    grep '/greenlight\.png$' "$FILES/theme-installed.txt" | while IFS= read -r dest; do
        if [ -e "$FILES/theme-backups$dest" ]; then cp -af "$FILES/theme-backups$dest" "$dest" 2>/dev/null; rm -f "$FILES/theme-backups$dest"
        else rm -f "$dest"; fi
    done
    grep -v '/greenlight\.png$' "$FILES/theme-installed.txt" > "$FILES/theme-installed.txt.new"; mv -f "$FILES/theme-installed.txt.new" "$FILES/theme-installed.txt"
fi

count=0
usr_changed=0
THEME_DIRS=("$THEMES"/* /userdata/themes/*)
if [ "$OS" = hippos ]; then
    # system themes are read-only for the HippOS user and replaced by updates
    THEME_DIRS=(/userdata/themes/*)
    echo "HippOS: themes in /userdata/themes get the carousel art here; HippOS's built-in theme is handled below."
fi
for theme in "${THEME_DIRS[@]}"; do
    [ -d "$theme" ] || continue
    case "$theme" in "$THEMES"/*) under_usr=1 ;; *) under_usr=0 ;; esac
    touched=0
    # Carbon-style themes (art/logos, art/background)
    if [ -d "$theme/art" ]; then
        mkdir -p "$theme/art/logos" 2>/dev/null || { echo "Could not create $theme/art/logos"; continue; }
        # carousel logo: the main folder plus any region folders the theme has
        for dir in "$theme/art/logos" "$theme/art/logos/br" "$theme/art/logos/jp" "$theme/art/logos/us"; do
            [ -d "$dir" ] || continue
            theme_put "$FILES/xcloud.png" "$dir/xcloud.png"
            theme_put "$FILES/xcloud.png" "$dir/xcloud-w.png"
        done
        theme_put "$FILES/xcloud1.png" "$theme/art/logos/xcloud1.png"
        # carousel background (must be .jpg), only in themes that have per-system backgrounds
        for dir in "$theme/art/background" "$theme/art/background/br" "$theme/art/background/jp" "$theme/art/background/us"; do
            [ -d "$dir" ] || continue
            theme_put "$FILES/xcloud-background.jpg" "$dir/xcloud.jpg"
        done
        touched=1
    fi
    # other themes: wherever the theme keeps a PNG logo for each system (found
    # by looking for its SNES logo), put the xcloud logo beside it. Themes that
    # only use SVG logos will show the system's name instead.
    while IFS= read -r ref; do
        dir="$(dirname "$ref")"
        case "$dir" in "$theme/art/logos"|"$theme/art/logos/"*) continue ;; esac
        theme_put "$FILES/xcloud.png" "$dir/xcloud.png"
        touched=1
    done < <(find "$theme" -maxdepth 6 -type f -iname 'snes.png' 2>/dev/null | grep -i 'logo')
    if [ "$touched" = 1 ]; then
        count=$((count+1))
        [ "$under_usr" = 1 ] && usr_changed=1
    fi
done
echo "Copied the carousel logo (and background, where the theme has them) into $count theme(s)."

# --- HippOS: the logo in its built-in theme (es-theme-hippos-minimal) ---
# Built-in themes are in HippOS's system area: only root can write there,
# and every HippOS update replaces it. HippOS lets its user run sudo without
# a password, so the logo goes in with "sudo -n" (never asks; skipped if it
# isn't allowed), and an EmulationStation start script puts it back after
# an update. The theme shows each system's art/<system>.svg, or .png when
# there's no .svg, tinted with its colour: the logo is xcloud.png in white
# (xcloud-hippos.png), so it comes out in the theme's colour.
HIPPOS_LIST="$FILES/hippos-theme-files.txt"
HIPPOS_START="$ES/scripts/start/xcloud-theme-logo.sh"
if [ "$OS" = hippos ]; then
    # the 1.1.24 test build's xcloud.svg would be shown instead of the PNG: take it out
    if [ -s "$HIPPOS_LIST" ] && sudo -n true 2>/dev/null; then
        while IFS=$'\t' read -r dest src; do
            case "$dest" in *.svg) [ -e "$dest" ] && cmp -s "$src" "$dest" && sudo -n rm -f "$dest" 2>/dev/null && echo "Removed the earlier xcloud.svg from $(dirname "$dest")" ;; esac
        done < "$HIPPOS_LIST"
    fi
    rm -f "$FILES/xcloud.svg"
    : > "$HIPPOS_LIST"
    if sudo -n true 2>/dev/null; then
        placed=0
        for theme in "$THEMES"/*; do
            [ -d "$theme/art" ] || continue
            [ -f "$theme/art/snes.svg" ] || [ -f "$theme/art/snes.png" ] || continue
            src="$FILES/xcloud-hippos.png"; dest="$theme/art/xcloud.png"
            # a theme that ships its own xcloud.svg keeps it (it'd be shown first anyway)
            if [ -e "$theme/art/xcloud.svg" ]; then echo "$(basename "$theme") has its own Xbox Cloud Gaming logo; left as it is."; continue; fi
            # a theme that ships its own xcloud logo keeps it
            if [ -e "$dest" ] && ! cmp -s "$src" "$dest"; then echo "$(basename "$theme") has its own Xbox Cloud Gaming logo; left as it is."; continue; fi
            printf '%s\t%s\n' "$dest" "$src" >> "$HIPPOS_LIST"
            if sudo -n cp -f "$src" "$dest" 2>/dev/null; then placed=$((placed+1)); else echo "Could not place $dest"; fi
        done
        mkdir -p "$ES/scripts/start" && cp -f "$FILES/xcloud-hippos-logo.sh" "$HIPPOS_START" && chmod +x "$HIPPOS_START"
        echo "HippOS: carousel logo placed in $placed built-in theme(s) (with sudo); it's put back after HippOS updates when EmulationStation starts."
    else
        rm -f "$HIPPOS_START"
        echo "HippOS: sudo needs a password here, so the built-in theme shows \"Xbox Cloud Gaming\" as text (the app works the same)."
    fi
fi

# stop here if the important parts are missing, leaving the installer in place
if [ ! -f "$ES/es_systems_xcloud.cfg" ] || [ ! -x "$FILES/Launch-XboxCloudGaming.sh" ] || [ ! -f "$ROMS/$GAME" ]; then
    echo "Install failed: the system file, launcher or placeholder is missing."
    exit 1
fi

# download and set up the newest browser engine (Electron), replacing an
# older one from an earlier install. If there's no internet right now, the
# install still finishes and this runs again on first launch.
if command -v python3 >/dev/null 2>&1; then
    python3 "$FILES/Build-Runtime.py" --latest || echo "Note: the browser engine isn't set up yet. It will be tried again the first time you launch Xbox Cloud Gaming."
else
    echo "Install failed: Python 3 is needed to set up the app, and it wasn't found."
    exit 1
fi

# write the uninstaller into the add-on folder (not Ports; run uninstall.sh)
cat > "$FILES/Uninstall-XboxCloudGaming.sh" <<'UNINSTALL_EOF'
#!/bin/bash
# Removes Xbox Cloud Gaming. Run by uninstall.sh, which asks first whether
# to keep Launch Single Game and passes the answer as
#   XCLOUD_LAUNCHSINGLE=keep   (the default)  or  XCLOUD_LAUNCHSINGLE=remove
LOGDIR=/userdata/system/logs
mkdir -p "$LOGDIR"
exec > "$LOGDIR/xcloud-install.log" 2>&1

FILES=/userdata/system/add-ons/xcloud
ES=/userdata/system/configs/emulationstation
ROMS=/userdata/roms/xcloud
LIST=/userdata/system/launchsingle.systems
PORTS=/userdata/roms/ports

echo "$(date): removing Xbox Cloud Gaming"
# our links in the system area come down first, before a theme's own
# pictures are put back (copying onto one of our links would write over the app's)
[ -f "$FILES/xcloud-service.sh" ] && bash "$FILES/xcloud-service.sh" stop >/dev/null 2>&1
# the games Settings > Batocera game list added (files, pictures, entries)
if [ -f "$FILES/gamelist-state.json" ] && [ -f "$FILES/Sync-GameList.py" ]; then
    python3 "$FILES/Sync-GameList.py" off >/dev/null 2>&1 && echo "Removed the games from Batocera's list."
fi
rm -f "$ES/es_systems_xcloud.cfg"
rm -f "$ROMS/Xbox Cloud Gaming.xcloud" "$ROMS/gamelist.xml" "$ROMS/images/xcloud.png"
rmdir "$ROMS/images" "$ROMS" 2>/dev/null

# take xcloud off the allow-list, only if the installer put it there
if [ -f "$FILES/added-to-list" ] && [ -f "$LIST" ]; then
    tr -d '\r' < "$LIST" | grep -vx '[[:space:]]*xcloud[[:space:]]*' > "$LIST.tmp"
    mv "$LIST.tmp" "$LIST"
fi
rm -f "$FILES/added-to-list"

# put back theme files themes had before, remove the ones we added
if [ -f "$FILES/theme-installed.txt" ]; then
    while IFS= read -r dest; do
        [ -n "$dest" ] || continue
        saved="$FILES/theme-backups$dest"
        if [ ! -f "$saved" ]; then
            # older versions kept backups as theme-backups/<theme>/<file>
            tname="$(basename "$(dirname "$(dirname "$(dirname "$dest")")")")"
            saved="$FILES/theme-backups/$tname/$(basename "$dest")"
        fi
        if [ -f "$saved" ]; then cp -a "$saved" "$dest"; else rm -f "$dest"; fi
    done < "$FILES/theme-installed.txt"
fi
rm -rf "$FILES/theme-installed.txt" "$FILES/theme-backups"

# remove the downloaded browser engine (about 250 MB unpacked)
rm -rf "$FILES/runtime" "$FILES/runtime.old"

# remove the F1 > Applications shortcuts (both places), refresh F1's menu
rm -f /userdata/system/.local/share/applications/xcloud-xbox-cloud-gaming.desktop \
      /userdata/system/.local/share/applications/xcloud-uninstall.desktop \
      /userdata/system/.local/share/applications/xcloud-settings.desktop \
      /usr/share/applications/xcloud-xbox-cloud-gaming.desktop \
      /usr/share/applications/xcloud-uninstall.desktop \
      /usr/share/applications/xcloud-settings.desktop
rm -f /userdata/.local/share/applications/xcloud-xbox-cloud-gaming.desktop \
      /userdata/.local/share/applications/xcloud-uninstall.desktop \
      /userdata/.local/share/applications/xcloud-settings.desktop
rm -rf /userdata/system/.cache/menus

# stop whatever put the shortcuts and art back at boot
SVC=/userdata/system/services/xcloud
if [ -f "$SVC" ]; then
    for svc in batocera-services hippos-services; do
        command -v $svc >/dev/null 2>&1 && { $svc stop xcloud >/dev/null 2>&1; $svc disable xcloud >/dev/null 2>&1; }
    done
    rm -f "$SVC"
    echo "Removed the xcloud service."
fi
CUSTOM=/userdata/system/custom.sh
if [ -f "$CUSTOM" ] && grep -q '# xcloud-boot-restore' "$CUSTOM"; then
    grep -v '# xcloud-boot-restore' "$CUSTOM" > "$CUSTOM.tmp" && cat "$CUSTOM.tmp" > "$CUSTOM" && rm -f "$CUSTOM.tmp"
    echo "Took Xbox Cloud Gaming's line out of $CUSTOM."
    if [ -f "$FILES/created-custom-sh" ] && ! grep -vqE '^[[:space:]]*(#.*)?$' "$CUSTOM"; then
        rm -f "$CUSTOM"; echo "Removed $CUSTOM (it only had that line)."
    fi
fi
rm -f "$FILES/created-custom-sh" "$FILES/persist-mode"

# HippOS: our logo in its built-in theme, and the start script that puts it back
if [ -s "$FILES/hippos-theme-files.txt" ]; then
    while IFS=$'\t' read -r dest src; do
        [ -n "$dest" ] && [ -e "$dest" ] && cmp -s "$src" "$dest" && sudo -n rm -f "$dest" 2>/dev/null
    done < "$FILES/hippos-theme-files.txt"
fi
rm -f "$ES/scripts/start/xcloud-theme-logo.sh" "$FILES/hippos-theme-files.txt"

# nothing of this package in Ports (also clears entries from older versions)
rm -f "$PORTS/Install Xbox Cloud Gaming.sh" "$PORTS/Uninstall Xbox Cloud Gaming.sh"

# Launch Single Game: keep unless asked to remove it
if [ "${XCLOUD_LAUNCHSINGLE:-keep}" = "remove" ]; then
    rm -f "$ES/scripts/system-selected/launchsingle-arm.sh" "$ES/scripts/game-selected/launchsingle-launch.sh" /tmp/launchsingle_armed
    rm -f "$PORTS/Install Launch Single Game.sh" "$PORTS/Uninstall Launch Single Game.sh"
    rm -rf /userdata/system/launchsingle
    echo "Removed Launch Single Game. Your launchsingle.systems list was left in place."
else
    echo "Kept Launch Single Game."
fi

echo "Removed Xbox Cloud Gaming. Restart EmulationStation."
echo "Your Xbox sign-in (profile), settings (config.json) and the package files are still in $FILES"
echo "so reinstalling keeps you signed in. Delete that folder to remove everything."

( sleep 2; curl -s http://127.0.0.1:1234/reloadgames ) >/dev/null 2>&1 &
exit 0
UNINSTALL_EOF
chmod +x "$FILES/Uninstall-XboxCloudGaming.sh"

# --- F1 > Applications shortcuts ---
mkdir -p "$APPS"
cat > "$APPS/xcloud-xbox-cloud-gaming.desktop" <<DESKTOP_EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Xbox Cloud Gaming
Comment=Play Xbox Cloud Gaming (xbox.com/play)
Exec=/bin/bash $FILES/Launch-XboxCloudGaming.sh
Icon=$FILES/xcloud-icon.png
Terminal=false
Categories=Game;batocera.linux;
DESKTOP_EOF
cat > "$APPS/xcloud-uninstall.desktop" <<DESKTOP_EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Xbox Cloud Gaming Uninstaller
Comment=Remove Xbox Cloud Gaming (asks first)
Exec=/bin/bash $FILES/Uninstall-From-Menu.sh
Icon=$FILES/xcloud-uninstall-icon.png
Terminal=false
Categories=Utility;batocera.linux;
DESKTOP_EOF
cat > "$APPS/xcloud-settings.desktop" <<DESKTOP_EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Xbox Cloud Gaming Settings
Comment=Region, volume and key highlights
Exec=/bin/bash $FILES/Launch-XboxCloudGaming.sh --settings
Icon=$FILES/xcloud-settings-icon.png
Terminal=false
Categories=Utility;batocera.linux;
DESKTOP_EOF
chmod 755 "$APPS/xcloud-xbox-cloud-gaming.desktop" "$APPS/xcloud-uninstall.desktop" "$APPS/xcloud-settings.desktop"
if [ "$OS" = hippos ]; then
    # HippOS's desktop (F1) has a full menu that reads the user's own folder:
    # no copy in the system area needed
    mkdir -p "$DESK_APPS"
    for f in xcloud-xbox-cloud-gaming.desktop xcloud-uninstall.desktop xcloud-settings.desktop; do
        sed 's/;batocera\.linux;/;/' "$APPS/$f" > "$DESK_APPS/$f" && chmod 755 "$DESK_APPS/$f"
    done
    echo "Added \"Xbox Cloud Gaming\", \"Xbox Cloud Gaming Settings\" and \"Xbox Cloud Gaming Uninstaller\" to the desktop's applications menu (F1)."
# Batocera's F1 > Applications reads the system folder, so put a copy there too
elif mkdir -p "$SYSAPPS" 2>/dev/null && cp -f "$APPS/xcloud-xbox-cloud-gaming.desktop" "$APPS/xcloud-uninstall.desktop" "$APPS/xcloud-settings.desktop" "$SYSAPPS/" 2>/dev/null; then
    chmod 755 "$SYSAPPS/xcloud-xbox-cloud-gaming.desktop" "$SYSAPPS/xcloud-uninstall.desktop" "$SYSAPPS/xcloud-settings.desktop"
else
    echo "Could not copy the shortcuts to $SYSAPPS."
fi
# make F1 re-read its menu
rm -rf /userdata/system/.cache/menus
[ "$OS" = hippos ] || echo "Added \"Xbox Cloud Gaming\", \"Xbox Cloud Gaming Settings\" and \"Xbox Cloud Gaming Uninstaller\" to F1 > Applications."

# the system area forgets changes at every reboot, so
# xcloud-service.sh links the theme art and F1 shortcuts there from
# /userdata at every boot:
#   - as a Batocera service (the way BUA's add-ons do it), when this Batocera
#     has services; shown in System settings > Services
#   - otherwise from one marked line in /userdata/system/custom.sh
SVC_DIR=/userdata/system/services
CUSTOM=/userdata/system/custom.sh
if [ -e "$SVC_DIR/symlink_manager" ] || [ -f /userdata/roms/ports/bua.sh ]; then
    echo "Batocera Unofficial Add-ons (BUA) is installed."
fi
MODE=custom
[ "$OS" = hippos ] && MODE=none
if [ "$MODE" = none ]; then
    : # HippOS: nothing of ours is in the system area, so nothing to put back at boot
elif command -v batocera-services >/dev/null 2>&1; then
    mkdir -p "$SVC_DIR" && cp -f "$FILES/xcloud-service.sh" "$SVC_DIR/xcloud" && chmod +x "$SVC_DIR/xcloud" && MODE=service
fi
if [ "$MODE" = none ]; then
    # a boot line or service from an earlier install isn't needed
    if [ -f "$CUSTOM" ] && grep -q '# xcloud-boot-restore' "$CUSTOM"; then
        grep -v '# xcloud-boot-restore' "$CUSTOM" > "$CUSTOM.tmp" && cat "$CUSTOM.tmp" > "$CUSTOM" && rm -f "$CUSTOM.tmp"
    fi
    rm -f "$SVC_DIR/xcloud"
    echo "HippOS: everything is in /userdata, so nothing needs putting back after a reboot or update."
elif [ "$MODE" = service ]; then
    batocera-services enable xcloud >/dev/null 2>&1 || echo "Note: couldn't switch on the xcloud service; turn it on in System settings > Services."
    batocera-services start xcloud >/dev/null 2>&1 || bash "$SVC_DIR/xcloud" start
    # a boot line left by an earlier version isn't needed any more
    if [ -f "$CUSTOM" ] && grep -q '# xcloud-boot-restore' "$CUSTOM"; then
        grep -v '# xcloud-boot-restore' "$CUSTOM" > "$CUSTOM.tmp" && cat "$CUSTOM.tmp" > "$CUSTOM" && rm -f "$CUSTOM.tmp"
    fi
    echo "Keeping the shortcuts and carousel art with the xcloud service (System settings > Services)."
else
    LINE='[ "$1" = "stop" ] || bash /userdata/system/add-ons/xcloud/xcloud-service.sh start >/dev/null 2>&1 &  # xcloud-boot-restore (Xbox Cloud Gaming: links its F1 shortcuts and carousel art at boot)'
    if [ -f "$CUSTOM" ]; then
        if ! grep -q '# xcloud-boot-restore' "$CUSTOM"; then
            python3 - "$CUSTOM" "$LINE" <<'CUSTOM_EOF'
import sys
p, line = sys.argv[1], sys.argv[2]
text = open(p, encoding="utf-8", errors="surrogateescape").read().replace("\r\n", "\n")
lines = text.split("\n")
at = 1 if lines and lines[0].startswith("#!") else 0
lines.insert(at, line)
open(p, "w", encoding="utf-8", errors="surrogateescape").write("\n".join(lines))
CUSTOM_EOF
        fi
    else
        printf '#!/bin/bash\n%s\n' "$LINE" > "$CUSTOM"
        touch "$FILES/created-custom-sh"
    fi
    chmod +x "$CUSTOM" 2>/dev/null
    bash "$FILES/xcloud-service.sh" start
    echo "This Batocera has no services: keeping the shortcuts and carousel art with a line in $CUSTOM."
fi
echo "$MODE" > "$FILES/persist-mode"

echo "Installed. Restart EmulationStation to see Xbox Cloud Gaming in the carousel."
echo "To remove it later: F1 > Applications > Xbox Cloud Gaming Uninstaller,"
echo "or run: bash /userdata/system/add-ons/xcloud/uninstall.sh"

# refresh lists (best effort)
( sleep 2; curl -s http://127.0.0.1:1234/reloadgames ) >/dev/null 2>&1 &
exit 0
