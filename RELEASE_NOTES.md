# v9 — 修复升级后控制台免密（conffile 继承绕过认证）

**此版本取代全部历史版本。** 这是 v6 那个"控制台免密"问题的第三轮修复，前两轮都只堵住了一个入口，而真正的绕过路径是配置文件继承。

版本标识：`r8199-cbe28467f`，baked tag `v9-r8200`，包数 574，内核 `6.18.55`。

---

## 一、安全缺陷：升级后控制台免密进入 root shell

### 现象（ESXi 7.0 实机复现）

把一台运行 v7 的机器 `sysupgrade` 到 v8，ssh / LuCI 一切正常，但**串口与 VGA 控制台不需要密码，直接落入 root shell**。

v8 镜像本身是干净的：镜像内 `/etc/config/system` 默认 `ttylogin='1'`，`/etc/shadow` 是合法的 9 字段哈希。问题出在升级过程。

### 根因

`/etc/config/system` 是 conffile，`sysupgrade`（即使带 `-n`）会把它**原样保留**。旧固件写过 `option ttylogin '0'`，这个值一路活到新系统，覆盖了新镜像的默认值 `1`。

而 v6 引入的 `login.sh` 是这样判断的：

```sh
[ "$(uci -q get system.@system[0].ttylogin)" = 0 ] && exec /bin/ash --login
exec /bin/login
```

注释写着"只在显式 0 时免密"，但**显式 0 恰恰就是继承来的那个值**。于是：

| 入口 | v1–v5 | v6–v8 |
|---|---|---|
| 早期启动 config 尚未生成（空值） | ❌ 免密 | ✅ 已堵 |
| 升级继承 `ttylogin=0` | ❌ 免密 | ❌ **仍免密** |

v6 的修法把 fail-open 从"空值"挪到了"显式 0"，而 conffile 继承正好制造显式 0。

### 实机证据

```
FINAL_TAG=v9-r8200
FINAL_TTYLOGIN=0                                  ← 继承自旧固件，未被修正
FINAL_LOGIN_ACTIVE=exec /bin/login;               ← v9 有效代码只剩这一行
```

v8 上同样的 `ttylogin=0` 会让 `login.sh` 走 `exec /bin/ash --login`；v9 上该分支已不存在。

### 修复

`login.sh` **不再读取 `ttylogin`**，无条件执行 `/bin/login`：

```sh
#!/bin/sh
# ... 三轮历史注释 ...
exec /bin/login
```

为什么不用"开机脚本纠正 `ttylogin`"：那只能在 `boot` 服务跑起来之后生效，而 `askfirst` 控制台可能先于它、或从备份恢复的配置再次带入 `0`。把开关从安全关键路径上彻底移除，比持续追赶它更可靠。

代价是 `ttylogin=0`（免密控制台）这个选项在本固件上失效。对本项目是刻意取舍：需求明确要求控制台必须账号密码验证。

---

## 二、mwan3 探测目标与日志刷屏修复（v8 内容，本版包含）

### 根因

两条独立缺陷叠加：

1. 默认 `track_ip` 含 OpenDNS 的 `208.67.222.222` / `208.67.220.220`，国内多数网络不响应 ICMP。
2. 日志条件是 `[ $score -gt $up ]`，而健康时 `score` 恒等于 `down+up`，条件永远成立 → **每个探测周期都写一行**，永不停止。只换 IP 治不了刷屏。

### 改动

- `wan` / `wanb` 探测目标：`8.8.8.8`、`1.0.0.1`、`9.9.9.9`、`94.140.14.14`（Google / Cloudflare / Quad9 / AdGuard 各一），`reliability` 保持 `2`
- `mwan3track` 改对比目标上一次状态：`up→down` 记 `failed`，恢复记 `recovered`，稳定状态零日志
- 新增 `/etc/uci-defaults/mwan3-fix-track-ips`，只在 `track_ip` 完全等于旧四值时迁移，用户自定义不动

### 实机验证

在 ESXi 上向 v7 写入旧四值，升级后：

```
TRACK_IP=8.8.8.8 1.0.0.1 9.9.9.9 94.140.14.14
RELIABILITY=2
MWAN3TRACK_PREV_STATE=6
MIGRATION_SCRIPT_RAN=consumed
```

迁移脚本执行后按 uci-defaults 约定自动删除，配置已落盘。

---

## 三、ESXi 7.0 实机验证（本轮新增，此前只有 QEMU）

