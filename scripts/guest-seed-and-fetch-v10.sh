#!/bin/sh
# Reproduce the exact broken shape reported on the real router, then fetch v10.
#
# The report: track_ip narrowed to one target by hand while reliability stayed
# at 2. mwan3 needs `reliability` targets up before the interface counts as
# online, so the interface is pinned offline forever even though the single
# probe succeeds. That is what produced the endless failed/recovered pairs.
set -u

FW=/overlay/update/v10.img.gz
URL=http://172.16.99.19:18082/openwrt-x86-64-generic-squashfs-combined.img.gz
WANT=09aa95298fdc1eae53ea97dac168d960535a4fd160ecbc741e3b7166bbb8f388

echo "=== reproduce broken shape ==="
uci -q delete mwan3.wan.track_ip
uci -q add_list mwan3.wan.track_ip='223.5.5.5'
uci -q set mwan3.wan.reliability='2'
uci -q commit mwan3
/etc/init.d/mwan3 restart >/dev/null 2>&1
sleep 15
echo "track_ip    = [$(uci -q get mwan3.wan.track_ip)]"
echo "targets     = $(uci -q get mwan3.wan.track_ip | wc -w)"
echo "reliability = $(uci -q get mwan3.wan.reliability)"
echo "--- interface status (expect offline) ---"
ubus call mwan3 status 2>/dev/null | sed -n '/"wan"/,/^		}/p' | grep -E '"status"|"online"|"offline"' | head -3

echo ""
echo "=== fetch v10 ==="
mkdir -p /overlay/update
rm -f "$FW"
curl -fsS -o "$FW" "$URL" || { echo "RESULT=DOWNLOAD_FAILED"; exit 1; }
ls -l "$FW"
GOT=$(sha256sum "$FW" | cut -d' ' -f1)
echo "SHA256=$GOT"
[ "$GOT" = "$WANT" ] && echo "RESULT=SHA_OK" || { echo "RESULT=SHA_MISMATCH"; rm -f "$FW"; exit 1; }

echo ""
echo "=== tag before upgrade ==="
cat /etc/online-update-current 2>/dev/null
