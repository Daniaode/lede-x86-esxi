#!/usr/bin/env python3
"""Boot a squashfs image in QEMU and prove console authentication works.

The squashfs rootfs is read-only, so the rc.local injection trick used by
pipeline-verify-v2.sh cannot be used. This script instead drives the serial
console directly over QEMU's unix socket and asserts:

  - login prompt appears
  - wrong password is rejected ("Login incorrect")
  - correct password yields a root shell

Usage: sq-login-test.py <image.gz> [timeout_seconds]
Exit code 0 = all assertions passed.
"""
import os
import socket
import subprocess
import sys
import time

img_gz = sys.argv[1]
timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 240

WORK = "/root/sqt"
SOCK = os.path.join(WORK, "serial.sock")
LOG = os.path.join(WORK, "serial.log")
IMG = os.path.join(WORK, "test.img")

subprocess.run(["pkill", "-9", "-x", "qemu-system-x86"], capture_output=True)
time.sleep(1)
os.makedirs(WORK, exist_ok=True)

for p in (SOCK, IMG, LOG):
    try:
        os.unlink(p)
    except FileNotFoundError:
        pass

print("SQ| decompressing", os.path.basename(img_gz), flush=True)
with open(IMG, "wb") as out:
    # gzip reports rc=2 on the trailing usign blob; the stream itself is fine.
    subprocess.run("gunzip -c '%s'" % img_gz, shell=True, stdout=out,
                   stderr=subprocess.DEVNULL)
size = os.path.getsize(IMG)
print("SQ| size=%dMB" % (size // 1024 // 1024), flush=True)
if size < 100 * 1024 * 1024:
    print("SQ| RESULT=FAIL reason=decompress", flush=True)
    sys.exit(1)

qemu = subprocess.Popen(
    ["qemu-system-x86_64", "-enable-kvm", "-cpu", "host", "-smp", "2", "-m", "1024",
     "-drive", "file=%s,format=raw,if=virtio" % IMG,
     "-netdev", "user,id=n_lan,net=192.168.1.0/24",
     "-device", "virtio-net-pci,netdev=n_lan",
     "-device", "virtio-rng-pci", "-display", "none", "-monitor", "none",
     "-chardev", "socket,id=ser0,path=%s,server=on,wait=off" % SOCK,
     "-serial", "chardev:ser0"],
    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    start_new_session=True)

s = None
for _ in range(120):
    try:
        c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        c.connect(SOCK)
        s = c
        break
    except OSError:
        if c:
            c.close()
        time.sleep(0.5)

if s is None:
    qemu.kill()
    print("SQ| RESULT=FAIL reason=no-serial-socket", flush=True)
    sys.exit(1)

buf = b""


def read_until(needle, limit):
    """Read until needle appears in the accumulated buffer."""
    global buf
    deadline = time.time() + limit
    while time.time() < deadline:
        s.settimeout(2.0)
        try:
            data = s.recv(4096)
        except socket.timeout:
            continue
        except OSError:
            return False
        if not data:
            return False
        with open(LOG, "ab", buffering=0) as lf:
            lf.write(data)
        buf += data
        if needle.encode() in buf:
            return True
    return False


def send(text):
    s.sendall((text + "\n").encode())
    time.sleep(1.5)


results = {}


def check(name, ok, extra=""):
    results[name] = ok
    print("SQ| %s %s%s" % ("PASS" if ok else "FAIL", name, (" " + extra) if extra else ""),
          flush=True)


def wait_login(limit):
    """Wait for `login:`, pressing Enter to activate the askfirst console."""
    global buf
    deadline = time.time() + limit
    while time.time() < deadline:
        if read_until("login:", 5):
            return True
        s.sendall(b"\n")
        time.sleep(2)
    return False


try:
    check("LOGIN_PROMPT", wait_login(timeout))

    # Negative case first: a wrong password must not produce a shell.
    buf = b""
    send("root")
    got_pw = read_until("Password:", 20)
    check("PASSWORD_PROMPT", got_pw)
    buf = b""
    send("wrongpass")
    rejected = read_until("Login incorrect", 20)
    check("WRONG_PASSWORD_REJECTED", rejected)

    # Positive case on the fresh prompt.
    buf = b""
    if not wait_login(30):
        check("LOGIN_PROMPT_RETRY", False)
    buf = b""
    send("root")
    read_until("Password:", 20)
    buf = b""
    send("password")
    shell = read_until("# ", 30)
    check("CONSOLE_LOGIN_PASSWORD", shell)

    if shell:
        buf = b""
        send("echo SQ_MARK_$(id -u)_$(cut -d' ' -f1 /etc/online-update-current)")
        ok = read_until("SQ_MARK_0_", 20)
        check("ROOT_SHELL", ok)
        buf = b""
        send("uci -q get mwan3.wan.track_ip")
        check("MWAN3_TRACK_IPS", read_until("94.140.14.14", 20))
        buf = b""
        send("ls /etc/uci-defaults/ | grep -c mwan3-fix")
        check("MWAN3_MIGRATION_PRESENT", read_until("1", 15))
        send("exit")
finally:
    if not all(results.values()):
        try:
            tail = open(LOG, "rb").read()[-3000:]
            print("SQ| --- serial tail ---", flush=True)
            print(tail.decode("utf-8", "replace"), flush=True)
        except OSError:
            pass
    s.close()
    qemu.kill()
    try:
        qemu.wait(5)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.unlink(IMG)
    except OSError:
        pass

if all(results.values()):
    print("SQ| RESULT=PASS", flush=True)
    sys.exit(0)

print("SQ| RESULT=FAIL", flush=True)
sys.exit(1)