测试机 `lede-openwrt`，2 vCPU / 2048 MB，BIOS 引导，`sysupgrade` 保留配置升级。

### 部署与升级路径

| 步骤 | 结果 |
|---|---|
| v7 基线确认 | ✅ `v7-r8200` |
| 在线更新检测（GitHub API） | ✅ `CURRENT=v7-r8200` → `LATEST=v8-r8200`，`UPDATE_AVAILABLE=1` |
| 在线更新下载 | ⚠️ 链路可用但仅约 1 MB/min（国际出口），未等待完成 |
| 局域网传入固件 | ✅ 194695359 字节 |
| guest 内 SHA256 校验 | ✅ 与发布值一致 |
| `sysupgrade` 保留配置 | ✅ 完成并重启 |
| 升级后版本 | ✅ `v8-r8200`，再升 `v9-r8200` |

### 升级后系统状态（v9）

| 检查项 | 结果 |
|---|---|
| `BAKED_TAG` | ✅ `v9-r8200` |
| `REVISION` / `RELEASE` | ✅ `R26.10.25` / `24.10.5` |
| 内核 | ✅ `6.18.55` |
| 包数 | ✅ 574 |
| LAN / WAN | ✅ `192.168.1.1/24` / `172.16.99.210/24` |
| dnsmasq / uhttpd | ✅ running |
| firewall4 规则 | ✅ 210 行 |
| LuCI | ✅ 可达 |
| shadow 字段数 | ✅ 9，`$1$` 哈希 |
| `ttylogin` | ⚠️ `0`（继承值仍在，但已无法影响认证） |
| `login.sh` 有效代码 | ✅ 仅 `exec /bin/login` |
| mwan3 迁移 | ✅ 已迁移且脚本已消费 |
| 升级残留 cron / 临时镜像 | ✅ 均已清理 |

### 测试方法说明

ESXi 上 `govc guest.run` 在调用返回时会回收该会话的子进程，直接用 `setsid`/`nohup` 启动的 `sysupgrade` 会在打包配置阶段被 SIGKILL。已排除 OOM（可用内存 1.4 GB，`/tmp` 空闲 760 MB，`dmesg` 无 OOM 记录）。改为写入一次性 cron 任务（`* * * * *`）脱离 Tools 会话后，升级完整执行。

---

## 四、上游同步

`07cebbcf2` → `cbe28467f`，5 个提交，与本项目改动零重叠：

```
cbe28467f exfat-oot: restore support for Linux 5.4
09c5b021a airoha: add kmod-crypto-hw-airoha-eip93 module package
704e907c6 kernel: restore accelerated crypto modules on ARM
b941247a2 amlogic: enable GXL MDIO mux on Linux 6.18
2def33628 mac80211: fix brcmfmac build with stable kernels
```

本地 4 项改动与 5 个自定义包全部保留。

---

## 五、镜像

| 文件 | 大小 |
|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 185 MB |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 184 MB |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 186 MB |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 186 MB |
| `openwrt-x86-64-generic-ext4-combined.img.gz` | 234 MB |
| `openwrt-x86-64-generic-ext4-combined-efi.img.gz` | 234 MB |
| `openwrt-x86-64-generic.manifest` | 15 KB |

校验：`sha256sum -c RELEASE_SHA256SUMS`

> `.img.gz` 的 `gzip -t` 会报 `trailing garbage ignored`（退出码 2）。那是 OpenWrt 追加的 usign 签名块（尾部约 532 字节），属正常结构。

ESXi 使用：`squashfs-combined-efi.vmdk` 或 `squashfs-combined.vmdk` 直接挂盘，或 `sysupgrade -v` 升级现有设备。

---

## 六、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

从任意旧版本升级到 v9 都会强制启用控制台密码认证，无论旧配置里 `ttylogin` 是什么。

---

## 七、已知限制

- **`ttylogin=0` 失效**：本固件刻意不提供免密控制台
- 在线更新在国内链路上很慢（实测约 1 MB/min），建议手动下载后 `sysupgrade`
- mwan3 新目标的可达性存在地区差异，若仍见 `failed`，替换为你能 ping 通的目标
- 硬件加速不可用（x86 无 NSS/HNAT/SFE）
- 代理工具互斥：OpenClash / passwall / ssr-plus 同时只能启用一个
- 在线更新的 SHA256 与固件同源，可防传输损坏与单文件替换，防不住整个 Release 被攻陷（未加 GPG 签名）

---

## 八、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
