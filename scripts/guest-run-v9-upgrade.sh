#!/bin/sh
# One-shot upgrade to v9, launched from cron so no VMware Tools guest session
# owns the process tree (guest.run kills its descendants when it returns).
set -u

CRON=/etc/crontabs/root
FW=/overlay/update/v9.img.gz
LOG=/overlay/upgrade-v9.log

# Drop our own line first so a failure cannot retry every minute.
if [ -f "$CRON" ]; then
	grep -v 'run-v9-upgrade.sh' "$CRON" > "$CRON.tmp" 2>/dev/null
	mv "$CRON.tmp" "$CRON" 2>/dev/null
	/etc/init.d/cron restart >/dev/null 2>&1
fi

exec > "$LOG" 2>&1
echo "=== $(date '+%F %T') v9 upgrade driver start ==="
echo "TAG_BEFORE=$(cat /etc/online-update-current 2>/dev/null)"
echo "TTYLOGIN_BEFORE=$(uci -q get system.@system[0].ttylogin)"
echo "TRACK_IP_BEFORE=$(uci -q get mwan3.wan.track_ip)"
ls -l "$FW"

echo "=== calling sysupgrade ==="
sysupgrade -v "$FW"
echo "=== sysupgrade returned rc=$? ==="
