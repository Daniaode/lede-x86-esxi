#!/bin/sh
# Install a one-minute cron job that runs the upgrade driver, then restart
# cron so it fires without any VMware Tools session holding the process tree.
set -u

CRON=/etc/crontabs/root

[ -f /tmp/run-upgrade.sh ] || { echo "RESULT=NO_DRIVER"; exit 1; }
chmod +x /tmp/run-upgrade.sh

# Keep any real crontab content, drop stale copies of our own line.
if [ -f "$CRON" ]; then
	grep -v 'run-upgrade.sh' "$CRON" > "$CRON.tmp" 2>/dev/null
	mv "$CRON.tmp" "$CRON"
fi

echo '* * * * * /bin/sh /tmp/run-upgrade.sh' >> "$CRON"
chmod 600 "$CRON"

/etc/init.d/cron restart >/dev/null 2>&1
sleep 1

echo "RESULT=CRON_INSTALLED"
echo "=== crontab ==="
cat "$CRON"
echo "=== cron running ==="
pgrep -f /usr/sbin/crond >/dev/null && echo YES || echo NO
