# v2 / r8194-07cebbcf2 — 控制台认证 + FakeHTTP + PPPoE 穿透

相对 v1 的第二个构建版本。本版在 v1 基础上完成 5 项变更：启用控制台登录认证、新增 FakeHTTP、新增 PPPoE 穿透、新增 OpenClash 与 taskplan、移除 WOL 及连带依赖，并把全部 feeds 同步到上游最新。

## 基础信息

| 项 | v1 | v2 |
|---|---|---|
| 版本号 | `r8194-07cebbcf2` | `r8194-07cebbcf2`（重新构建） |
| 上游提交 | `07cebbcf2` | `07cebbcf2`（未变） |
| 内核 | 6.18.55 | 6.18.55 |
| 目标平台 | x86/64 Generic | x86/64 Generic |
| 根分区 | 2048 MiB | 2048 MiB |
| 引导方式 | GRUB（BIOS + EFI） | GRUB（BIOS + EFI） |
| 防火墙后端 | firewall4 + nftables | firewall4 + nftables |
| 软件包总数 | 553 | **573** |
| 控制台登录 | 免密 | **需要账号密码** |

## 一、控制台登录认证（行为变更）

v1 直接从 vSphere / ESXi 控制台打开会落到免密 root shell。本版修复。

**根因**：`package/base-files/files/bin/config_generate` 中 `generate_static_system()` 把 `system.@system[-1].ttylogin` 硬编码为 `'0'`；同时 `/etc/shadow` 的 root 条目为空密码字段（`root:::0:...`）。`/usr/libexec/login.sh` 的逻辑是：`ttylogin != 1` 就直接 `exec /bin/ash --login`，因此根本不进认证流程。

**修改**（`patches/0002-console-login-auth.patch`）：

- `package/base-files/files/bin/config_generate` — `ttylogin` 由 `'0'` 改为 `'1'`
- `package/base-files/luci/bin/config_generate` — 同上（LuCI 变体）
- `package/base-files/files/etc/shadow` — root 条目写入密码哈希

**后果**：

- 串口 / VGA / ESXi 控制台首次登录需输入用户名 `root` 与密码
- 默认密码为 **`password`**（与上游 LEDE 的 `zzz-default-settings` 一致）
- **请首次登录后立刻执行 `passwd` 修改**，否则等同无防护

> 注意：这是编译期写死进固件的初始密码。若你后续用 `sysupgrade -n` 重置，密码会回到该默认值。

## 二、新增 FakeHTTP（0.9.18）

源码：<https://github.com/MikeWang000000/FakeHTTP>，tag `0.9.18`，commit `eda98bb4`。

用 NFQUEUE 把 TCP 连接的目的端口改写，使流量在 DPI 看来是 HTTP。适用于对抗端口封锁。

**新增软件包**：

| 包名 | 版本 | 说明 |
|---|---|---|
| `fakehttp` | 0.9.18-1 | 主程序，由上游源码交叉编译（非预编译二进制） |
| `luci-app-fakehttp` | 0.9.18-r1 | LuCI 配置界面 |
| `kmod-nfnetlink-queue` | 6.18.55-1 | NFQUEUE 内核支持 |
| `kmod-nft-queue` | 6.18.55-1 | nftables queue 支持 |
| `kmod-ipt-nfqueue` | 6.18.55-1 | iptables NFQUEUE 支持（兼容模式） |

`libmnl`、`libnfnetlink`、`libnetfilter-queue` 三个库此前已在基础系统中（由其它包带入），本版确认被 fakehttp 直接依赖。

**打包要点**：上游 Makefile 使用 `gcc` 硬编码与 `-lnetfilter_queue -lnfnetlink -lmnl`，本仓库的 `package/custom/fakehttp/Makefile` 通过 `PKG_SOURCE_PROTO:=git` 拉取上游源码，并向 `Build/Compile` 传入 `TARGET_CC` / `TARGET_CFLAGS` / `TARGET_LDFLAGS`，产物为 `build/fakehttp`。init 脚本、UCI 配置、日志轮转、定时重启等外壳文件沿用上游社区的 `luci-app-fakehttp` 工程。

**默认配置**：`enabled='0'`（不启用）。需要时在 LuCI「网络 → FakeHTTP」开启，或 `uci set fakehttp.main.enabled='1'`。

## 三、新增 PPPoE 穿透（PPPoE Relay）

用于 ESXi 里把 PPPoE 拨号请求从 LAN 透传到上游，让内网设备自行拨号。

| 包名 | 版本 | 说明 |
|---|---|---|
| `luci-app-pppoe-relay` | 26.292.28058 | LuCI 界面 |
| `rp-pppoe-relay` | 4.0-1 | PPPoE Relay 守护进程 |
| `rp-pppoe-common` | 4.0-1 | 共享文件 |

