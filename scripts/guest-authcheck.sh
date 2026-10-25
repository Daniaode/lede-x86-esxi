#!/bin/sh
# Inspect the console-auth state that survived the upgrade.
#
# Upgrading preserves /etc/config/system, so a ttylogin=0 written by an older
# image keeps its meaning: login.sh then skips authentication entirely.
set -u

say() { echo "AUTH|$*"; }

say "TTYLOGIN=$(uci -q get system.@system[0].ttylogin)"
say "SHADOW=$(head -1 /etc/shadow | cut -d: -f1-2)"
say "FIELDS=$(awk -F: 'NR==1{print NF}' /etc/shadow)"
say "LOGIN_SH=$(grep -n 'ttylogin' /usr/libexec/login.sh | head -2)"
say "INITTAB_CONSOLE=$(grep -E 'askconsole|ttyS0|tty1' /etc/inittab | head -3)"
say "CONFIG_GEN_DEFAULT=$(grep -n 'ttylogin' /bin/config_generate | head -2)"

say "=== what a fresh install would get ==="
say "IMAGE_DEFAULT_TTYLOGIN=$(grep -o "ttylogin='[01]'" /bin/config_generate | head -1)"
