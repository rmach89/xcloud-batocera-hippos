#!/bin/bash
# Xbox Cloud Gaming: keeps the app's F1 >
# Applications shortcuts and carousel art in Batocera's system area.
#
# That area (/usr) forgets changes at every reboot, so this links the files
# there from /userdata at every boot:
#   - as a Batocera service (/userdata/system/services/xcloud, the way BUA's
#     add-ons do it), shown in System settings > Services, or
#   - where Batocera has no services, from one marked line in
#     /userdata/system/custom.sh.
#   xcloud-service.sh start    link them (only ours; nothing else is touched)
#   xcloud-service.sh stop     remove our links (a theme's own picture comes back)
#   xcloud-service.sh status   show what's linked
FILES="${XCLOUD_FILES:-/userdata/system/add-ons/xcloud}"
APPS="${XCLOUD_APPS:-/userdata/system/.local/share/applications}"
SYSAPPS="${XCLOUD_SYSAPPS:-/usr/share/applications}"
MENUS="${XCLOUD_MENUS:-/userdata/system/.cache/menus}"
LOG="${XCLOUD_BOOT_LOG:-/userdata/system/logs/xcloud-boot.log}"
SYSTEM_AREA="${XCLOUD_SYSTEM_AREA:-/usr/}"
SHORTCUTS="xcloud-xbox-cloud-gaming.desktop xcloud-settings.desktop xcloud-uninstall.desktop"

# each (link, file it points to): the shortcuts, then the theme pictures the installer placed
pairs() {
    for f in $SHORTCUTS; do
        [ -f "$APPS/$f" ] && printf '%s\t%s\n' "$SYSAPPS/$f" "$APPS/$f"
    done
    [ -f "$FILES/theme-installed.txt" ] || return 0
    while IFS= read -r dest; do
        case "$dest" in "$SYSTEM_AREA"*) ;; *) continue ;; esac   # themes in /userdata keep their copy anyway
        case "$(basename "$dest")" in
            xcloud.png|xcloud-w.png) src="$FILES/xcloud.png" ;;
            xcloud1.png)             src="$FILES/xcloud1.png" ;;
            xcloud.jpg)              src="$FILES/xcloud-background.jpg" ;;
            *) continue ;;
        esac
        [ -f "$src" ] && printf '%s\t%s\n' "$dest" "$src"
    done < "$FILES/theme-installed.txt"
}

say() { mkdir -p "$(dirname "$LOG")" 2>/dev/null; echo "$(date): $*" >> "$LOG"; }

case "$1" in
    start)
        [ -d "$FILES" ] || exit 0
        linked=0
        while IFS=$'\t' read -r link src; do
            [ -n "$link" ] || continue
            [ "$(readlink "$link" 2>/dev/null)" = "$src" ] && continue
            # the F1 folder is made if needed; a theme folder a Batocera update removed is skipped
            if [ ! -d "$(dirname "$link")" ]; then
                [ "$(dirname "$link")" = "$SYSAPPS" ] && mkdir -p "$SYSAPPS" 2>/dev/null || continue
            fi
            ln -sfn "$src" "$link" 2>/dev/null && linked=$((linked+1))
        done < <(pairs)
        [ "$linked" -gt 0 ] && rm -rf "$MENUS"
        say "xcloud links: $linked made (F1 shortcuts and carousel art)"
        ;;
    stop)
        removed=0
        while IFS=$'\t' read -r link src; do
            [ -L "$link" ] && [ "$(readlink "$link")" = "$src" ] || continue
            rm -f "$link"
            # a theme's own picture that ours replaced: put it back
            [ -f "$FILES/theme-backups$link" ] && cp -a "$FILES/theme-backups$link" "$link" 2>/dev/null
            removed=$((removed+1))
        done < <(pairs)
        [ "$removed" -gt 0 ] && rm -rf "$MENUS"
        say "xcloud links: $removed removed"
        ;;
    status)
        while IFS=$'\t' read -r link src; do
            if [ "$(readlink "$link" 2>/dev/null)" = "$src" ]; then echo "linked:  $link"
            elif [ -e "$link" ]; then echo "a file (not our link): $link"
            else echo "missing: $link"; fi
        done < <(pairs)
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
exit 0