这三个包此前就在 luci / packages feeds 中，只是未选入。本版加入。

> 说明：这实现的是 **PPPoE Relay（透传）**。若你需要的是把本机做成 PPPoE 服务器，可另装 `luci-app-pppoe-server`（feeds 中同样可用，本版未选入）。

## 四、新增 OpenClash 与 taskplan

| 包名 | 版本 | 说明 |
|---|---|---|
| `luci-app-openclash` | 0.48.002 | Clash 客户端（自带内核管理） |
| `luci-app-taskplan` | 3.0.0-r20260303 | 定时任务 / 开机任务管理（sirpdboy） |
| `luci-i18n-pppoe-relay-zh-cn` | 26.292.28058 | 中文语言包 |
| `luci-i18n-taskplan-zh-cn` | 0 | 中文语言包 |

`luci-app-openclash` 连带引入 Ruby 运行时（Clash 的配置转换脚本需要）：

| 包名 | 版本 |
|---|---|
| `ruby` | 3.3.6-1 |
| `libruby3.3` | 3.3.6-1 |
| `ruby-yaml` | 3.3.6-1 |
| `ruby-bigdecimal` / `ruby-date` / `ruby-digest` / `ruby-enc` / `ruby-pstore` / `ruby-psych` / `ruby-stringio` | 3.3.6-1 |
| `libgmp10` | 6.3.0-2 |

这是本版体积增加的主要来源（squashfs vmdk 从 169 MB → 178 MB）。

> **冲突提示**：OpenClash、passwall、ssr-plus 三者都做透明代理，同时启用会互相抢 iptables/nftables 规则。**同一时间只启用一个**。

## 五、移除 WOL 及相关依赖

| 包名 | v1 版本 | 移除原因 |
|---|---|---|
| `luci-app-wol` | 26.292.28058 | 按需求移除 |
| `etherwake` | 1.09-5 | 仅被 `luci-app-wol` 依赖，无其它引用 |
| `luci-i18n-wol-zh-cn` | 26.292.28058 | 语言包，随之移除 |

已确认固件内无其它包依赖 `etherwake`。`kmod-usb-hid`、`kmod-button-hotplug` 等与唤醒无关的输入设备支持保持不变。

## 六、Feeds 同步到上游最新

全部 feeds 执行了 `./scripts/feeds update -a` 并重新 `install -a`。

| Feed | v1 | v2 |
|---|---|---|
| packages | `37992e6` | `6ca187c` |
| luci | `db1769b` | `d76b5e5` |
| routing | `2d0f967` | `2d0f967`（无更新） |
| telephony | `d3bcb15` | `d3bcb15`（无更新） |
| helloworld | `0d24da0` | `0d24da0`（无更新） |

**实际发生版本变化的软件包**（manifest 逐项比对所得）：

| 包名 | v1 | v2 |
|---|---|---|
| `luci-i18n-base-zh-cn` | `26.292.28058~db1769b` | `26.292.66897~f017a87` |
| `luci-mod-network` | `26.292.28058~db1769b` | `26.292.66897~f017a87` |
| `luci-mod-status` | `26.292.28058~db1769b` | `26.293.08594~76e7be1` |
| `kernel` | `6.18.55-1-4ee5a656…` | `6.18.55-1-47aa02d5…` |

内核版本号未变，但构建哈希变化（新增 NFQUEUE 相关模块，配置不同导致）。

> **范围说明**：本版同步的是 LEDE 维护的 5 个 feeds。上游内核与工具链（`target/linux`、`tools/`）仍固定在 commit `07cebbcf2`，未追新。若要让内核本身升级，需要 rebase 到更新的上游 commit，属于另一轮工作量，且存在插件兼容风险，本版未做。

## 完整增删清单

### 新增（23 项）

```
fakehttp - 0.9.18-1
kmod-ipt-nfqueue - 6.18.55-1
kmod-nfnetlink-queue - 6.18.55-1
kmod-nft-queue - 6.18.55-1
libgmp10 - 6.3.0-2
libruby3.3 - 3.3.6-1
luci-app-fakehttp - 0.9.18-r1
luci-app-openclash - 0.48.002
luci-app-pppoe-relay - 26.292.28058~db1769b
luci-app-taskplan - 3.0.0-r20260303
luci-i18n-pppoe-relay-zh-cn - 26.292.28058~db1769b
luci-i18n-taskplan-zh-cn - 0
rp-pppoe-common - 4.0-1
rp-pppoe-relay - 4.0-1
ruby - 3.3.6-1
ruby-bigdecimal - 3.3.6-1
ruby-date - 3.3.6-1
ruby-digest - 3.3.6-1
ruby-enc - 3.3.6-1
ruby-pstore - 3.3.6-1
ruby-psych - 3.3.6-1
ruby-stringio - 3.3.6-1
ruby-yaml - 3.3.6-1
```

