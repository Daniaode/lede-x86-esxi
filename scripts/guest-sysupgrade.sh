#!/bin/sh
# Kick off sysupgrade from a file so argv survives the VMware Tools channel.
#
# sysupgrade tears down the network and reboots, so it must be detached from
# the guest-exec session; setsid + nohup keeps it alive after this script
# returns. Everything is logged to /tmp/sysupgrade.log on the persistent
# overlay so the first boot after upgrade can still read it.
set -u

FW=/overlay/update/v8.img.gz
LOG=/tmp/sysupgrade.log

[ -f "$FW" ] || { echo "RESULT=NO_FIRMWARE"; exit 1; }

rm -f "$LOG"

# -v = verbose, keep config (default). Detach fully.
setsid sh -c "sysupgrade -v $FW > $LOG 2>&1" < /dev/null > /dev/null 2>&1 &

sleep 3
echo "RESULT=STARTED"
echo "PID_LIST:"
ps w 2>/dev/null | grep -F sysupgrade | grep -v grep
