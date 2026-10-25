# 私人定制 LEDE / OpenWrt x86-64 固件

面向 **ESXi 虚拟机** 与 **物理 x86 主机** 的个人定制固件构建。同一份镜像两种场景通用：
虚拟机里用 `.vmdk` 直接挂盘，物理机上用 `.img.gz` 写盘，升级统一走 `sysupgrade`。

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede)，内核 **6.18.55**。

---

## 当前版本

| 项目 | 值 |
|---|---|
| 版本标识 | `r8199-cbe28467f` |
| baked tag | `v10-r8200` |
| LEDE 基线 | `24.10.5` |
| 内核 | `6.18.55` |
| 目标 | `x86/64` Generic |
| 架构 | `x86_64` |
| 软件包总数 | **574** |
| 其中内核模块 | 186 |
| 其中 LuCI 应用 | 32 |
| 其中 LuCI 中文语言包 | 27 |
| 根分区 | 2048 MiB |
| 引导 | GRUB（BIOS + EFI 双支持） |
| 防火墙后端 | firewall4 + nftables |
| 镜像格式 | `.img.gz` / `.vmdk` |
| 控制台登录 | 强制账号密码（`root` / `password`，**首启后立即修改**） |

**默认策略**

- AdGuardHome 默认关闭，`dnsmasq-full` 独占 53 端口
- mwan3 探测目标为国内节点，`reliability=2`（4 个目标中 2 个在线即判在线）
- 控制台不提供免密模式：`login.sh` 无条件走 `/bin/login`
- `etc/init.d/fix-root-shadow` 开机自检，空密码或字段数不足的 shadow 条目自动修复

---

## 软件版本明细

### 代理 / 分流内核

| 组件 | 版本 | 说明 |
|---|---|---|
| `xray-core` | 26.10.17-9 | XTLS / VLESS / VMess / Trojan |
| `sing-box` | 1.14.3-1 | 通用代理平台 |
| `mihomo` | 1.19.32-2 | Clash Meta 内核 |
| `hysteria` | 2.13.0-1 | QUIC 传输 |
| `shadowsocks-rust-sslocal` | 1.25.0-3 | SS Rust 实现 |
| `shadowsocksr-libev-ssr-local` | 2.5.6-13 | SSR local |
| `shadowsocksr-libev-ssr-redir` | 2.5.6-13 | SSR redir |
| `chinadns-ng` | 2025.08.09-1 | 国内外分流 DNS |
| `geoview` | 0.2.6-1 | GEO 数据查看 |
| `haproxy` | 3.2.16-1 | 负载均衡 / 中转 |
| `dns2socks` | 2.1-2 | DNS over SOCKS |
| `dns2tcp` | 1.1.2-3 | DNS over TCP |
| `ipt2socks` | 1.1.4-1 | iptables 转 SOCKS |
| `microsocks` | 1.0.4-1 | 轻量 SOCKS5 |
| `3proxy` | 0.9.5-4 | 多功能代理 |

### 代理 / 分流面板

| 应用 | 版本 |
|---|---|
| `luci-app-passwall` | 26.10.16-r2 |
| `luci-app-ssr-plus` | 197-r3 |
| `luci-app-openclash` | 0.48.002 |
| `luci-app-fakehttp` | 0.9.18-r1 |

> 三套代理工具同时只能启用一套，否则 iptables/nftables 规则互相覆盖。

### 网络 / 路由

| 应用 | 版本 | 说明 |
|---|---|---|
| `luci-app-mwan3` + `mwan3` | 26.292.28058~db1769b / 2.12.2-2 | 多线多拨 |
| `luci-app-syncdial` | 2.0-r25 | 单线多拨同步 |
| `luci-app-bridge` + `ip-bridge` | 0 / 6.18.0-2 | 透明网桥 |
| `luci-app-zerotier` + `zerotier` | 26.292.28058~db1769b / 1.16.0-1 | 虚拟局域网 |
| `luci-app-natter2` + `natter2` | 1.0-r5 / 2.2.1-0 | NAT1 打洞 |
| `luci-app-upnp` + `miniupnpd-nftables` | 26.292.28058~db1769b / 2.3.9-3 | UPnP / NAT-PMP |
| `luci-app-frpc` + `frpc` | 26.292.28058~db1769b / 0.70.1-2 | 内网穿透客户端 |
| `luci-app-ddns-go` + `ddns-go` | 26.292.28058~db1769b / 6.17.7-2 | 动态 DNS |
| `luci-app-pppoe-relay` | 26.292.28058~db1769b | PPPoE 穿透 |
| `wireguard-tools` + `kmod-wireguard` | 1.0.20250521-1 / 6.18.55-1 | WireGuard |

### DNS / 安全

| 应用 | 版本 |
|---|---|
| `luci-app-adguardhome` + `adguardhome` | 1.8-11 / 0.107.79-1 |
| `luci-app-arpbind` | 26.292.28058~db1769b |