### 移除（3 项）

```
etherwake - 1.09-5
luci-app-wol - 26.292.28058~db1769b
luci-i18n-wol-zh-cn - 26.292.28058~db1769b
```

### 版本变更（4 项）

见上节「Feeds 同步」表格。

### 保持不变的 v1 插件（全部 22 项）

`luci-app-passwall`、`luci-app-ssr-plus`、`luci-app-turboacc`、`luci-app-quickstart`、`luci-app-store`、`luci-app-onliner`、`luci-app-ramfree`、`luci-app-wechatpush`、`luci-app-adguardhome`、`luci-app-ddns-go`、`luci-app-frpc`、`luci-app-upnp`、`luci-app-bridge`、`luci-app-zerotier`、`luci-app-bandix-plus`、`luci-app-mwan3`、`luci-app-syncdial`、`luci-app-natter2`、`luci-app-beardropper`、`luci-app-ttyd`、`luci-app-wrtbwmon`、`luci-proto-wireguard`。

另有 v1 已移除项继续保持移除：`ddns-scripts` 系列、`vlmcsd`、`vsftpd`、`luci-app-filetransfer`。

## 下载文件

| 文件 | 大小 | 用途 |
|---|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 178 MB | **ESXi 推荐**，EFI 启动 |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 177 MB | Legacy BIOS 启动 |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 179 MB | 系统升级（EFI） |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 179 MB | 系统升级（BIOS） |
| `RELEASE_SHA256SUMS` | — | SHA256 校验值 |

校验：

```sh
sha256sum -c RELEASE_SHA256SUMS
```

`sha256sums` 已在构建目录内对全部 18 个产物验证通过。

## 从 v1 升级

**方式一：sysupgrade（保留配置）**

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

注意：

- 保留配置升级**不会**重置 root 密码，原有密码继续有效
- 若 v1 时期 root 无密码，升级后 `ttylogin=1` 会让控制台要求输入密码，但 shadow 里仍为空 → **可能无法登录**
- 因此从 v1 升级前，请先在 v1 里执行 `passwd` 设置密码，或改用方式二

**方式二：全新导入（推荐）**

用 v2 的 vmdk 重建虚拟机，配置手动迁移。这样能确保 `ttylogin=1` 与 shadow 哈希成对生效。

## ESXi 7.0 导入

1. 上传 `.vmdk` 到数据存储
2. 如经上传/复制，转换一次：
   ```sh
   vmkfstools -i /vmfs/volumes/datastore1/openwrt-x86-64-generic-squashfs-combined-efi.vmdk \
     /vmfs/volumes/datastore1/openwrt/openwrt.vmdk -d thin
   ```
3. 新建虚拟机 → 客户机系统「其他 Linux (64 位)」→ 删除默认硬盘 → 添加现有虚拟磁盘
4. 固件类型选 **EFI**（使用 `-efi.vmdk` 时）
5. 磁盘控制器 **SATA** 或 IDE
6. 网卡 **VMXNET3**
7. 首次启动：控制台输入 `root` / `password`，登录后立刻 `passwd` 改密
8. 进 LuCI（`http://192.168.1.1`）调整 LAN 地址

## 已知限制

- **默认密码是公开的**：`password` 是上游 LEDE 的通用值，必须首启后修改
- **未实机验证**：本次仍在 Debian 容器内交叉编译，未在 ESXi 启动。控制台登录流程、FakeHTTP 的 NFQUEUE 规则、PPPoE Relay 的上游协商、OpenClash 内核下载均未实测
- **代理工具冲突**：OpenClash / passwall / ssr-plus 只能启用一个
- **硬件加速不可用**：x86 无 NSS / HNAT / SFE 转发引擎，仅软件 flow offloading
- **FullCone NAT** 需在 TurboAcc 手动开启（固件用 `nft_fullcone.ko`，自动探测只认 `xt_FULLCONENAT.ko`）
- **FakeHTTP 默认关闭**：`fakehttp.main.enabled='0'`，需手动启用
- **透明网桥会重写网络配置**：启用时备份并替换 `/etc/config/network` 与 `firewall`，单网卡环境可能失联
- **feeds 未追到上游内核**：`target/linux`、`tools/` 仍固定 `07cebbcf2`

## 许可

构建脚本与配置以 MIT 发布。`package/custom/` 下各插件版权归原作者（FakeHTTP 为 GPL-3.0-or-later，taskplan 为 GPL-2.0，其余见各自目录），LEDE 主源码遵循 GPL-2.0。
