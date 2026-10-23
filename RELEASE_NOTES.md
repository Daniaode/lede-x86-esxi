# v7 — 在线更新功能 + 控制台登录漏洞修复

**此版本取代全部历史版本。** 除新增在线更新能力外，还修复了一个**安全缺陷**：控制台在早期启动阶段可免密进入 root shell。

---

## 一、新增：固件在线更新

在路由器上直接检查并安装新固件，无需手动下载刷写。

### 功能

- **版本检测**：读取 GitHub Releases API，与本机构建时烧入的版本号比对
- **三种选择**：在线更新 / 自行下载 / 不再提示
- **按版本忽略**：忽略 v7 不代表不想知道 v8，总开关另设
- **手动检查**：`系统 → 在线更新`，忽略后随时可恢复提示
- **自动检查**：开机 60 秒后首查，此后每 24 小时（可配置）

### 界面

- 概览页顶部横幅（仅在有新版且未忽略时显示）
- 独立菜单 `系统 → 在线更新`：当前/最新版本、检查按钮、间隔设置、忽略列表

### 安全

| 措施 | 实现 |
|---|---|
| 来源固定 | 仓库地址硬编码，无任何 URL 参数入口 |
| 文件名白名单 | 只接受 `openwrt-x86-64-generic-squashfs-combined*.img.gz` |
| URL 校验 | 必须是 `github.com/*/releases/download/*` |
| SHA256 | 与同一 Release 的 `RELEASE_SHA256SUMS` 比对，不符即删文件中止 |
| 二次校验 | sysupgrade 前再次计算哈希，防止下载后被替换 |
| 显式确认 | 下载与安装分两步，均需用户点击；无静默自动刷写 |

### 已知边界

SHA256 与固件同源（同一 Release），可防传输损坏与单文件替换，防不住整个 Release 被攻陷。如需更强保证应加 GPG 签名，本版未做。

---

## 二、修复：控制台免密登录（安全缺陷）

### 现象

串口 / VGA 控制台在**开机早期**直接落入 root shell，不要求密码。

### 根因

`package/base-files/files/usr/libexec/login.sh` 原本是 **fail-open**：

```sh
[ "$(uci -q get system.@system[0].ttylogin)" = 1 ] || exec /bin/ash --login
```

`/etc/config/system` **不在镜像里**，由 `config_generate` 在 boot 服务中生成。`askfirst` 启动的 `login.sh` 早于该文件生成，`uci get` 返回空 → 条件不成立 → 直接 `exec /bin/ash --login`。

登录提示要等 `config_generate` 跑完才出现，但**第一个控制台已经是免密 shell**。

### 修复

改为 **fail-closed**：

```sh
[ "$(uci -q get system.@system[0].ttylogin)" = 0 ] && exec /bin/ash --login
exec /bin/login
```

未设置值时走 `/bin/login`，要求密码。只有显式 `ttylogin=0` 才免密。

### 为什么 v6 测试没发现

v6 的 ESXi 验证用的是 `govc guest.run`，走 VMware Tools 凭据通道，**根本不经过串口控制台**。本次改用 QEMU 串口直连才发现。

---

## 三、其它修复

### 包内脚本缺少可执行位

`luci-app-online-update` 的 `online-update`、init 脚本、ucode 对象权限为 `644`，导致无法执行。已改为 `755`。

### ucode RPC 参数取值错误

```ucode
const cmd = request.command;   // 永远 nil
```

rpcd 把声明的参数嵌套在 `request.args` 下，正确写法是 `request.args.command`。原实现导致**所有命令**（包括允许的 `status`）都返回 `command not allowed`。

---

## 四、验证结果

### QEMU（真实引导）

| 检查项 | 结果 |
|---|---|
| 控制台出现 `login:` 提示 | ✅ |
| 错误密码被拒 | ✅ `Login incorrect` |
| 正确密码进入 shell | ✅ |
| SSH `root:password` | ✅ |
| 内核 | ✅ `6.18.55` |
| shadow 字段数 | ✅ 9 |
| `ttylogin` | ✅ 1 |

### 在线更新功能

| 检查项 | 结果 |
|---|---|
| 版本比对 | ✅ `CURRENT=v7-r8200` vs `LATEST=v6-r8194` → `uptodate` |
| 忽略 / 恢复 | ✅ 往返正常 |
| SHA256 不符 | ✅ `hash changed since verify; refusing to flash` |
| 无 VERIFIED 作业时 apply | ✅ 拒绝 |
| RPC 允许命令 | ✅ `status` 正常返回 |
| RPC 非白名单命令 | ✅ `command not allowed` |
| RPC 注入标签 | ✅ `invalid tag` |
| RPC 参数个数 | ✅ `bad argument count` |
| 空间检查 | ✅ `/overlay` 1.8 GB 可用 |

### 上游同步

`07cebbcf2` → `cbe28467f`（5 个提交，与本项目改动零重叠）。本地 4 项改动与 5 个自定义包全部保留，合并后五项校验通过。

---

## 五、镜像

| 文件 | 大小 |
|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 185 MB |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 184 MB |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 186 MB |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 186 MB |

版本标识：`r8199-cbe28467f`，baked tag `v7-r8200`，包数 574。

校验：`sha256sum -c RELEASE_SHA256SUMS`

> `.img.gz` 的 `gzip -t` 会报 `trailing garbage ignored`（退出码 2）。那是 OpenWrt 追加的 usign 签名元数据，属正常结构。

---

## 六、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

或在本版固件内用 `系统 → 在线更新` 完成后续升级。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

---

## 七、已知限制

- 未在 ESXi 实机完成最终回归（QEMU 已实测通过）
- 硬件加速不可用（x86 无 NSS/HNAT/SFE）
- 代理工具互斥：OpenClash / passwall / ssr-plus 同时只能启用一个
- 在线更新仅支持本仓库，不提供任意源

---

## 八、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
