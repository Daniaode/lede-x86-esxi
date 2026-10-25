#!/bin/sh
# Pre-flash verification inside the guest, run as a file so no argv is lost
# through the VMware Tools exec channel.
set -u

FW=/overlay/update/v8.img.gz
WANT=5025fec8e8573df423386ced2f5638883659579998984687fe6cdef0ea375a91

echo "FW=$FW"
[ -f "$FW" ] || { echo "RESULT=MISSING"; exit 1; }

SZ=$(wc -c < "$FW")
echo "SIZE=$SZ"

GOT=$(sha256sum "$FW" | cut -d' ' -f1)
echo "SHA256=$GOT"
echo "WANT=$WANT"

if [ "$GOT" != "$WANT" ]; then
	echo "RESULT=SHA_MISMATCH"
	exit 1
fi
echo "RESULT=SHA_OK"

echo "=== gzip integrity ==="
# rc=2 is expected: OpenWrt appends a usign signature block after the stream.
gunzip -c "$FW" > /dev/null 2>/dev/null
echo "GUNZIP_RC=$?"

echo "=== current version ==="
cat /etc/online-update-current 2>/dev/null

echo "=== legacy track_ip before upgrade ==="
uci -q get mwan3.wan.track_ip

echo "=== free space ==="
df -k /overlay | tail -1

exit 0
