#!/bin/bash
# Uninstaller for Xbox Cloud Gaming on Batocera. The real one is kept with
# the installed files, so it's there even if this folder is deleted:
#     bash /userdata/system/add-ons/xcloud/uninstall.sh
# Add --all to remove everything without being asked.
if [ ! -f /userdata/system/add-ons/xcloud/uninstall.sh ]; then
    echo "Xbox Cloud Gaming doesn't seem to be installed (/userdata/system/add-ons/xcloud/uninstall.sh not found)."
    exit 1
fi
exec bash /userdata/system/add-ons/xcloud/uninstall.sh "$@"
