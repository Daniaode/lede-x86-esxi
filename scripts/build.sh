#!/bin/bash
cd /root/.openclaw/projects/2b8438d59d70cf58/lede || exit 1
export FORCE_UNSAFE_CONFIGURE=1
echo "=== $(date -Is) download start ==="
make download -j8 >/tmp/dl3.log 2>&1
echo "=== $(date -Is) download rc=$? ==="
echo "=== $(date -Is) build start ==="
make -j4 >/tmp/build3.log 2>&1
rc=$?
echo "=== $(date -Is) build rc=$rc ==="
echo "DONE rc=$rc"
