#!/bin/bash
# remember which system the carousel is on
echo "$1" > /tmp/launchsingle_armed
# a game that just closed: EmulationStation is reloading its screens (it
# announces its carousel while it does); tell the game's return step
if [ -f /tmp/launchsingle_hold ]; then
    echo "$(date +%s.%N) reload $1" >> /tmp/launchsingle_reload
    echo "$(date +%s.%N) carousel $1 (reload after the game closed)" >> /tmp/launchsingle.log
fi
exit 0