### 面板 / 工具

| 应用 | 版本 | 说明 |
|---|---|---|
| `luci-app-quickstart` | 0.12.10-r1 | 首页概览 |
| `luci-app-store` | 0.2.1-r1 | iStore 应用商店 |
| `luci-app-onliner` | 1.1-r5 | 在线用户 |
| `luci-app-ramfree` | 26.292.28058~db1769b | 内存释放 |
| `luci-app-turboacc` | 26.292.28058~db1769b | 流量分载 + BBR |
| `luci-app-wechatpush` | 3.6.12-r1 | 微信推送 |
| `luci-app-taskplan` | 3.0.0-r20260303 | 定时任务 |
| `luci-app-autoreboot` | 26.292.28058~db1769b | 定时重启 |
| `luci-app-bandix-plus` | 0.1.3-r1 | 流量统计 |
| `luci-app-wrtbwmon` | 2.0.13-r1 | 带宽监控 |
| `luci-app-nlbwmon` | 26.292.28058~db1769b | 流量记账 |
| `luci-app-beardropper` | 1.1-r20200522 | 广告拦截 |
| `luci-app-ttyd` + `ttyd` | 26.292.28058~db1769b / 1.6.3-3 | Web 终端 |
| `luci-app-oui` | 1.0.9-r1 | OUI 数据库 |
| `luci-app-online-update` | 1.0.0-r1 | 固件在线更新（本仓库定制） |

### 基础组件

| 组件 | 版本 |
|---|---|
| `base-files` | 127-r8199-cbe28467f |
| `luci-base` / `luci-compat` | 26.292.28058~db1769b |
| `busybox` | 1.38.0-2 |
| `dnsmasq-full` | 2.93-1 |
| `firewall4` | 2024-12-18-18fc0ead-6 |
| `nftables-json` | 1.1.6-6 |
| `iptables` | 1.8.7-2 |
| `dropbear` | 2026.94-1 |
| `uhttpd` | 2025-10-03-ebb92e6b-1 |
| `netifd` | 2025-05-23-7901e66c-1 |
| `odhcpd-ipv6only` | 2026-06-28-68f38269-1 |
| `curl` | 8.15.0-1 |
| `ca-bundle` | 20260601-1 |
| `bash` | 5.2.15-1 |
| `jq` | 1.8.1-2 |
| `ip-full` | 6.18.0-2 |
| `ipset` | 7.24-1 |
| `e2fsprogs` | 1.47.4-1 |
| `fstools` | 2026-07-25-2aa16407-1 |
| `block-mount` | 2026-07-25-2aa16407-1 |
| `grub2` / `grub2-efi` | 2.12-6 |
| `open-vm-tools` | 12.0.0-1 |
| `lm-sensors` | 3.6.0-1 |
| `ethtool` | 7.1-1 |

### 内核模块（关键项）

| 模块 | 版本 | 用途 |
|---|---|---|
| `kmod-vmxnet3` | 6.18.55-1 | ESXi 网卡 |
| `kmod-e1000e` | 6.18.55-1 | Intel 千兆 |
| `kmod-igb` / `kmod-igbvf` | 6.18.55-1 | Intel 千兆 / VF |
| `kmod-wireguard` | 6.18.55-1 | WireGuard |
| `kmod-nft-bridge` | 6.18.55-1 | 透明网桥 |
| `kmod-tun` | 6.18.55-1 | TUN/TAP |
| `kmod-nf-nathelper` / `-extra` | 6.18.55-1 | NAT 穿透（FTP/SIP/IRC） |

> 完整的 574 个包见 [`manifest/openwrt-x86-64-generic.manifest`](manifest/openwrt-x86-64-generic.manifest)，或固件内 `opkg list-installed`。

### 驱动支持

| 场景 | 控制器 | 说明 |
|---|---|---|
| ESXi 磁盘 | IDE / SATA-AHCI | `CONFIG_ATA=y`、`CONFIG_SATA_AHCI=y` |
| ESXi 磁盘 | PVSCSI | `CONFIG_VMWARE_PVSCSI=y` |
| ESXi 网卡 | vmxnet3 | `kmod-vmxnet3` |
| 物理机磁盘 | ATA / AHCI / SCSI | `CONFIG_BLK_DEV_SD=y` |
| 物理机网卡 | e1000e / igb / virtio | 内置 |

> **注意**：LSI Logic 控制器不可用（`CONFIG_SCSI_MPTSPI` 未启用）。ESXi 上用 PVSCSI 或 IDE。

---

## 相对默认 LEDE 的改动

`patches/0001-target-packages.patch` 从 `DEFAULT_PACKAGES.router` 中移除：

