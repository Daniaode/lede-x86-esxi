# v8 — mwan3 探测目标与日志刷屏修复

**此版本取代全部历史版本。** 相对 v7 无新增插件，专注修复一个长期影响日志可读性与故障判断的问题。

版本标识：`r8199-cbe28467f`，baked tag `v8-r8200`，包数 574，内核 `6.18.55`。

---

## 一、修复：mwan3 探测目标不可达导致误判掉线

### 现象

系统日志持续出现：

```
mwan3track[5021]: Check (ping) failed for target "208.67.222.222" on interface wan (eth1). Current score: 3
```

即使 WAN 实际正常，也反复刷出 `failed`。

### 根因

LEDE 上游 `feeds/packages/net/mwan3` 的默认 `track_ip` 是：

```sh
list track_ip '1.1.1.1'
list track_ip '208.67.222.222'
list track_ip '208.67.220.220'
```

`208.67.222.222` / `208.67.220.220` 是 OpenDNS 的解析地址，在国内多数网络**不响应 ICMP**。`reliability 2` 意味着 4 个目标里只要有 2 个通过就算在线，所以链路判定本身还能维持 online，但每次探测失败都会落一条日志——而日志条件是 `score > up`，在健康状态下 `score` 恒等于 `down+up`，于是**每个探测周期都会写一行**，永不停止。

### 修复一：换探测目标

| 位置 | 旧值 | 新值 |
|---|---|---|
| `wan` / `wanb` | `1.0.0.1`、`1.1.1.1`、`208.67.222.222`、`208.67.220.220` | `8.8.8.8`、`1.0.0.1`、`9.9.9.9`、`94.140.14.14` |

四个目标分属 Google / Cloudflare / Quad9 / AdGuard，其中 `8.8.8.8` 与 `1.0.0.1` 在国内可达性最好，`9.9.9.9`、`94.140.14.14` 作为补充。`reliability` 保持 `2`（四选二即判定在线）。

### 修复二：只在状态变化时写日志

`mwan3track` 原来用累计分数判断是否记录：

```sh
[ $score -gt $up ] && do_log="failed"
```

改为对比该目标上一次的探测状态：

```sh
prev_state="$(cat "$MWAN3_TRACK_STATUS_DIR/$INTERFACE/TRACK_${track_ip}" 2>/dev/null)"
...
[ "$prev_state" != "down" ] && do_log="failed"     # 由 up/skipped 变为 down
[ "$prev_state" = "down" ] && do_log="recovered"   # 由 down 恢复
```

结果：目标从 up 翻转为 down 记一条 `failed`，从 down 恢复记一条 `recovered`，稳定状态下**零日志**。日志条目从此等于真实的状态变更事件，可以直接用于判断链路抖动时间点。

### 修复三：升级迁移

`/etc/config/mwan3` 是 conffile，sysupgrade 会保留旧文件，新默认值到不了已有设备。新增 `/etc/uci-defaults/mwan3-fix-track-ips`：

- 仅在某个 interface 的 `track_ip` **恰好等于旧的四个值**时替换
- 用户自己改过的列表一律不动
- 迁移后 `uci commit mwan3` 并重启 mwan3

---

## 二、上游同步

`07cebbcf2` → `cbe28467f`，5 个提交，与本项目改动零重叠：

```
cbe28467f exfat-oot: restore support for Linux 5.4
09c5b021a airoha: add kmod-crypto-hw-airoha-eip93 module package
704e907c6 kernel: restore accelerated crypto modules on ARM
b941247a2 amlogic: enable GXL MDIO mux on Linux 6.18
2def33628 mac80211: fix brcmfmac build with stable kernels
```

本地 4 项改动（`target.mk` 裁剪、控制台认证、shadow 9 字段、login.sh fail-closed）与 5 个自定义包全部保留。

---

## 三、验证结果

### ext4 镜像（QEMU 真实引导）

| 检查项 | 结果 |
|---|---|
| 版本 / 内核 | ✅ `R26.10.25` / `6.18.55` |
| 包数 | ✅ 574 |
| WAN / LAN / 默认路由 | ✅ `10.0.2.15` / `192.168.1.1` / `10.0.2.2` |
| DNS | ✅ |
| 53 端口归属 | ✅ `dnsmasq` |
| AdGuardHome | ✅ 默认关闭 |
| firewall4 + nftables | ✅ 225 行规则，`fw4 check` 通过 |
| WAN 侧 SSH 过滤 | ✅ 阻断 |
| LuCI | ✅ |
| 内核 panic / oops | ✅ 0 |
| shadow 字段数 | ✅ 9 |
| SSH `root:password` | ✅ |
| SSH 错误密码 | ✅ 拒绝 |
| 控制台正确密码登录 | ✅ |

### squashfs 镜像（QEMU 串口实测）

squashfs 根为只读，无法用 ext4 那套注入 `rc.local` 的方式自检，改为直接驱动串口：

| 检查项 | 结果 |
|---|---|
| 出现 `Please press Enter` → `login:` | ✅ |
| 错误密码 | ✅ `Login incorrect` |
| 正确密码进入 root shell | ✅ |
| `uci get mwan3.wan.track_ip` | ✅ 返回新目标集 |
| `mwan3-fix-track-ips` 已安装 | ✅ |

> ext4 镜像的「控制台错误密码」一项在自动化中判为 FAIL，原因是自检脚本在正例 shell 尚未退出时就发送了反例输入，命令被送进了已登录会话。同一断言在 squashfs 镜像上以「先反例、后正例」的顺序重跑，**干净通过**。因此该能力本身已验证，ext4 那次是测试脚本时序问题，不是固件问题。

### mwan3 逻辑

日志抑制是确定性逻辑变更，静态核对 + 镜像内文件比对已完成。真实抖动下的日志行为需要在有 WAN 的实机上观察。

---

## 四、镜像

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

> `.img.gz` 的 `gzip -t` 会报 `trailing garbage ignored`（退出码 2）。那是 OpenWrt 追加的 usign 签名元数据，属正常结构；解压结果完整（squashfs combined 解出 2215116800 字节，分区表与 rootfs magic 均正常）。

ESXi 使用：`squashfs-combined-efi.vmdk` 直接挂盘（EFI 引导），或 `sysupgrade -v` 升级现有设备。

---

## 五、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

或在本版固件内用 `系统 → 在线更新` 完成后续升级。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

已有的 mwan3 自定义配置不会被迁移脚本覆盖；只有仍在使用旧默认探测目标的 interface 会被自动更新。

---

## 六、已知限制

- mwan3 新目标在国内的可达性存在地区差异。若仍见 `failed`，把 `track_ip` 换成你能 ping 通的目标，并保持 `reliability` 不超过目标数的一半
- 硬件加速不可用（x86 无 NSS/HNAT/SFE）
- 代理工具互斥：OpenClash / passwall / ssr-plus 同时只能启用一个
- 在线更新仅支持本仓库，不提供任意源
- 在线更新的 SHA256 与固件同源，可防传输损坏与单文件替换，防不住整个 Release 被攻陷（未加 GPG 签名）

---

## 七、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
