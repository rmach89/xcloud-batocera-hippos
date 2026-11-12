#!/bin/bash
exec >> /tmp/launchsingle.log 2>&1
SYSTEM="$1"
GAMEPATH="$2"
ARM=/tmp/launchsingle_armed
HOLD=/tmp/launchsingle_hold

# a game that just closed is on its way back to the carousel: don't start it
# again (the hold is lifted by its return step, or expires after 20 s)
if [ -f "$HOLD" ] && [ "$(cat "$HOLD" 2>/dev/null)" = "$SYSTEM" ] && \
   [ $(( $(date +%s) - $(stat -c %Y "$HOLD" 2>/dev/null || echo 0) )) -lt 20 ]; then
    rm -f "$ARM"
    # tell the game's return step that EmulationStation is back on the list,
    # so it can go back to the carousel straight away
    echo "$(date +%s.%N) $SYSTEM" >> /tmp/launchsingle_back
    echo "$(date) system=$SYSTEM: just closed, not starting it again"
    exit 0
fi

# if the list file exists, only act on systems named in it (lines starting with # are ignored)
LIST=/userdata/system/launchsingle.systems
if [ -f "$LIST" ] && ! tr -d '\r' < "$LIST" | grep -v '^[[:space:]]*#' | grep -qxF "$SYSTEM"; then exit 0; fi

# only act on the first game shown right after a system was picked in the carousel
[ "$(cat "$ARM" 2>/dev/null)" = "$SYSTEM" ] || exit 0
rm -f "$ARM"
[ -f "$GAMEPATH" ] || exit 0

# count the real files in the system's folder (ignoring hidden files and metadata)
DIR="$(dirname "$GAMEPATH")"
COUNT=$(find "$DIR" -maxdepth 1 -type f ! -name '.*' ! -name 'gamelist.xml' ! -name '_info.txt' | wc -l)
echo "$(date) system=$SYSTEM count=$COUNT path=$GAMEPATH"
[ "$COUNT" -eq 1 ] || exit 0

# launch through ES's local web server straight away (in the background so
# ES isn't blocked): the list hardly shows before the game starts
( curl -s -m 5 -X POST -d "$GAMEPATH" http://127.0.0.1:1234/launch ) &
