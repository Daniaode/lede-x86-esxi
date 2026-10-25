#!/bin/sh
# Post-upgrade verification on the ESXi guest.
set -u

say() { echo "CHK|$*"; }

say "=== boot identity ==="
say "UPTIME=$(cut -d' ' -f1 /proc/uptime)sec"
say "NOW=$(date '+%F %T')"
say "BOOT_EPOCH=$(awk '/^btime/{print $2}' /proc/stat)"

say "=== firmware identity ==="
say "BAKED_TAG=$(cat /etc/online-update-current 2>/dev/null)"
say "REVISION=$(sed -n "s/^DISTRIB_REVISION='\(.*\)'/\1/p" /etc/openwrt_release 2>/dev/null)"
say "RELEASE=$(sed -n "s/^DISTRIB_RELEASE='\(.*\)'/\1/p" /etc/openwrt_release 2>/dev/null)"
say "KERNEL=$(uname -r)"

say "=== mwan3 migration ==="
say "TRACK_IP=$(uci -q get mwan3.wan.track_ip)"
say "RELIABILITY=$(uci -q get mwan3.wan.reliability)"
say "MWAN3TRACK_PREV_STATE=$(grep -c prev_state /usr/sbin/mwan3track 2>/dev/null)"
say "MIGRATION_SCRIPT_RAN=$(ls /etc/uci-defaults/mwan3-fix-track-ips 2>/dev/null && echo still-present || echo consumed)"

say "=== auth ==="
say "SHADOW_FIELDS=$(awk -F: 'NR==1{print NF}' /etc/shadow)"
say "ROOT_HASH_PREFIX=$(cut -d: -f2 /etc/shadow | head -1 | cut -c1-3)"
say "TTYLOGIN=$(uci -q get system.@system[0].ttylogin)"
say "LOGIN_SH_FAILCLOSED=$(grep -c 'ttylogin.*= 0' /usr/libexec/login.sh 2>/dev/null)"

say "=== leftovers ==="
say "CRON_UPGRADE_LINE=$(grep -c 'run-upgrade.sh' /etc/crontabs/root 2>/dev/null)"
say "TMP_IMAGE=$(ls /tmp/sysupgrade.img 2>/dev/null && echo present || echo gone)"
say "OVERLAY_UPDATE=$(ls /overlay/update/v8.img.gz 2>/dev/null && echo present || echo gone)"

say "=== runtime ==="
say "PKGCOUNT=$(opkg list-installed 2>/dev/null | wc -l)"
say "LANIP=$(ip -4 -br addr show br-lan 2>/dev/null | awk '{print $3}')"
say "WANIP=$(ip -4 -br addr show eth1 2>/dev/null | awk '{print $3}')"
say "DNSMASQ=$(pgrep -f '/usr/sbin/dnsmasq' >/dev/null && echo running || echo stopped)"
say "UHTTPD=$(pgrep -f '/usr/sbin/uhttpd' >/dev/null && echo running || echo stopped)"
say "FW4_LINES=$(nft list table inet fw4 2>/dev/null | wc -l)"
say "LUCI=$(wget -q -O /dev/null --timeout=8 http://127.0.0.1/ 2>/dev/null && echo ok || echo down)"
