#!/bin/bash
# Run a command inside the ESXi test guest, retrying the transient
# "operation is not allowed in the current state" fault.
#
# VMware Tools rejects guest operations that overlap with a previous one or
# that arrive while the guest is mid-transition; the standard remedy is to
# wait and retry rather than to treat it as a real failure.
set -u

VM="${VM:-lede-openwrt}"
CREDS="${CREDS:-root:password}"
ATTEMPTS="${ATTEMPTS:-6}"

export GOVC_URL='https://172.16.99.1/sdk'
export GOVC_USERNAME='root'
export GOVC_PASSWORD="${ESXI_PASS:?ESXI_PASS not set}"
export GOVC_INSECURE=1
export GOVC_DATACENTER=ha-datacenter

if [ $# -lt 1 ]; then
	echo "usage: gexec.sh <command> [args...]" >&2
	exit 2
fi

i=1
while [ "$i" -le "$ATTEMPTS" ]; do
	out=$(timeout 120 govc guest.run -vm "$VM" -l "$CREDS" -- "$@" 2>&1)
	rc=$?
	case "$out" in
		*"not allowed in the current state"*|*"operations are not allowed"*)
			sleep 4
			i=$((i+1))
			continue
			;;
	esac
	printf '%s\n' "$out"
	exit "$rc"
done

echo "gexec: gave up after $ATTEMPTS attempts" >&2
printf '%s\n' "$out" >&2
exit 1
