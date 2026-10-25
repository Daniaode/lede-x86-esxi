#!/bin/bash
# Launcher for the squashfs console-authentication test.
# Kept as a file (not an inline heredoc over ssh) so quoting cannot break it.
exec > /tmp/sq-test2.log 2>&1
/usr/bin/python3 /root/sq-login-test.py \
	/root/lede/bin/targets/x86/64/openwrt-x86-64-generic-squashfs-combined.img.gz 300
echo "EXIT=$?"
