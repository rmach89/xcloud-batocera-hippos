#!/bin/bash
# Xbox Cloud Gaming on HippOS: its carousel logo in HippOS's built-in theme.
#
# That theme is in HippOS's system area, which every HippOS update replaces,
# so the logo goes with it. EmulationStation runs this at every start (from
# its scripts/start folder in /userdata, which updates leave alone): any of
# our logos that's missing is put back, with HippOS's password-free sudo.
# A logo a theme ships itself is never replaced.
FILES="${XCLOUD_FILES:-/userdata/system/add-ons/xcloud}"
LIST="$FILES/hippos-theme-files.txt"
LOG="${XCLOUD_BOOT_LOG:-/userdata/system/logs/xcloud-boot.log}"
[ -f "${XCLOUD_HIPPOS_VERSION:-/usr/share/hippos/version}" ] || exit 0
[ -s "$LIST" ] || exit 0
placed=0
while IFS=$'\t' read -r dest src; do
    [ -n "$dest" ] && [ -f "$src" ] || continue
    [ -e "$dest" ] && continue                    # still there (ours or the theme's own)
    [ -d "$(dirname "$dest")" ] || continue       # the theme was renamed or removed by an update
    sudo -n cp -f "$src" "$dest" 2>/dev/null && placed=$((placed+1))
done < "$LIST"
if [ "$placed" -gt 0 ]; then
    mkdir -p "$(dirname "$LOG")" 2>/dev/null
    echo "$(date): HippOS theme: Xbox Cloud Gaming logo put back ($placed file(s), after a HippOS update)" >> "$LOG"
    # EmulationStation may already have read the theme: once its API answers, reload it
    if command -v curl >/dev/null 2>&1; then
        ( for i in $(seq 1 45); do curl -s -m 2 http://127.0.0.1:1234/reloadgames >/dev/null 2>&1 && break; sleep 2; done ) >/dev/null 2>&1 &
    fi
fi
exit 0
