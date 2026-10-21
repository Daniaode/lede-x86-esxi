# v3 / r8194-07cebbcf2 — gzip 镜像 + FakeHTTP 安全加固

第三个构建版本。相对 v2 的三项变更：**产物改为 gzip 压缩**、**FakeHTTP 切换到 killadm 加固分支**、**构建配置与仓库同步**。

## 基础信息

| 项 | v2 | v3 |
|---|---|---|
| 版本号 | `r8194-07cebbcf2` | `r8194-07cebbcf2`（重新构建） |
| 上游提交 | `07cebbcf2` | `07cebbcf2`（未变） |
| 内核 | 6.18.55 | 6.18.55 |
| 目标平台 | x86/64 Generic | x86/64 Generic |
| 根分区 | 2048 MiB | 2048 MiB |
| 引导方式 | GRUB（BIOS + EFI） | GRUB（BIOS + EFI） |
| 防火墙后端 | firewall4 + nftables | firewall4 + nftables |
| 软件包总数 | 573 | 573 |
| 镜像压缩 | 无 | **gzip** |

---

## 一、产物改为 gzip 压缩（行为变更）

开启 `CONFIG_TARGET_IMAGES_GZIP=y`，所有 `.img` 产物同时提供 `.gz` 版本。

| 文件 | 压缩前 | 压缩后 |
|---|---|---|
| squashfs-combined.img | 2.1G | **179M** |
| squashfs-combined-efi.img | 2.1G | **179M** |
| ext4-combined.img | 2.1G | **227M** |
| ext4-combined-efi.img | 2.1G | **227M** |

**使用方式**：刷机前解压

```bash
gunzip openwrt-x86-64-generic-squashfs-combined.img.gz
```

**注意**：`.vmdk` 不受此选项影响（OpenWrt 只压缩 `.img`）。ext4 系列的 vmdk 另有 `.vmdk.gz` 版本；squashfs 的 vmdk 保持未压缩（177M/178M，本身已足够小）。

---

## 二、FakeHTTP 切换到 killadm 加固分支（安全修复）

### 变更内容

| 项 | v2 | v3 |
|---|---|---|
| 源码仓库 | `MikeWang000000/FakeHTTP` | **`killadm/FakeHTTP`**（原作者仓库的 fork） |
| 锁定提交 | `eda98bb4`（2025-06-24） | **`59977c07`**（2026-07-22） |
| 提交差距 | — | **领先 24 个提交** |
| 新增依赖 | — | `ca-bundle`、`uclient-fetch` |
| 新增功能 | — | IP / 端口过滤规则（`src/filter.c`，22K） |

### 24 项修复清单

**内存与资源安全**
- `fix realloc failure handling` — 内存分配失败时正确退出，不再继续使用无效指针
- `cache SNAT raw sockets` — 缓存 SNAT raw socket，减少重复创建
- `index srcinfo lookups by hash bucket` — 源信息查询改为哈希桶索引
- `cap log file size` — 限制日志文件大小上限
- `Add async log rotation` — 异步日志轮转
- `Recover log files after rotation failures` — 日志轮转失败后自动恢复

**协议解析加固**
- `Harden packet and payload parsing` — 数据包与载荷解析加固（边界检查）
- `Harden argument and send helpers` — 参数处理与发送辅助函数加固
- `Tighten signal and source info handling` — 信号与源信息处理收紧
- `use sig_atomic_t for exit flag` — 退出标志改用 `sig_atomic_t`（信号安全）
- `Make command execution fork-safe` — 命令执行改为 fork 安全
- `Avoid partial firewall rule installs` — 避免防火墙规则半装（原子安装）

**稳定性**
- `Make NFQUEUE error handling fail-open` — NFQUEUE 错误时 fail-open，不再静默丢包
- `poll nfqueue socket with timeout` — NFQUEUE socket 带超时轮询，避免永久阻塞
- `relax nfqueue transient error handling` — 放宽瞬时错误处理
- `Optimize NFQUEUE receive path` — 优化接收路径性能
- `fix rawsend ethertype log argument` — 修正 rawsend 日志参数
- `replace rand with fast PRNG` — 改用快速伪随机数生成器
- `reduce logger hot path overhead` — 降低日志热路径开销
- `fix: Correct typos` — 拼写修正
- `format recent stability fixes` — 稳定性修复代码格式化
- `Document filter behavior in Chinese` — 中文文档补充
- `Add IP and port filter rules` — **新增 IP/端口过滤功能**
- `Apply clang-format` — 代码格式化

### 为什么切到 fork

`killadm/FakeHTTP` 是原作者仓库的直接 fork（`parent: MikeWang000000/FakeHTTP`），**未改动上游历史，纯增量提交**。v2 使用的 `eda98bb4` 停在 2025-06-24，之后一年多的加固全部缺失。

### LuCI 界面

