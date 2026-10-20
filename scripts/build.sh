#!/bin/bash
# LEDE build driver — MUST keep 1 core for OpenClaw Gateway (see AGENTS.md)
#
# Rules enforced here:
#   1. concurrency max 5        → make -j5 (never -j$(nproc), -j6, or bare -j)
#   2. low priority             → nice -n 19
#   3. pin to cores 0-4         → taskset -c 0-4 (core 5 fully reserved)
#   4. pause on gateway stress  → kill -STOP / kill -CONT
set -u
cd /root/.openclaw/projects/2b8438d59d70cf58/lede || exit 1
export FORCE_UNSAFE_CONFIGURE=1

JOBS=5
CPUS="0-4"
READYZ="http://127.0.0.1:18789/readyz"

nice_make() {
	taskset -c "$CPUS" nice -n 19 make -j"$JOBS" "$@"
}

# --- gateway health guard -------------------------------------------------
# Returns 0 when the gateway looks healthy, 1 when degraded.
gateway_ok() {
	local body
	body=$(curl -sf --max-time 5 "$READYZ" 2>/dev/null) || return 1
	case "$body" in
		*'"ready":true'*)
			case "$body" in
				*'"degraded":true'*) return 1 ;;
				*) return 0 ;;
			esac
			;;
		*) return 1 ;;
	esac
}

BUILD_PID=""
PAUSED=0

pause_build() {
	[ -n "$BUILD_PID" ] || return 0
	[ "$PAUSED" -eq 0 ] || return 0
	echo "=== $(date -Is) gateway degraded -> STOP build (pid $BUILD_PID) ==="
	kill -STOP -- "-$BUILD_PID" 2>/dev/null || kill -STOP "$BUILD_PID" 2>/dev/null
	PAUSED=1
}

resume_build() {
	[ -n "$BUILD_PID" ] || return 0
	[ "$PAUSED" -eq 1 ] || return 0
	echo "=== $(date -Is) gateway recovered -> CONT build ==="
	kill -CONT -- "-$BUILD_PID" 2>/dev/null || kill -CONT "$BUILD_PID" 2>/dev/null
	PAUSED=0
}

# Background watchdog: pause the build while the gateway is unhealthy.
watchdog() {
	while :; do
		sleep 20
		if gateway_ok; then
			resume_build
		else
			pause_build
		fi
	done
}

run_phase() {
	local name="$1"; shift
	echo "=== $(date -Is) $name start ==="
	setsid nice_make "$@" >"/tmp/${name}.log" 2>&1 &
	BUILD_PID=$!
	local rc=0
	wait "$BUILD_PID" || rc=$?
	BUILD_PID=""
	echo "=== $(date -Is) $name rc=$rc ==="
	return "$rc"
}

echo "=== $(date -Is) build driver start (jobs=$JOBS, cpus=$CPUS, nice=19) ==="

watchdog &
WATCHDOG_PID=$!
trap 'kill "$WATCHDOG_PID" 2>/dev/null' EXIT

# Download is network-bound but still capped at 5 and niced for consistency.
run_phase download || true

# Main build. On failure retry serially with verbose output for diagnosis.
if run_phase build; then
	echo "DONE rc=0"
	exit 0
fi

echo "=== $(date -Is) serial retry (-j1 V=s) ==="
setsid taskset -c "$CPUS" nice -n 19 make -j1 V=s >/tmp/build-retry.log 2>&1 &
BUILD_PID=$!
rc=0
wait "$BUILD_PID" || rc=$?
BUILD_PID=""
echo "=== $(date -Is) retry rc=$rc ==="
echo "DONE rc=$rc"
exit "$rc"
