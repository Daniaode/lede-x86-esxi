#!/bin/sh
# Report the state of the interrupted sysupgrade attempt.
set -u

LOG=/tmp/sysupgrade.log

echo "=== log size ==="
wc -c "$LOG" 2>/dev/null
echo "=== full log ==="
cat "$LOG" 2>/dev/null
echo "=== end of log ==="

echo "=== sysupgrade still running? ==="
ps w 2>/dev/null | grep sysupgrade | grep -v grep || echo NONE

echo "=== config backup present? ==="
ls -l /tmp/sysupgrade.tgz 2>/dev/null || echo NO_BACKUP

echo "=== current version ==="
cat /etc/online-update-current 2>/dev/null

echo "=== disk layout ==="
PARTNUM=$(echo /sys/block/vda/vda2 2>/dev/null)
ls -l /dev/vda* 2>/dev/null | head -5
df -h /overlay 2>/dev/null | tail -1

echo "=== dmesg errors ==="
dmesg 2>/dev/null | tail -10
