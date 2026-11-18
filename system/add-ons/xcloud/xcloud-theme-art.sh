#!/bin/bash
# Xbox Cloud Gaming: carousel art for themes in /userdata/themes (HippOS).
# The installer copies this into EmulationStation's scripts/start folder, so
# it runs each time EmulationStation starts. A theme that was added or
# updated after the install gets the xcloud logo (and background, where the
# theme has per-system backgrounds) the next time EmulationStation starts.
#
# It only touches /userdata/themes and never replaces a file that's already
# there, so on most starts it finds nothing to do. HippOS's built-in themes
# ship their own Xbox Cloud Gaming art and are left alone.
FILES=/userdata/system/add-ons/xcloud
THEMES=/userdata/themes
LISTF="$FILES/theme-installed.txt"

# removed or half-installed: nothing to copy from
[ -f "$FILES/xcloud.png" ] || exit 0
[ -d "$THEMES" ] || exit 0

art() {
    # put <source> <destination>: only when the destination isn't there yet;
    # what's added is listed so the uninstaller takes it back out
    put() {
        [ -f "$1" ] || return 0
        [ -e "$2" ] && return 0
        cp "$1" "$2" 2>/dev/null || return 0
        grep -qxF "$2" "$LISTF" 2>/dev/null || echo "$2" >> "$LISTF"
    }
    for theme in "$THEMES"/*; do
        [ -d "$theme" ] || continue
        # Carbon-style themes (art/logos, art/background)
        if [ -d "$theme/art" ]; then
            mkdir -p "$theme/art/logos" 2>/dev/null || continue
            for dir in "$theme/art/logos" "$theme/art/logos/br" "$theme/art/logos/jp" "$theme/art/logos/us"; do
                [ -d "$dir" ] || continue
                put "$FILES/xcloud.png" "$dir/xcloud.png"
                put "$FILES/xcloud.png" "$dir/xcloud-w.png"
            done
            put "$FILES/xcloud1.png" "$theme/art/logos/xcloud1.png"
            for dir in "$theme/art/background" "$theme/art/background/br" "$theme/art/background/jp" "$theme/art/background/us"; do
                [ -d "$dir" ] || continue
                put "$FILES/xcloud-background.jpg" "$dir/xcloud.jpg"
            done
        fi
        # other themes: beside the theme's PNG logo for SNES
        find "$theme" -maxdepth 6 -type f -iname 'snes.png' 2>/dev/null | grep -i 'logo' | while IFS= read -r ref; do
            dir="$(dirname "$ref")"
            case "$dir" in "$theme/art/logos"|"$theme/art/logos/"*) continue ;; esac
            put "$FILES/xcloud.png" "$dir/xcloud.png"
        done
    done
}

# in the background, so EmulationStation's start never waits on it
art </dev/null >/dev/null 2>&1 &
exit 0
