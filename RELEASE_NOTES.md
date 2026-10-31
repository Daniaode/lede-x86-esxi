# v16 — 修复在线升级无法启动、新增下载进度与 GitHub 代理

**此版本取代全部历史版本。**

版本标识：`r8201-0185dc581`，baked tag `v16-20261031`，内核 `6.18.58`，575 包。

> 升级到本版后 `check` 会显示「已是最新」。这是正确行为：镜像自称 v16，而线上最新仍为 v15。

---

## 一、核心修复：点「开始下载」毫无反应

### 现象

在线升级页点「开始下载」后，页面转圈、刷新，然后什么都没发生。任务状态永远是空闲，下载从未开始。

### 根因

rpcd 的 ucode 白名单漏了一个动词。`root/usr/share/rpcd/ucode/luci.online-update` 的 `ALLOWED` 表里只有：

```
status, check, jobstatus, apply, cleanup, download, ignore, unignore
```

而前端 `handleDownload` 调用的是 `run('start')` —— `start` 不在表里。

后端 `/usr/sbin/online-update` 里 `cmd_start` 是存在的，`case` 分支也有，纯粹被 rpcd 层挡住。

实机直接调用可复现：

```
$ ubus call luci.online-update exec '{"command":"start","args":[]}'
{ "stdout": "", "stderr": "command not allowed", "code": 1 }
```

失败链条：

1. `run('start')` 返回 code=1
2. 前端 `L.resolveDefault(...)` 把错误吞成 `{}`
3. `.then()` 无条件 `window.location.reload()`
4. 重载后 `jobstatus` 仍是 `STATE=IDLE`
5. `startPolling` 判 `STATE !== 'RUNNING'`，立即 `poll.remove`

### 修复

`start: { args: 0 }` 加入白名单。同时新增 `tests/check-verbs.sh`，挂在 `Build/Compile`：前端每个 `run('x')` 必须在白名单内，否则编译失败。

```
check-verbs: OK
  frontend: apply check cleanup ignore jobstatus start status unignore
  allowed : apply check cleanup download ignore jobstatus start status unignore
```

（`download` 多出来是刻意的，供 detached worker 内部使用。）

---

## 二、下载进度、速度、剩余时间

### 实现

阶段分为 `CHECKING` / `DOWNLOADING` / `VERIFYING` / `VERIFIED` / `APPLYING` / `ERROR`。

进度字段与状态**分文件存放**：

- `STATE` 在 `/var/run/online-update-job`（`.tmp` + `mv` 整体写）
- 字节进度在 `/var/run/online-update-job.progress`
- `cmd_jobstatus` 合并输出两者

为什么分开：状态机整体写入才安全，若进度也写同一文件，每秒一次的进度更新会和状态切换的 `mv` 抢，可能丢掉 `STATE`。分开是从结构上消除竞争，而不是加锁。

前端进度条显示：百分比 · 已下载/总量 · 瞬时速度 · 剩余时间。轮询间隔 1 秒。

### 实测

```
t=2s   BYTES=0        /195130798  PCT=0  SPD=0
t=8s   BYTES=3078767  /195130798  PCT=1  SPD=1245184
t=14s  BYTES=11696787 /195130798  PCT=5  SPD=2179090
```

最终校验通过：`STATE=VERIFIED`，`size=195130798` 与发布资产字节数完全相等，SHA256 一致。

### 顺带修掉的 7 个缺陷

这些不在原始需求里，但会在 `start` 修好后立刻暴露：

1. **BusyBox 无 `stat`** — 本镜像不带 `stat`，`stat -c %s` 恒返回空，进度会永远是 0。改用 `wc -c`
2. **多 worker 共用输出文件** — 垂死 worker 的 `rm -f` 会 unlink 活 worker 正在写的文件，curl 继续往已删 inode 写，界面永远 0 字节。改为 `mkdir` 原子锁 + 按 PID 的 `.part` 文件，成功后才 `mv`
3. **`cmd_start` 无条件清状态** — 双击「开始」会抹掉正在运行的任务。改为持锁检测，忙时返回 `RESULT=busy`
4. **抢锁失败的 worker 写 ERROR** — 会覆盖活任务的共享状态。改为不触碰状态直接退出
5. **`cmd_cleanup` 删活下载的锁和 `.part`** — 改为有活锁时拒绝
6. **`mv` 失败一律报 `RESULT=disk`** — 实际磁盘有 1.7GB 空闲，误导。改为带真实 stderr 的 `store`
7. **缺 `--connect-timeout`** — 代理握手卡住时 curl 默认等两分钟，界面停在 0% 无任何提示

第 7 条补充了 `--connect-timeout 20` 与 `--speed-limit 1024 --speed-time 120`。`--max-time 1800` 保持原值未动。

---

## 三、GitHub 下载代理

国内直连 GitHub 经常不可用。新增 UCI 配置：

