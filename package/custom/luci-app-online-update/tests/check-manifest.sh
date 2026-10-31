#!/bin/sh
# Build-time guard: assert that every file this package must install is
# actually present in the tree, with the right permissions.
#
# This exists because a `rm -rf root` during a refactor silently deleted the
# ACL, the menu entry, the init script, the uci-defaults and the status-page
# include. The package still built and installed cleanly -- luci.mk only
# installs what it finds -- so opkg produced a 5-file package instead of 10.
#
# The failure was invisible on an upgraded device: the old image already had
# those files baked in, and opkg does not remove unowned files, so ubus and
# the sidebar kept working. Only a fresh flash would have shown the breakage.
# Hence this guard, which fails the build instead of relying on review.

set -u
cd "$(dirname "$0")/.." || exit 1

fail=0
missing=""
notexec=""

# Every path below is a file that MUST end up in the installed package.
# htdocs/<x> is installed to /www/<x>; root/<x> is installed to /<x>.
REQUIRED="
root/etc/config/online-update
root/etc/online-update-current
root/etc/init.d/online-update
root/etc/uci-defaults/90-online-update
root/usr/sbin/online-update
root/usr/share/rpcd/ucode/luci.online-update
root/usr/share/rpcd/acl.d/luci-app-online-update.json
root/usr/share/luci/menu.d/luci-app-online-update.json
htdocs/luci-static/resources/view/system/online-update.js
htdocs/luci-static/resources/view/status/include/70_online_update.js
"

# Files that must be executable after installation.
EXECUTABLE="
root/etc/init.d/online-update
root/etc/uci-defaults/90-online-update
root/usr/sbin/online-update
"

for f in $REQUIRED; do
	[ -f "$f" ] || { missing="$missing $f"; fail=1; }
done

for f in $EXECUTABLE; do
	[ -x "$f" ] || { notexec="$notexec $f"; fail=1; }
done

# The ACL and menu JSON must parse, otherwise LuCI silently drops the app.
for f in root/usr/share/rpcd/acl.d/luci-app-online-update.json \
         root/usr/share/luci/menu.d/luci-app-online-update.json; do
	[ -f "$f" ] || continue
	if command -v jsonfilter >/dev/null 2>&1; then
		jsonfilter -i "$f" -e '@' >/dev/null 2>&1 || {
			echo "check-manifest: $f is not valid JSON"
			fail=1
		}
	fi
done

if [ -n "$missing" ]; then
	echo "check-manifest: FAIL - missing required files:$missing"
fi
if [ -n "$notexec" ]; then
	echo "check-manifest: FAIL - missing executable bit:$notexec"
fi

# Baked tag guard.
#
# The tag in root/etc/online-update-current is what the installed system
# reports as its own version. A stale value cannot be caught by "does it
# exist": if the image content moves forward but the tag stays behind, the
# comparison seq_of(latest) > seq_of(current) stays true forever, so the
# device re-offers the same upgrade on every check, re-downloads the whole
# image, and shows a wrong "current version" in the UI.
#
# So assert the tag is well formed AND its sequence number is at least the
# floor in tests/min-tag-seq. Bumping that floor is a required, deliberate
# step of cutting a new release; forgetting it now fails the build instead
# of shipping silently.
TAGFILE=root/etc/online-update-current
if [ -f "$TAGFILE" ]; then
	tag=$(tr -d ' \n' < "$TAGFILE")
	case "$tag" in
		v[0-9]*-*) ;;
		*) echo "check-manifest: FAIL - baked tag '$tag' is not v<digits>-<suffix>"; fail=1 ;;
	esac
	tagseq=$(echo "$tag" | sed -n 's/^v\([0-9][0-9]*\).*/\1/p')
	if [ -n "$tagseq" ] && [ -f tests/min-tag-seq ]; then
		floor=$(tr -d ' \n' < tests/min-tag-seq)
		if [ -n "$floor" ] && [ "$tagseq" -lt "$floor" ] 2>/dev/null; then
			echo "check-manifest: FAIL - baked tag seq $tagseq is below floor $floor (stale tag)"
			fail=1
		fi
	fi
else
	echo "check-manifest: FAIL - missing $TAGFILE"
	fail=1
fi
[ "$fail" -ne 0 ] && exit 1

n=$(echo "$REQUIRED" | grep -c .)
echo "check-manifest: OK ($n required paths present, executables set)"
exit 0
