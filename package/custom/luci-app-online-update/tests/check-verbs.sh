#!/bin/sh
# Build-time guard: every verb the frontend calls must be allowed by the rpcd
# ucode shim, and every allowed verb should be reachable from the frontend.
#
# This exists because `start` silently drifted out of ALLOWED while the button
# kept calling it: the helper answered "command not allowed", the frontend
# swallowed the error and reloaded, and the download never began.
#
# Exits non-zero on drift so a broken image cannot be shipped.

set -u
cd "$(dirname "$0")/.." || exit 1

UC=root/usr/share/rpcd/ucode/luci.online-update
JS=htdocs/luci-static/resources/view/system/online-update.js

[ -f "$UC" ] || { echo "check-verbs: missing $UC"; exit 1; }
[ -f "$JS" ] || { echo "check-verbs: missing $JS"; exit 1; }

# Verbs the frontend calls: run('x') or run('x', ...)
frontend=$(grep -oE "run\('[a-z]+'" "$JS" | sed "s/run('//; s/'//" | sort -u)

# Verbs allowed by the rpcd shim: top-level keys inside the ALLOWED table.
allowed=$(sed -n '/^const ALLOWED = {/,/^};/p' "$UC" \
	| sed -nE "s/^[[:space:]]*([a-z]+):[[:space:]]*\{.*/\1/p" | sort -u)

missing=""
for v in $frontend; do
	echo "$allowed" | grep -qx "$v" || missing="$missing $v"
done

if [ -n "$missing" ]; then
	echo "check-verbs: FAIL - frontend calls verbs that rpcd refuses:$missing"
	exit 1
fi

# `download` is intentionally allowed but never called by the frontend.
unused=""
for v in $allowed; do
	[ "$v" = "download" ] && continue
	echo "$frontend" | grep -qx "$v" || unused="$unused $v"
done

[ -n "$unused" ] && echo "check-verbs: note - allowed but not called by frontend:$unused"

echo "check-verbs: OK"
echo "  frontend: $(echo $frontend | tr '\n' ' ')"
echo "  allowed : $(echo $allowed | tr '\n' ' ')"
exit 0