```
option github_proxy ''
option proxy_preset 'ghfast'
```

预设：

| 通道 | 前缀 |
|---|---|
| direct | 空（直连） |
| gh-proxy | `https://gh-proxy.com/` |
| ghfast | `https://ghfast.top/` |
| hk-gh-proxy | `https://hk.gh-proxy.com/`（标注较慢） |
| custom | 用户自填 |

### 默认值为何是 ghfast

两个环境实测：

```
              构建机 172.16.99.13    虚机 172.16.99.110
直连           2.53 MB/s             rc=28 失败
ghfast.top     3.34 MB/s             PASS + SHA256 一致
gh-proxy.com   4.34 MB/s             PASS（约 11 分钟）
hk-gh-proxy    2.91 MB/s             0.09 MB/s 不可用
```

ghfast 是唯一**两边都可用**的通道。直连在虚机上直接失败，作为默认会让用户第一次点击就报错。

这个选择可逆：界面里随时改回 `direct`，不需要重刷。

### 安全边界

代理只作为**前缀**，不改任何鉴权逻辑：

- 仓库地址仍硬编码，绝不从用户输入取
- 资产名仍受 `ASSET_WHITELIST` 限制
- 代理前缀剥离后，剩下的部分必须仍是 `https://github.com/*/releases/download/*`，否则拒绝
- 拒绝含 `?` `#` `@` 空格的前缀，拒绝非 `https://`，拒绝嵌套 scheme
- SHA256 仍以 `RELEASE_SHA256SUMS` 为准，安装前再校验一次
- 全部走 HTTPS

实测代理完整性：经 gh-proxy 与 hk-gh-proxy 取到的 `RELEASE_SHA256SUMS` 与本地信任副本**逐字节一致**（`ca171ea5...`），说明代理未篡改内容。

---

## 四、修复镜像自报版本错误

### 问题

镜像是 v16，但 `root/etc/online-update-current` 里烤的仍是 `v15-r8202`。

### 后果（需要说准确）

`seq_of()` 只取版本号数字段，`remote_is_newer()` 判 `latest > current`：

```
seq_of("v15-r8202") = 15
seq_of("v16-r8300") = 16
16 > 15  →  TRUE
```

所以**能**检测到更新，不是「收不到」。真实问题是：

```
v16 发布 → 机器看到 16 > 15 → 提示更新
        → 用户下载 186MB
        → 刷完 tag 仍是 v15
        → 下次检查 16 > 15 → 又提示
        → 无限循环 + 白耗流量 + 界面版本号显示错误
```

只需改 tag 值。若误判成「比较逻辑有问题」去改 `remote_is_newer`，反而会把本来正确的代码改坏。

### 修复

- tag 改为 `v16-20261031`
- 新增 `tests/min-tag-seq`（内容 `16`）作为序号下限
- `check-manifest.sh` 增加两条断言：格式必须是 `v<digits>-<suffix>`，且序号不低于下限

拦截实测：

```
正常 v16-20261031   → check-manifest: OK                                  rc=0
改回 v15-r8202      → FAIL - baked tag seq 15 is below floor 16 (stale)   rc=1
格式错 r8202-v15    → FAIL - baked tag 'r8202-v15' is not v<digits>-<suffix>  rc=1
```

把「忘了抬版本号」从静默事故变成编译失败。

> **发布约束**：GitHub release 的 tag 序号必须 **≥** 镜像内的 baked tag 序号，否则用户升级后会被自己的镜像判为「有新版本」而陷入循环。因为 `seq_of` 只取第一个数字段，后缀可以不同（`v16-20261031` 与 `v16-r8202` 都算 16）。

---

## 五、修复包内 5 个文件静默丢失

### 问题

`luci-app-online-update` 在重构时用 `rm -rf root` 清空后重建，漏掉了 5 个文件：

```
root/usr/share/rpcd/acl.d/luci-app-online-update.json
root/usr/share/luci/menu.d/luci-app-online-update.json
root/etc/init.d/online-update
root/etc/uci-defaults/90-online-update
htdocs/luci-static/resources/view/status/include/70_online_update.js
```

包仍然能编译、能安装，只是变成了 5 个文件的包而不是 10 个。

### 为什么当时没发现

在已升级的设备上**看不出来**：旧镜像已把 ACL 和 menu 烤进 squashfs，opkg 覆盖安装不会删除无主文件，所以 ubus 照常能调、侧边栏照常出现。这是**假通过**。

只有全新烧写才会暴露：没有 ACL 则 `ubus call` 直接检查失败，没有 `menu.d` 则侧边栏不出现该应用。

### 修复

从备份恢复，逐个判断是否需要同步修改：

| 文件 | 处理 |
|---|---|
| `acl.d/luci-app-online-update.json` | 原样（授权 `exec`，与改动无关） |
| `menu.d/luci-app-online-update.json` | 原样（菜单路径未变） |
| `etc/init.d/online-update` | 原样（只调 `check`，输出字段未变） |
| `etc/uci-defaults/90-online-update` | **修改**（补代理默认值 + 缺失键回填） |
| `70_online_update.js` | 原样（只读 `check` 字段，未变） |