- `ddns-scripts_aliyun`、`ddns-scripts_dnspod`、`luci-app-ddns`（改用 `ddns-go`）
- `luci-app-filetransfer`、`luci-app-vsftpd`（改用 `iStore` / `quickstart`）
- `luci-app-vlmcsd`

`seed.config` 另外新增 WireGuard 全套包、`open-vm-tools` 及上述定制应用。

### 本项目自带的修复

| 补丁 | 内容 |
|---|---|
| `0002-console-login-auth.patch` | 启用控制台登录认证（`ttylogin=1` + root 密码哈希） |
| `0003-fix-root-shadow.patch` | 开机自检：修复空密码与字段数不足的 shadow 条目 |
| `0004-fixed-login-failopen.patch` | `login.sh` 由 fail-open 改 fail-closed（早期启动路径） |
| `0005-mwan3-track-ips.patch` | mwan3 探测目标替换 + 仅在状态翻转时记录日志 |
| `0006-login-always-auth.patch` | `login.sh` 不再读取 `ttylogin`，控制台无条件要求密码 |
| `0007-mwan3-domestic-targets.patch` | mwan3 国内探测目标 + `reliability` 超过目标数时自动补全 |

---

## 仓库内容

| 路径 | 说明 |
|---|---|
| `seed.config` | 构建使用的完整 `.config`（`cp` 后 `make defconfig -j$(nproc)`） |
| `RELEASE_NOTES.md` | 当前版本完整变更说明与验证记录 |
| `patches/` | 对 LEDE 源码的全部改动 |
| `package/custom/` | 默认 feeds 之外所需的第三方插件源码 |
| `manifest/` | 最终固件的软件包清单 |
| `scripts/build.sh` | 构建脚本（下载 + 编译，失败自动 `-j1 V=s` 重试） |
| `scripts/gexec.sh` | ESXi guest 执行封装（凭据走环境变量，自动重试瞬时故障） |

---

## 复现构建

```sh
git clone https://github.com/coolsnowwolf/lede.git
cd lede

# 引入第三方插件
git clone https://github.com/animegasan/luci-app-quickstart package/custom/luci-app-quickstart
git clone https://github.com/timsaya/luci-app-bandix-plus package/custom/luci-app-bandix-plus
git clone https://github.com/timsaya/openwrt-bandix-plus package/custom/openwrt-bandix-plus
git clone https://github.com/NateLol/luci-app-beardropper package/custom/luci-app-beardropper
git clone https://github.com/haiibo/openwrt-packages package/custom/haiibo-packages
git clone https://github.com/istoreos/istore package/custom/istore

# 应用默认包裁剪与定制修复
git apply patches/0001-target-packages.patch
git apply patches/0002-console-login-auth.patch
git apply patches/0003-fix-root-shadow.patch
git apply patches/0004-fixed-login-failopen.patch
git apply patches/0006-login-always-auth.patch
# mwan3 补丁针对 feeds/packages，先 ./scripts/feeds update -a 再应用
git -C feeds/packages apply ../../patches/0005-mwan3-track-ips.patch
git -C feeds/packages apply ../../patches/0007-mwan3-domestic-targets.patch

./scripts/feeds update -a && ./scripts/feeds install -a
cp seed.config .config && make defconfig
make -j$(nproc) download && make -j$(nproc)
```

产物在 `bin/targets/x86/64/`。

---

## ESXi 导入

```sh
# BIOS 引导用 squashfs-combined.vmdk，EFI 引导用 squashfs-combined-efi.vmdk
qemu-img convert -f raw -O vmdk -o subformat=monolithicSparse,adapter_type=ide \
  openwrt-x86-64-generic-squashfs-combined.img openwrt.vmdk

govc datastore.upload -ds datastore1 openwrt.vmdk openwrt/openwrt.vmdk
# 控制器选 IDE 或 PVSCSI，网卡选 vmxnet3
```

物理机写盘：

```sh
gunzip -c openwrt-x86-64-generic-squashfs-combined.img.gz | dd of=/dev/sdX bs=4M conv=fsync
```

---

## 系统升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本固件内用 **系统 → 在线更新**（读取本仓库 Releases，SHA256 校验后交给 `sysupgrade`）。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

---

## 已知限制

- 在线更新仅支持本仓库，不提供任意 URL 源
- 在线更新的 SHA256 与固件同源，可防传输损坏与单文件替换；未加 GPG 签名，防不住整个 Release 被攻陷
- 代理工具互斥：passwall / ssr-plus / openclash 同时只能启用一个
- 硬件加速不可用（x86 无 NSS / HNAT / SFE），仅软件分载
- LSI Logic 磁盘控制器不可用（内核未启用 `CONFIG_SCSI_MPTSPI`）
- mwan3 探测目标的可达性存在地区与运营商差异。若日志出现 `failed`，换成你能 ping 通的目标，并确保 `reliability` 不超过目标数量
- `ttylogin=0`（免密控制台）在本固件失效，属刻意取舍

---

## 许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
