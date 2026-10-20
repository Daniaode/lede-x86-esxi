#!/bin/bash
cd /root/.openclaw/projects/2b8438d59d70cf58/lede || exit 1
export FORCE_UNSAFE_CONFIGURE=1
echo "=== $(date -Is) download start ==="
make download -j8 >/tmp/dl4.log 2>&1
echo "=== $(date -Is) download rc=$? ==="
echo "=== $(date -Is) build start ==="
make -j4 >/tmp/build4.log 2>&1
rc=$?
echo "=== $(date -Is) build rc=$rc ==="
if [ $rc -ne 0 ]; then
  echo "=== $(date -Is) retry -j1 V=s ==="
  make -j1 V=s >/tmp/build4-retry.log 2>&1
  echo "=== $(date -Is) retry rc=$? ==="
fi
echo "DONE rc=$rc"
