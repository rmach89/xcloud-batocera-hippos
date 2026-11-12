#!/bin/bash
# Xbox Cloud Gaming: installs an app update downloaded with Settings > Updates.
# Launch-XboxCloudGaming.sh copies this to /tmp and starts it in the
# background after the app has closed (so the files it replaces aren't in
# use). It runs the new version's own installer, which keeps config.json,
# the profiles, sign-ins, PIN and picked games, and also gets the newest
# browser engine. While it runs, /tmp/xcloud-updating exists and the
# launcher waits for it before starting the app again.
FILES="${XCLOUD_FILES:-/userdata/system/add-ons/xcloud}"
ST="$FILES/update-staged"
LOCK="${XCLOUD_UPDATE_LOCK:-/tmp/xcloud-updating}"
say() { echo "$(date): app update: $*"; }
[ -f "$ST/ready" ] || exit 0
[ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null && exit 0
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT
sleep "${XCLOUD_UPDATE_WAIT:-2}"   # let the app finish closing
v="$(head -n1 "$ST/ready")"
# out of the app's folder while the installer copies into it
WORK="$FILES.update-$$"
rm -rf "$WORK"; mv "$ST" "$WORK" || { say "couldn't move v$v into place: not installed"; exit 1; }
inst="$(find "$WORK/pkg" -maxdepth 3 -name install.sh | head -n1)"
if [ -z "$inst" ] || [ ! -f "$(dirname "$inst")/system/add-ons/xcloud/app.asar" ]; then
    say "the downloaded v$v isn't complete: not installed"; rm -rf "$WORK"; exit 1
fi
# keep the Launch Single Game choice made at install
single="$(python3 -I -c 'import json, sys
try:
    v = json.load(open(sys.argv[1])).get("single_launch")
    print("" if v is None else ("yes" if v else "no"))
except Exception:
    pass' "$FILES/config.json" 2>/dev/null)"
say "installing v$v (settings, profiles and sign-ins are kept)"
XCLOUD_NO_UPDATE_CHECK=1 XCLOUD_SINGLE_LAUNCH="$single" bash "$inst" < /dev/null
rc=$?
rm -rf "$WORK"
if [ $rc -eq 0 ]; then say "v$v installed; it's used the next time the app opens"
else say "the v$v installer stopped with an error ($rc); see xcloud-install.log"; fi
exit $rc