`luci-app-fakehttp 0.9.18-r1` 的界面与外壳脚本来自 [killadm/luci-app-fakehttp](https://github.com/killadm/luci-app-fakehttp)，本次核实与上游**逐字节一致**（12 个文件哈希比对通过）。

### 默认配置

`enabled='0'`（不启用）。需要时在 LuCI「网络 → FakeHTTP」开启：

```bash
uci set fakehttp.main.enabled='1'
uci commit fakehttp
/etc/init.d/fakehttp restart
```

---

## 三、软件包清单（573 个）

### 应用（LuCI App）

| 包名 | 版本 | 说明 |
|---|---|---|
| luci-app-adguardhome | 26.292.28058 | DNS 广告过滤 |
| luci-app-arpbind | 26.292.28058 | IP/MAC 绑定 |
| luci-app-autoreboot | 26.292.28058 | 定时重启 |
| luci-app-bandix-plus | 0.1.3-r1 | 带宽监控增强 |
| luci-app-beardropper | 1.1-r20200522 | 异常连接拦截 |
| luci-app-bridge | 0 | 网桥配置 |
| luci-app-ddns-go | 26.292.28058 | 动态域名 |
| **luci-app-fakehttp** | **0.9.18-r1** | **FakeHTTP 界面（本版更新）** |
| luci-app-firewall | 26.292.28058 | 防火墙 |
| luci-app-frpc | 26.292.28058 | 内网穿透客户端 |
| luci-app-mwan3 | 26.292.28058 | 多 WAN 负载均衡 |
| luci-app-natter2 | 1.0-r5 | NAT 穿透 |
| luci-app-nlbwmon | 26.292.28058 | 流量统计 |
| luci-app-onliner | 1.1-r5 | 在线设备 |
| luci-app-openclash | 0.48.002 | OpenClash |
| luci-app-oui | 1.0.9-r1 | 厂商识别 |
| luci-app-package-manager | 26.292.28058 | 软件包管理 |
| luci-app-passwall | 26.10.16-r2 | PassWall |
| luci-app-pppoe-relay | 26.292.28058 | PPPoE 穿透 |
| luci-app-quickstart | 0.12.10-r1 | 快速设置 |
| luci-app-ramfree | 26.292.28058 | 内存释放 |
| luci-app-ssr-plus | 196-r19 | SSR Plus |
| luci-app-store | 0.2.1-r1 | 应用商店 |
| luci-app-syncdial | 2.0-r25 | 多拨 |
| luci-app-taskplan | 3.0.0-r20260303 | 任务计划 |
| luci-app-ttyd | 26.292.28058 | Web 终端 |
| luci-app-turboacc | 26.292.28058 | 加速 |
| luci-app-upnp | 26.292.28058 | UPnP |
| luci-app-wechatpush | 3.6.12-r1 | 微信推送 |
| luci-app-wrtbwmon | 2.0.13-r1 | 流量监控 |
| luci-app-zerotier | 26.292.28058 | ZeroTier |

### 代理与网络工具

| 包名 | 版本 |
|---|---|
| xray-core | 26.6.1-1 |
| sing-box | 1.14.3-1 |
| mihomo | 1.19.32-2 |
| shadowsocks-rust-sslocal | 1.25.0-3 |
| shadowsocksr-libev-ssr-local | 2.5.6-13 |
| shadowsocksr-libev-ssr-redir | 2.5.6-13 |
| simple-obfs-client | 0.0.5-2 |
| v2ray-plugin | 5.49.0-1 |
| v2ray-geoip | 202506050146.1 |
| v2ray-geosite | 20250608120644.1 |
| **fakehttp** | **0.9.18-1** |
| chinadns-ng | 2025.06.20-1 |
| dns2socks | 2.1-2 |
| dns2tcp | 1.1.2-3 |
| ipt2socks | 1.1.4-1 |
| microsocks | 1.0.4-1 |
| 3proxy | 0.9.5-4 |
| haproxy | 3.2.16-1 |
| frpc | 0.70.1-2 |
| natter2 | 2.2.1-0 |
| ddns-go | 6.17.7-2 |
| zerotier | 1.16.0-1 |
| mwan3 | 2.12.2-2 |
| wireguard-tools | 1.0.20250521-1 |

### 系统与工具

| 包名 | 版本 |
|---|---|
| base-files | 127-r8194-07cebbcf2 |
| kernel | 6.18.55-1 |
| busybox | 1.38.0-2 |
| bash | 5.2.15-1 |
| dnsmasq-full | 2.93-1 |
| dropbear | 2026.94-1 |
| firewall4 | 2024-12-18-18fc0ead-6 |
| nftables-json | 1.1.6-6 |
| iptables | 1.8.7-2 |
| openssl-util | 3.6.4-1 |
| curl | 8.15.0-1 |
| wget-ssl | 1.21.3-1 |
| uclient-fetch | 2026-06-07-daad21fa-1 |
| ca-bundle | 20260601-1 |
| ca-certificates | 20260601-1 |
| ttyd | 1.6.3-3 |
| open-vm-tools | 12.0.0-1 |
| smartmontools | 7.4-2 |
| lm-sensors | 3.6.0-1 |
| pciutils | 3.14.0-1 |
| jq | 1.8.1-2 |
| python3-light | 3.11.13-2 |
| ruby | 3.3.6-1 |
| adguardhome | 0.107.79-1 |
| miniupnpd-nftables | 2.3.9-3 |
| nlbwmon | 2021-09-01-d82c910c-2 |
| wrtbwmon | 1.2.1-3 |
| taskd | 1.0.3-2 |

### LuCI 基础与主题

| 包名 | 版本 |
|---|---|
| luci | 26.292.28058~db1769b |
| luci-base | 26.292.28058~db1769b |
| luci-mod-admin-full | 26.292.28058~db1769b |
| luci-mod-network | 26.292.66897~f017a87 |
| luci-mod-status | 26.293.08594~76e7be1 |
| luci-mod-system | 26.292.28058~db1769b |
| luci-theme-bootstrap | 26.292.28058~db1769b |
| luci-light | 26.292.28058~db1769b |
| luci-compat | 26.292.28058~db1769b |
| luci-proto-ppp | 26.292.28058~db1769b |
| luci-proto-ipv6 | 26.292.28058~db1769b |
| luci-proto-wireguard | 26.292.28058~db1769b |
| luci-lib-xterm | 4.18.0 |
| luci-lib-taskd | 1.0.26 |

### 中文语言包（26 个）

`luci-i18n-arpbind-zh-cn`、`autoreboot`、`bandix-plus`、`base`、`beardropper`、`bridge`、`ddns-go`、`firewall`、`frpc`、`mwan3`、`natter2`、`nlbwmon`、`onliner`、`package-manager`、`passwall`、`pppoe-relay`、`quickstart`、`ramfree`、`ssr-plus`、`taskplan`、`ttyd`、`turboacc`、`upnp`、`wechatpush`、`wrtbwmon`、`zerotier`

### 内核模块（186 个）

包含完整网络驱动（Intel igb/igc/i40e/ixgbe/e1000e、Realtek r8168/r8125/r8126、Broadcom bnx2/tg3、Mellanox mlx4/mlx5、VMware vmxnet3）、存储驱动（ext4/f2fs/exfat/ntfs3/vfat）、USB 与文件系统支持。完整清单见 [manifest](manifest/openwrt-x86-64-generic.manifest)。

---

## 四、构建配置同步

v2 的仓库 `seed.config` 与实际构建不一致，本版已修正：

- `CONFIG_TARGET_IMAGES_GZIP=y`（v2 仓库中为 `not set`）
- `package/custom/fakehttp/Makefile` 更新为 killadm 配方

现在克隆仓库后按 README 构建，产出的固件与本 Release 一致。

### feeds 版本

```
packages   coolswnowolf/packages   6ca187c
luci       coolswnowolf/luci       d76b5e5  (openwrt-25.12)
routing    coolswnowolf/routing    2d0f967
telephony  coolswnowolf/telephony  d3bcb15
helloworld fw876/helloworld        0d24da0
```

---

## 五、验证结果

构建完成后在 QEMU/KVM 中做过真实引导验证（ext4 镜像）：

```
版本      LEDE R26.10.21 / x86-64
内核      6.18.55
网络      br-lan 192.168.1.1/24
监听      0.0.0.0:22  0.0.0.0:80  0.0.0.0:443  192.168.1.1:53
服务      dnsmasq RUN  dropbear RUN  uhttpd RUN  odhcpd RUN
LuCI      HTTP 200
软件包    573
内存      1GB / 824MB 可用
内核异常  panic / oops / BUG 均为 0
```

**说明**：验证环境中 `firewall` 显示 STOP，原因是 QEMU 单网卡全部划入 LAN、无 WAN 接口，fw4 提前退出。ESXi 双网口环境不受影响，但首次刷入后建议确认：

```bash
/etc/init.d/firewall status
fw4 print | head -30
```

---

## 六、升级与刷机

### 从 v2 升级（保留配置）

```bash
sysupgrade -k openwrt-x86-64-generic-squashfs-combined.img.gz
```

### 全新安装（ESXi）

1. 解压 `.vmdk`（squashfs 版为 177M，无需解压）
2. 挂载到 ESXi 虚拟机，BIOS 或 EFI 引导均可
3. 默认地址 `192.168.1.1`，默认账号 `root` / `password`

**⚠️ 首启后立即修改密码**：

```bash
passwd
```

### 控制台登录

默认需要账号密码（`root` / `password`），这是编译期写入的初始值。若用 `sysupgrade -n` 重置，密码会回到该默认值。

---

## 七、文件校验

见 [RELEASE_SHA256SUMS](RELEASE_SHA256SUMS)，验证方式：

```bash
sha256sum -c RELEASE_SHA256SUMS
```
