# LEDE x86-64 for ESXi 7.0

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) 的自用固件构建，面向 ESXi 7.0 虚拟机。

- 源码提交：`cbe28467f`
- 版本：`r8199-cbe28467f`
- 内核：`6.18.55`
- 目标：`x86/64` Generic
- 引导：GRUB（BIOS + EFI 双支持）
- 根分区：2048 MiB
- 防火墙后端：firewall4 + nftables
- 包总数：574
- 镜像压缩：gzip（`.img.gz`）
- AdGuardHome：默认关闭（`enabled=0`），dnsmasq 独占 53
- 控制台登录：需账号密码（默认 `root` / `password`，**请首启后立即修改**）
- 升级安全：`etc/init.d/fix-root-shadow` 开机自检，空密码 / 短字段数自动修复

各版本变更见 [Releases](../../releases)。最新为 **v10**：mwan3 探测目标改为国内节点（阿里/腾讯/百度/CNNIC），修复单目标 + `reliability=2` 导致接口永久 offline 的隐患，迁移脚本会把目标数不足的配置补全。已含 v9 的控制台认证强制与 v8 的日志抑制。

## 仓库内容

| 路径 | 说明 |
|---|---|
| `seed.config` | 构建使用的完整 `.config`（可直接 `cp` 后 `make defconfig -j$(nproc)`） |
| `RELEASE_NOTES.md` | 当前版本（v10）完整变更说明与验证记录 |
| `patches/0001-target-packages.patch` | 对 `include/target.mk` 的改动（裁剪默认包） |
| `patches/0002-console-login-auth.patch` | 启用控制台登录认证（`ttylogin=1` + root 密码哈希） |
| `patches/0003-fix-root-shadow.patch` | 开机自检：修复空密码与 <9 字段的 shadow 条目 |
| `patches/0004-fixed-login-failopen.patch` | login.sh 改为 fail-closed，修复控制台早期免密登录 |
| `patches/0005-mwan3-track-ips.patch` | mwan3 探测目标替换 + 仅在状态翻转时记录日志 + 旧配置迁移 |
| `patches/0006-login-always-auth.patch` | login.sh 不再读取 `ttylogin`，控制台无条件要求密码 |
| `patches/0007-mwan3-domestic-targets.patch` | mwan3 国内探测目标 + `reliability` 超过目标数时的自动补全 |
| `package/custom/` | 默认 feeds 之外所需的第三方插件源码 |
| `manifest/` | 最终固件的软件包清单，可用于核对 |
| `scripts/build.sh` | 完整构建脚本（下载 + 编译，失败自动 `-j1 V=s` 重试） |

## 包含的插件

**代理 / 分流**

- passwall（nftables 透明代理，含 Xray、Shadowsocks Rust、SSR Libev、Geoview、Haproxy、ChinaDNS-NG）
- ssr-plus（含 Xray、Mihomo、ChinaDNS-NG、GeoData）
- turboacc（flow offloading + BBR 模块）
- WireGuard（`kmod-wireguard` + `wireguard-tools` + `luci-proto-wireguard`）

**路由 / 多拨**

- mwan3 + syncdial（多线多拨）
- zerotier
- 透明网桥（`luci-app-bridge` + `ip-bridge` + `kmod-nft-bridge`）
- natter2（NAT1 打洞）
- frpc
- ddns-go
- AdGuardHome
- UPnP（miniupnpd-nftables）

**面板 / 工具**

- quickstart
- iStore（luci-app-store + taskd）
- onliner、ramfree、wechatpush、ttyd、wrtbwmon、bandix-plus、beardropper

全部带简体中文语言包。

## 相对默认 LEDE 的改动

`patches/0001-target-packages.patch` 从 `DEFAULT_PACKAGES.router` 中移除：

- `ddns-scripts_aliyun`
- `ddns-scripts_dnspod`
- `luci-app-ddns`
- `luci-app-filetransfer`
- `luci-app-vsftpd`
- `luci-app-vlmcsd`

改用 `ddns-go` 承担动态 DNS，`iStore` / `quickstart` 承担文件与存储管理。

`seed.config` 另外新增了 WireGuard 全套包。

## 复现构建

```sh
git clone https://github.com/coolsnowwolf/lede.git
cd lede
git checkout 07cebbcf2

# 引入第三方插件
mkdir -p package/custom
cp -r /path/to/this/repo/package/custom/* package/custom/

# 应用默认包裁剪
git apply /path/to/this/repo/patches/0001-target-packages.patch

# 配置
cp /path/to/this/repo/seed.config .config
make defconfig

# 编译
make download -j8
make -j$(nproc)
```

产物位于 `bin/targets/x86/64/`。开启 `CONFIG_TARGET_IMAGES_GZIP=y` 后会同时产出 `.img.gz`。

> **注意**：`package/custom/fakehttp/Makefile` 锁定 `killadm/FakeHTTP` 的 `59977c07` 提交。该仓库是 `MikeWang000000/FakeHTTP` 的 fork，领先上游 24 个提交，含内存安全、协议解析加固、防火墙规则原子安装等修复。

## ESXi 7.0 导入

1. 将 `.vmdk` 传到数据存储
2. 如经上传/复制，转换一次确保兼容：
   ```sh
   vmkfstools -i /vmfs/volumes/datastore1/openwrt.vmdk \
     /vmfs/volumes/datastore1/openwrt/openwrt.vmdk -d thin
   ```
3. 新建虚拟机 → 客户机系统选「其他 Linux (64 位)」→ 删除默认硬盘 → 添加现有虚拟磁盘
4. 固件类型选 **EFI**（使用 `-efi.vmdk` 时）
5. 磁盘控制器用 **SATA** 或 IDE
6. 网卡选 **VMXNET3**（`kmod-vmxnet3` 已内置）
7. 首次启动后进 LuCI（`192.168.1.1`）修改 LAN 地址与 root 密码

## 系统升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

加 `-n` 表示不保留配置。`sysupgrade` 会整体写入磁盘并重写分区表。

## 已知限制

- 硬件加速不可用：x86 平台没有 NSS / MTK HNAT / SFE 等专用转发引擎，只能使用软件 flow offloading。
- FullCone NAT 需在 TurboAcc 界面手动开启（自动探测只识别 `xt_FULLCONENAT.ko`，本固件使用 `nft_fullcone.ko`）。
- passwall 与 ssr-plus 功能重叠，建议实际使用时只启用一个。
- 固件已在 ESXi 6.7.0 实机完成新装 + sysupgrade 双向验证：GRUB 引导、内核 6.18.55、双 vmxnet3 网口、open-vm-tools、root 登录（正确密码通过 / 错误密码拒绝）、dropbear 22 LISTEN 均已实测通过。
- IPv6 拨号、加速吞吐、WireGuard 握手、各代理插件运行态仍未实测。

## 许可

构建脚本与配置按 MIT 提供。`package/custom/` 下各插件版权归其原作者所有，沿用各自许可证；主源码遵循 LEDE 的 GPL-2.0。