`uci-defaults` 除了补两个默认值，还加了一段回填：

```sh
uci -q get online-update.main.proxy_preset >/dev/null 2>&1 || \
	uci -q set online-update.main.proxy_preset='ghfast'
```

原因：从旧版升级的系统会保留已有 `/etc/config/online-update`，`uci -q get main` 判断会短路，新的 batch 段根本不执行，界面就读到空值。

### 新增防线

`tests/check-manifest.sh`，挂在 `Build/Compile`：

- 10 个必须安装的路径逐个断言存在
- 3 个脚本断言可执行位
- ACL 与 menu 的 JSON 用 `jsonfilter` 验证可解析

```
check-manifest: OK (10 required paths present, executables set)
```

---

## 六、五阶段验证

### 阶段 1 — 编译

```
build rc=0 / DONE rc=0
manifest 575 包，luci-app-online-update - 1.1.0-r2
```

### 阶段 2 — 全新 VM

```
REVISION=R26.10.31  KERNEL=6.18.58

PASS  TAG_FILE=[v16-20261031]
PASS  status CURRENT=v16-20261031（code=0）
PASS  check RESULT=uptodate（正确：本地 16 > 线上 15 不成立）
PASS  LuCI 页面 http=200，引用 online-update 视图
PASS  5 个关键文件全部存在，opkg .list=10
PASS  PROXY_PRESET=ghfast  PROXY_EFFECTIVE=https://ghfast.top/
PASS  dnsmasq / nft 225 条 / dropbear up / logerr=0

SUMMARY pass=*** fail=0   RESULT=PASS
```

### 阶段 3 — 升级（路径 A：保留配置）

`R26.10.30` → `R26.10.31`：

```
REVISION   R26.10.30 → R26.10.31     已换镜像
TAG_FILE   v15-r8202（当时尚未修）    
preset     direct → direct           正确：保留用户配置，不覆盖为 ghfast
LAN/WAN    192.168.1.1 / 172.16.99.110 均恢复
```

升级后在新系统上再跑一次完整下载流程：

```
check  → RESULT=available  UPDATE_AVAILABLE=1
start  → {"stdout":"RESULT=started\nSTATE=CHECKING\n","code":0}   ← 曾是 command not allowed

进度采样：
t=2s   BYTES=0        PCT=0  SPD=0
t=8s   BYTES=3078767  PCT=1  SPD=1245184
t=14s  BYTES=11696787 PCT=5  SPD=2179090

中断后 cleanup → RESULT=ok  lock=free  job=none  workers=0  dir=[]
```

下载在 5% 主动中断，随后清理干净：无锁、无残留 worker、目录空。

### 阶段 4 — 恢复出厂（路径 B：`sysupgrade -n`）

```
REVISION=R26.10.31  TAG=[v16-20261031]

PASS  proxy_preset=ghfast（恢复出厂，与应用默认一致）
PASS  5 个关键文件全部存在，opkg .list=10
PASS  ubus code=0，CURRENT=v16-20261031
PASS  LuCI 页面 http=200
PASS  WAN ping ok，DNS 解析 ok，nft 225 条，dropbear up，logerr=0

SUMMARY pass=*** fail=0   RESULT=PASS
```

**两条路径的行为差异已实测确认**：

| 路径 | 命令 | `proxy_preset` |
|---|---|---|
| A 保留配置 | `sysupgrade` | `direct`（沿用旧值） |
| B 恢复出厂 | `sysupgrade -n` | `ghfast`（新镜像默认） |

### 阶段 5 — 清理

测试 VM 全部注销，历史残留目录（v10–v15、v10-probe）删除，设备端临时镜像与脚本清理，overlay 空间回收。

---

## 七、镜像

| 文件 | 大小 |
|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 185 MB |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 185 MB |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 186 MB |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 186 MB |
| `openwrt-x86-64-generic-ext4-combined.img.gz` | 234 MB |
| `openwrt-x86-64-generic-ext4-combined-efi.img.gz` | 234 MB |
| `openwrt-x86-64-generic.manifest` | 15 KB |

校验：`sha256sum -c RELEASE_SHA256SUMS`

---

## 八、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

---

## 九、已知限制

- 本版 `check` 显示「已是最新」属正常：镜像自称 v16，线上最新仍是 v15
- `hk-gh-proxy` 通道在虚拟化环境下极慢（实测 0.09 MB/s），界面已标注「较慢」
- 下载代理的完整性依赖 SHA256 校验；代理本身是第三方服务，若整个 Release 被攻陷则无法防御（未加 GPG 签名）
- 测试环境无运营商 IPv6 上游，IPv6 端到端连通性仍无法实测

---

## 十、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
