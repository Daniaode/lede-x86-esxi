#!/bin/sh
# One-shot v10 upgrade from cron so no VMware Tools session owns the process
# tree (guest.run reaps its descendants when the call returns).
set -u

CRON=/etc/crontabs/root
FW=/overlay/update/v10.img.gz
LOG=/overlay/upgrade-v10.log

if [ -f "$CRON" ]; then
	grep -v 'run-v10-upgrade.sh' "$CRON" > "$CRON.tmp" 2>/dev/null
	mv "$CRON.tmp" "$CRON" 2>/dev/null
	/etc/init.d/cron restart >/dev/null 2>&1
fi

exec > "$LOG" 2>&1
echo "=== $(date '+%F %T') v10 upgrade driver start ==="
echo "TAG_BEFORE=$(cat /etc/online-update-current 2>/dev/null)"
echo "TRACK_BEFORE=[$(uci -q get mwan3.wan.track_ip)]"
echo "RELIABILITY_BEFORE=$(uci -q get mwan3.wan.reliability)"
ls -l "$FW"

echo "=== calling sysupgrade ==="
sysupgrade -v "$FW"
echo "=== sysupgrade returned rc=$? ==="
