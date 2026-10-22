# v4 / r8194-07cebbcf2 — AdGuardHome 界面替换 + 代理内核升级 + Hysteria

第四个构建版本。相对 v3 的四项变更：**替换 AdGuardHome LuCI 为 rufengsuixing 版**、**升级 xray-core 与 chinadns-ng**、**新增 Hysteria**、**精简 coremark/cfdisk**。

## 基础信息

| 项 | v3 | v4 |
|---|---|---|
| 版本号 | `r8194-07cebbcf2` | `r8194-07cebbcf2`（重新构建） |
| 上游提交 | `07cebbcf2` | `07cebbcf2`（未变） |
| 内核 | 6.18.55 | 6.18.55 |
| 目标平台 | x86/64 Generic | x86/64 Generic |
| 根分区 | 2048 MiB | 2048 MiB |
| 引导方式 | GRUB（BIOS + EFI） | GRUB（BIOS + EFI） |
| 防火墙后端 | firewall4 + nftables | firewall4 + nftables |
| 软件包总数 | 573 | **572** |
| 镜像压缩 | gzip | gzip |

---

## 一、AdGuardHome LuCI 替换为 rufengsuixing 版（主要变更）

### 变更内容

| 项 | v3 | v4 |
|---|---|---|
| LuCI 应用 | `luci-app-adguardhome` 26.292.28058（LEDE 自带） | **`luci-app-adguardhome` 1.8-11（rufengsuixing）** |
| 功能范围 | 261 行，仅状态显示 + 路径配置 | **完整管理界面**：启停、端口、重定向模式、yaml 编辑、日志、密码、gfwlist |
| 重定向模式 | 无 | **4 种**：`none` / `dnsmasq-upstream` / `redirect` / `exchange` |

### 默认行为（重要）

```uci
option enabled '0'      # AdGuardHome 不启动
option redirect 'none'  # 不接管 DNS
```

**开机后由 dnsmasq 独占 53 端口正常解析，AdGuardHome 完全不介入。**

### 路径对齐

rufengsuixing 原版路径与官方 `adguardhome` 包冲突，已修正：

| 项 | 原值 | 本版 |
|---|---|---|
| `binpath` | `/usr/bin/AdGuardHome/AdGuardHome` | `/usr/bin/AdGuardHome` |
| `workdir` | `/usr/bin/AdGuardHome` | `/var/lib/adguardhome` |
| `configpath` | `/etc/AdGuardHome.yaml` | `/etc/adguardhome/adguardhome.yaml` |

原值会让「目录」与「二进制文件」同名冲突，导致无法启动。

### 移除官方包的自启路径

`package/adguardhome/Makefile` 不再安装：

```
/etc/init.d/adguardhome          ← 官方小写 init
/etc/uci-defaults/adguardhome    ← 首启自动启动脚本
```

官方包仅提供二进制，启停完全由 rufengsuixing 的 `/etc/init.d/AdGuardHome` 接管。

### 四种重定向模式说明

| 模式 | 行为 | 适用 |
|---|---|---|
| `none` | 不接管，dnsmasq 独占 53 | **默认** |
| `dnsmasq-upstream` | AGH 作为 dnsmasq 上游，dnsmasq 仍占 53 | 想保留 dnsmasq 缓存 |
| `redirect` | 防火墙把 53 重定向到 AGH 端口 | 想让 AGH 处理所有查询 |
| `exchange` | AGH 直接用 53，dnsmasq 换到其他端口 | AGH 完全接管 |

选 `redirect` 或 `exchange` 后，由 **AdGuardHome 自己**写 `firewall.AdGuardHome` include 规则（`/usr/share/AdGuardHome/firewall.start`），固件**不预置任何劫持规则**。

### 已知小瑕疵

开机日志会有一行：

```
daemon.notice procd: /etc/rc.d/S95AdGuardHome:
awk: /etc/adguardhome/adguardhome.yaml: No such file or directory
```

原因：rufengsuixing 的 init 在 `enabled=0` 时仍调 `_do_redirect 0`，尝试读 yaml 取端口，但配置文件尚未生成。**仅日志提示，脚本正常返回，AdGuardHome 保持关闭，dnsmasq 不受影响。**

---

## 二、代理内核升级

| 包 | v3 | v4 |
|---|---|---|
| **xray-core** | 26.6.1-1 | **26.10.17-9** |
| **chinadns-ng** | 2025.06.20-1 | **2025.08.09-1** |
| **luci-app-ssr-plus** | 196-r19 | **197-r3** |
| sing-box | 1.14.3-1 | 1.14.3-1 |
| mihomo | 1.19.32-2 | 1.19.32-2 |
| haproxy | 3.2.16-1 | 3.2.16-1 |

