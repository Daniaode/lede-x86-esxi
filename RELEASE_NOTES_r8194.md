# r8194-07cebbcf2 — 首个发布版

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) commit `07cebbcf2` 构建，面向 ESXi 7.0 虚拟机。

## 基础信息

| 项 | 值 |
|---|---|
| 版本号 | `r8194-07cebbcf2` |
| 上游提交 | `07cebbcf2` |
| 内核 | 6.18.55 |
| 目标平台 | x86/64 Generic |
| 根分区 | 2048 MiB |
| 引导方式 | GRUB（BIOS + EFI 双支持） |
| 防火墙后端 | firewall4 + nftables |
| 软件包总数 | 553 |
| 默认管理地址 | `192.168.1.1` |

## 下载文件说明

| 文件 | 大小 | 用途 |
|---|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 169 MB | **ESXi 推荐**。EFI 启动，直接导入虚拟机 |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 168 MB | Legacy BIOS 启动，老主板或 BIOS 模式虚拟机 |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 170 MB | 系统升级用（EFI 启动的系统） |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 170 MB | 系统升级用（BIOS 启动的系统） |
| `sha256sums` | — | 上述文件的 SHA256 校验值 |

VMDK 均为 `monolithicSparse`，虚拟容量 4325951 扇区（约 2.06 GiB），磁盘描述符 `ddb.adapterType = "ide"`。

**校验方式**

```sh
sha256sum -c sha256sums
```

## 本版包含的插件

### 代理 / 分流

- **passwall** — nftables 透明代理。内置 Xray、Shadowsocks Rust 客户端、ShadowsocksR Libev 客户端、Geoview、Haproxy、ChinaDNS-NG、V2ray Geodata
- **ssr-plus** — SS/SSR/V2Ray/Trojan 客户端。内置 Xray、Mihomo(Clash)、ChinaDNS-NG、ShadowsocksR Libev 客户端、GeoData
- **turboacc** — 软件 flow offloading + BBR 拥塞控制模块
- **WireGuard** — `kmod-wireguard` + `wireguard-tools` 1.0.20250521 + `luci-proto-wireguard`

### 路由 / 多拨 / 内网穿透

- **mwan3 + syncdial** — 多线多拨、负载均衡、故障切换
- **zerotier** — 异地组网
- **透明网桥** — `luci-app-bridge` + `ip-bridge` + `kmod-nft-bridge`，可把路由变成带防火墙的透明桥接设备
- **natter2** — FullCone NAT 打洞开放端口
- **frpc** — 内网穿透客户端
- **ddns-go** — 动态域名（支持阿里云、腾讯云、Cloudflare 等）
- **AdGuardHome** — DNS 去广告
- **UPnP** — miniupnpd-nftables

### 面板 / 运维工具

- **quickstart** — 首页向导面板
- **iStore** — 应用商店（`luci-app-store` + `taskd`）
- **onliner** — 在线设备列表
- **ramfree** — 内存释放
- **wechatpush** — 微信推送通知
- **ttyd** — 网页终端
- **wrtbwmon** — 流量统计
- **bandix-plus** — eBPF 网络流量监控
- **beardropper** — 登录爆破防护

以上插件均包含简体中文语言包。

### ESXi 兼容组件

- `open-vm-tools` — VMware 工具
- `kmod-vmxnet3` — VMXNET3 网卡驱动
- `kmod-e1000e` / `kmod-e1000` — Intel 网卡驱动
- `kmod-fs-ext4` / `kmod-fs-ntfs3` / `kmod-fs-exfat` / `kmod-fs-vfat` — 文件系统
- `mdadm` / `parted` / `lsblk` / `resize2fs` / `smartmontools` — 磁盘管理

## 相对上游默认配置的增删

本固件在 LEDE `DEFAULT_PACKAGES.router` 基础上做了如下调整（详见仓库 `patches/0001-target-packages.patch`）。

### 新增（相对上游默认）

