#!/bin/sh
# One-shot sysupgrade driver, launched by cron so that no VMware Tools guest
# session owns the process tree.
#
# Why cron: govc guest.run terminates the program's descendants when the call
# returns, and setsid inside the guest did not survive that. cron is a daemon
# already running under init, so the upgrade is immune to session teardown.
set -u

CRON=/etc/crontabs/root

# Remove our own entry first so a failed attempt cannot loop every minute.
if [ -f "$CRON" ]; then
	grep -v 'run-upgrade.sh' "$CRON" > "$CRON.tmp" 2>/dev/null
	mv "$CRON.tmp" "$CRON" 2>/dev/null
	/etc/init.d/cron restart >/dev/null 2>&1
fi

exec > /overlay/upgrade.log 2>&1
echo "=== $(date '+%F %T') upgrade driver start ==="

FW=/tmp/sysupgrade.img
if [ ! -s "$FW" ]; then
	echo "no image at $FW, falling back to /overlay/update/v8.img.gz"
	FW=/overlay/update/v8.img.gz
fi

ls -l "$FW"
echo "current version: $(cat /etc/online-update-current 2>/dev/null)"
echo "track_ip before: $(uci -q get mwan3.wan.track_ip)"

echo "=== calling sysupgrade ==="
sysupgrade -v "$FW"
echo "=== sysupgrade returned rc=$? ==="