### 版本冲突修复说明

`feeds/packages/net/` 与 `feeds/helloworld/` 存在同名包的**两份副本**，且版本不同：

```
feeds/packages/net/xray-core      26.6.1     ← 旧版，原先实际被使用
feeds/helloworld/xray-core        26.10.17   ← 新版
```

`feeds install` 时 `packages` feed 先注册，导致旧版胜出。本版将 helloworld 的新版复制到 `package/`（优先级高于 `package/feeds/`），索引确认指向：

```
Package: xray-core
Version: 26.10.17-9
Source-Makefile: package/xray-core/Makefile

Package: chinadns-ng
Version: 2025.08.09-1
Source-Makefile: package/chinadns-ng/Makefile
```

---

## 三、新增 Hysteria

| 包 | 版本 |
|---|---|
| **hysteria** | **2.13.0-1** |

- Go 编译，二进制 33M
- Passwall 已启用 `INCLUDE_Hysteria`，可在 Passwall 节点里使用 Hysteria2 协议
- **注意**：SS/SSR Plus+ 的 Hysteria2 节点走 mihomo/xray 内核，不依赖此独立二进制

---

## 四、精简软件包

| 包 | 大小 | 原因 |
|---|---|---|
| `coremark` | 12K | CPU 跑分工具，路由器无用 |
| `cfdisk` | 40K | 分区工具，已有 `parted` / `lsblk` |

**保留的包**（有反向依赖，不可移除）：

| 包 | 依赖方 |
|---|---|
| `luci-app-oui` | `luci-mod-admin-full` 硬依赖 |
| `shadowsocksr-libev-ssr-local` / `-redir` | ssr-plus `INCLUDE_ShadowsocksR_Libev_Client` |
| `v2ray-plugin` | passwall `INCLUDE_V2ray_Plugin` |
| `v2ray-geoip` / `v2ray-geosite` | ssr-plus `INCLUDE_GeoData` / passwall `INCLUDE_V2ray_Geodata` |
| `mihomo` | ssr-plus `INCLUDE_Mihomo` |
| `smartmontools` | `quickstart` 硬依赖 |
| `pciids` | `pciutils` 硬依赖（autocore-x86 需要） |
| `sysfsutils` | `lm-sensors` 硬依赖（autocore-x86 需要） |

---

## 五、软件包清单（572 个）

### 应用（LuCI App）

| 包名 | 版本 |
|---|---|
| **luci-app-adguardhome** | **1.8-11（rufengsuixing）** |
| luci-app-arpbind | 26.292.28058 |
| luci-app-autoreboot | 26.292.28058 |
| luci-app-bandix-plus | 0.1.3-r1 |
| luci-app-beardropper | 1.1-r20200522 |
| luci-app-bridge | 0 |
| luci-app-ddns-go | 26.292.28058 |
| luci-app-fakehttp | 0.9.18-r1 |
| luci-app-firewall | 26.292.28058 |
| luci-app-frpc | 26.292.28058 |
| luci-app-mwan3 | 26.292.28058 |
| luci-app-natter2 | 1.0-r5 |
| luci-app-nlbwmon | 26.292.28058 |
| luci-app-onliner | 1.1-r5 |
| luci-app-openclash | 0.48.002 |
| luci-app-oui | 1.0.9-r1 |
| luci-app-package-manager | 26.292.28058 |
| luci-app-passwall | 26.10.16-r2 |
| luci-app-pppoe-relay | 26.292.28058 |
| luci-app-quickstart | 0.12.10-r1 |
| luci-app-ramfree | 26.292.28058 |
| luci-app-ssr-plus | **197-r3** |
| luci-app-store | 0.2.1-r1 |
| luci-app-syncdial | 2.0-r25 |
| luci-app-taskplan | 3.0.0-r20260303 |
| luci-app-ttyd | 26.292.28058 |
| luci-app-turboacc | 26.292.28058 |
| luci-app-upnp | 26.292.28058 |
| luci-app-wechatpush | 3.6.12-r1 |
| luci-app-wrtbwmon | 2.0.13-r1 |
| luci-app-zerotier | 26.292.28058 |

### 代理与网络工具