| 软件包 | 说明 |
|---|---|
| `kmod-wireguard` | WireGuard 内核模块 |
| `wireguard-tools` | `wg` / `wg-quick` 命令行工具 |
| `luci-proto-wireguard` | LuCI 中创建 WireGuard 接口的协议支持 |
| `kmod-udptunnel4` / `kmod-udptunnel6` | WireGuard 依赖 |
| `kmod-crypto-lib-chacha20poly1305` | WireGuard 加密算法 |
| `kmod-crypto-lib-curve25519` | WireGuard 密钥交换 |
| `luci-app-store` + `taskd` + `luci-lib-taskd` + `luci-lib-xterm` | iStore 应用商店 |
| `quickstart` + `luci-app-quickstart` | 首页向导面板 |
| `luci-app-onliner` + `wrtbwmon` + `luci-app-wrtbwmon` | 在线设备与流量统计 |
| `luci-app-natter2` + `natter2` | FullCone NAT 打洞 |
| `luci-app-beardropper` | 登录爆破防护 |
| `luci-app-bandix-plus` + `bandix-plus` | eBPF 流量监控 |
| `luci-app-bridge` + `ip-bridge` + `kmod-nft-bridge` | 透明网桥 |
| `luci-app-passwall` | 主代理工具 |
| `luci-app-adguardhome` + `adguardhome` | DNS 去广告 |
| `luci-app-ddns-go` + `ddns-go` | 动态域名 |
| `luci-app-frpc` + `frpc` | 内网穿透 |
| `luci-app-zerotier` + `zerotier` | 异地组网 |
| `luci-app-mwan3` + `mwan3` + `luci-app-syncdial` | 多线多拨 |
| `luci-app-ramfree` | 内存释放 |
| `luci-app-wechatpush` | 微信推送 |
| `luci-app-ttyd` + `ttyd` | 网页终端 |
| `open-vm-tools` | VMware 集成 |

### 移除（相对上游默认）

| 软件包 | 移除原因 |
|---|---|
| `ddns-scripts` | 由功能更全的 `ddns-go` 替代 |
| `ddns-scripts_aliyun` | 同上 |
| `ddns-scripts_dnspod` | 同上 |
| `ddns-scripts-services` | 同上 |
| `luci-app-ddns` | 同上 |
| `luci-app-filetransfer` | 与 iStore / quickstart 的文件管理功能重叠 |
| `vsftpd` | 使用场景少，按需通过 iStore 安装 |
| `luci-app-vsftpd` | 同上 |
| `vlmcsd` | KMS 激活服务，与路由用途无关 |
| `luci-app-vlmcsd` | 同上 |

对应的 `zh-cn` 语言包一并移除，减少固件体积。

### 保留的上游默认项

`luci-app-upnp`、`luci-app-autoreboot`、`luci-app-arpbind`、`luci-app-ssr-plus`、`luci-app-accesscontrol`、`luci-app-nlbwmon`、`luci-app-turboacc`、`luci-app-wol`、`default-settings`、`luci`、IPv6 全套（`odhcp6c`、`odhcpd-ipv6only`、`ip6tables`、`luci-proto-ipv6`）等。

## ESXi 7.0 导入步骤

1. 把 `.vmdk` 上传到 ESXi 数据存储
2. 如经 scp 或 vSphere 上传，建议转换一次以确保格式兼容：
   ```sh
   vmkfstools -i /vmfs/volumes/datastore1/openwrt-x86-64-generic-squashfs-combined-efi.vmdk \
     /vmfs/volumes/datastore1/openwrt/openwrt.vmdk -d thin
   ```
3. 新建虚拟机 → 客户机操作系统选「其他 Linux (64 位)」→ 删除默认硬盘 → 添加现有虚拟磁盘
4. 固件类型选 **EFI**（使用 `-efi.vmdk` 时）
5. 磁盘控制器用 **SATA** 或 IDE
6. 网卡选 **VMXNET3**（驱动已内置）
7. 首次启动进 LuCI（`http://192.168.1.1`，root 无密码），立即修改 LAN 地址与 root 密码

## 首次启动建议

- 修改 LAN 网段：`uci set network.lan.ipaddr='192.168.x.1' && uci commit network && /etc/init.d/network restart`
- 设置 root 密码：`passwd`
- passwall 与 ssr-plus 功能重叠，建议只启用其中一个
- 需要 NAT1（FullCone）时，在 TurboAcc 界面手动开启（自动探测只识别 `xt_FULLCONENAT.ko`，本固件用的是 `nft_fullcone.ko`）

## 已知限制

- **硬件加速不可用**：x86 平台没有 NSS / MTK HNAT / SFE 等专用转发引擎，只能用软件 flow offloading。这是平台限制，非编译选项问题。
- **BBR 默认未启用**：模块已内置，需在 TurboAcc 界面手动把拥塞控制算法切到 BBR。
- **固件未经实机验证**：本次构建在 Debian 容器内完成，未在 ESXi 上实际启动。IPv6 拨号、加速吞吐、WireGuard 握手、各插件运行态均未实测。
- **透明网桥会重写网络配置**：启用时它会备份并替换 `/etc/config/network` 与 `firewall`，在 ESXi 单网卡环境下可能导致失联，建议先在多网口场景测试。

## 系统升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

加 `-n` 表示不保留配置。注意 `sysupgrade` 会整体写入磁盘并重写分区表。

## 许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归其原作者所有，沿用各自许可证；LEDE 主源码遵循 GPL-2.0。
