# LEDE x86-64 for ESXi 7.0

基于 [coolsnowwolf/lede](https://github.com/coolsnowwolf/lede) 的自用固件构建，面向 ESXi 7.0 虚拟机。

- 源码提交：`07cebbcf2`
- 版本：`r8194-07cebbcf2`
- 内核：`6.18.55`
- 目标：`x86/64` Generic
- 引导：GRUB（BIOS + EFI 双支持）
- 根分区：2048 MiB
- 防火墙后端：firewall4 + nftables
- 包总数：572
- 镜像压缩：gzip（`.img.gz`）
- AdGuardHome：默认关闭（`enabled=0`），dnsmasq 独占 53
- 控制台登录：需账号密码（默认 `root` / `password`，**请首启后立即修改**）
- 升级安全：`etc/init.d/fix-root-shadow` 开机自检，空密码字段自动修复（v5+）

各版本变更见 [Releases](../../releases)。最新为 **v4**：AdGuardHome LuCI 替换为 rufengsuixing 版（支持 4 种重定向模式，默认关闭）、xray-core 升级至 26.10.17、chinadns-ng 升级至 2025.08.09、新增 Hysteria 2.13.0、移除 coremark/cfdisk。

## 仓库内容

| 路径 | 说明 |
|---|---|
| `seed.config` | 构建使用的完整 `.config`（可直接 `cp` 后 `make defconfig -j$(nproc)`） |
| `RELEASE_NOTES_v4.md` | v4 变更说明、AdGuardHome 替换细节、代理内核升级、完整软件包列表 |
| `RELEASE_NOTES_v3.md` | v3 变更说明、24 项 FakeHTTP 修复清单 |
| `patches/0001-target-packages.patch` | 对 `include/target.mk` 的改动（裁剪默认包） |
| `patches/0002-console-login-auth.patch` | 启用控制台登录认证（`ttylogin=1` + root 密码哈希） |
| `patches/0003-fix-root-shadow.patch` | 开机自检，修复 sysupgrade 保留空密码导致的登录锁死（v5+） |
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
- 固件已在 QEMU/KVM 中完成真实引导验证（内核、网络、服务、LuCI 均正常）；实体机 / ESXi 环境、IPv6 拨号、加速吞吐、WireGuard 握手仍未实测。
- QEMU 验证环境中 `firewall` 显示未运行，因单网卡全部划入 LAN、无 WAN 接口导致 fw4 提前退出；ESXi 双网口环境不受影响，首启后建议 `fw4 print` 确认。

## 许可

构建脚本与配置按 MIT 提供。`package/custom/` 下各插件版权归其原作者所有，沿用各自许可证；主源码遵循 LEDE 的 GPL-2.0。
