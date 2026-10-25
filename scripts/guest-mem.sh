#!/bin/sh
# Find out why sysupgrade died: memory pressure or OOM kill.
set -u

echo "=== free ==="
free -m 2>/dev/null
echo "=== tmpfs mounts ==="
mount | grep -E "tmpfs" | head -10
echo "=== /tmp space ==="
df -h /tmp 2>/dev/null | tail -2
echo "=== /tmp usage ==="
ls -la /tmp 2>/dev/null | head -15
echo "=== OOM evidence ==="
dmesg 2>/dev/null | grep -iE "oom|killed process|out of memory" | tail -10
echo "=== OOM_COUNT ==="
dmesg 2>/dev/null | grep -icE "oom-kill|killed process"
echo "=== image still present ==="
ls -l /overlay/update/ 2>/dev/null
