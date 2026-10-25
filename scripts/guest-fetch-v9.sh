#!/bin/sh
# Download the v9 image inside the guest and verify it before flashing.
set -u

FW=/overlay/update/v9.img.gz
URL=http://172.16.99.19:18081/openwrt-x86-64-generic-squashfs-combined.img.gz
WANT=100106e968a8255ccd5a227b4603ee1b55aa55a2d06cbc081a5d9aed9b44da82

mkdir -p /overlay/update
rm -f "$FW"

echo "=== downloading ==="
curl -fsS -o "$FW" "$URL" || { echo "RESULT=DOWNLOAD_FAILED"; exit 1; }
ls -l "$FW"

GOT=$(sha256sum "$FW" | cut -d' ' -f1)
echo "SHA256=$GOT"
echo "WANT=$WANT"
[ "$GOT" = "$WANT" ] || { echo "RESULT=SHA_MISMATCH"; rm -f "$FW"; exit 1; }
echo "RESULT=SHA_OK"

echo "=== baseline state before upgrade ==="
echo "TAG=$(cat /etc/online-update-current 2>/dev/null)"
echo "TTYLOGIN=$(uci -q get system.@system[0].ttylogin)"
echo "LOGIN_SH_LAST=$(tail -1 /usr/libexec/login.sh)"
echo "TRACK_IP=$(uci -q get mwan3.wan.track_ip)"