| 包名 | 版本 |
|---|---|
| **xray-core** | **26.10.17-9** |
| **chinadns-ng** | **2025.08.09-1** |
| **hysteria** | **2.13.0-1** |
| sing-box | 1.14.3-1 |
| mihomo | 1.19.32-2 |
| shadowsocks-rust-sslocal | 1.25.0-3 |
| shadowsocksr-libev-ssr-local | 2.5.6-13 |
| shadowsocksr-libev-ssr-redir | 2.5.6-13 |
| simple-obfs-client | 0.0.5-2 |
| v2ray-plugin | 5.49.0-1 |
| v2ray-geoip | 202506050146.1 |
| v2ray-geosite | 20250608120644.1 |
| fakehttp | 0.9.18-1 |
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

## 六、验证结果

### 双网口 QEMU 实测（KVM，WAN + LAN）

```
版本      LEDE R26.10.22 / x86-64
内核      6.18.55
接口      eth1(WAN) 10.0.2.15/24 ｜ br-lan 192.168.1.1/24 ｜ 物理口 2
路由      default via 10.0.2.2 dev eth1
WAN IP    10.0.2.15（DHCP 正常）
DNS       www.baidu.com → 180.101.49.44
          github.com    → 20.205.243.166
连通      网关 10.0.2.2 ✅ ｜ 外网 223.5.5.5 ✅
LuCI      HTTP 200
内存      100MB 已用 / 842MB 可用
内核异常  panic / oops / BUG 全部为空
```

### 防火墙专项验证（11 种方法交叉确认）

```
组件      /sbin/fw4, fw4.uc, nft, ucode, init, config 全部存在
服务      status rc=0 ｜ enabled rc=0 ｜ S19firewall 存在
规则      nft list table inet fw4 → 225 行 ｜ 32 条 chain ｜ 21 条 counter
语法      fw4 -q check → rc=0
配置      zone 14 个 ｜ forwarding 3 个
模块      nf_/nft_/xt_ 共 96 个 ｜ nf_tables 已加载
实测      WAN:22 被拒绝（符合 wan zone input=REJECT）
重启      前后均 225 行，规则无丢失
```

**防火墙完全正常。** 注：`/etc/init.d/firewall running` 对 fw4 这种 oneshot 服务永远返回非零（执行完即退出），不能用它判断状态。

### AdGuardHome 状态

```
luci-app-adguardhome  1.8-11（rufengsuixing）✅
adguardhome           0.107.79-1（官方二进制）✅
/etc/init.d/AdGuardHome    存在（rufeng 版）
/etc/init.d/adguardhome    无（官方版已移除）✅
/etc/uci-defaults/adguardhome  无（自启已移除）✅
rc.d 自启链接              无 ✅
AdGuardHome 进程           未启动 ✅
53 端口                    全部由 dnsmasq 占用 ✅
```

---

## 七、构建配置同步

`seed.config` 与 `package/custom/` 已与实际构建一致：

- `CONFIG_TARGET_IMAGES_GZIP=y`
- `package/custom/adguardhome/`（含 golang 路径修正、移除 init/uci-defaults）
- `package/custom/luci-app-adguardhome-rufeng/`（含路径对齐修正）
- `package/xray-core/`、`package/chinadns-ng/`（helloworld 新版覆盖）
- `manifest/` 与 `RELEASE_SHA256SUMS` 已更新

### feeds 版本

```
packages   coolsnowwolf/packages   ae3a555
luci       coolsnowwolf/luci       52fe209  (openwrt-25.12)
routing    coolsnowwolf/routing    2d0f967
telephony  coolsnowwolf/telephony  d3bcb15
helloworld fw876/helloworld        11e0a48
```

---

## 八、升级与刷机

### 从 v3 升级（保留配置）

```bash
sysupgrade -k openwrt-x86-64-generic-squashfs-combined.img.gz
```

### 全新安装（ESXi）

1. 解压 `.vmdk`（squashfs 版 185M，无需解压）
2. 挂载到 ESXi 虚拟机，BIOS 或 EFI 引导均可
3. 默认地址 `192.168.1.1`，默认账号 `root` / `password`

**⚠️ 首启后立即修改密码**：

```bash
passwd
```

### 启用 AdGuardHome

1. LuCI → 服务 → AdGuardHome
2. 打开「启用」开关
3. 选择重定向模式（建议先试 `dnsmasq-upstream`，最温和）
4. 保存并应用

首次启用会自动生成 `/etc/adguardhome/adguardhome.yaml`，Web 管理界面在 `http://<路由器IP>:3000`。

---

## 九、文件校验

见 [RELEASE_SHA256SUMS](RELEASE_SHA256SUMS)，验证方式：

```bash
sha256sum -c RELEASE_SHA256SUMS
```
