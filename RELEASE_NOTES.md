# v6 — 修复 musl 下 shadow 8 字段导致的登录失败

**此版本取代 v1–v5 全部历史版本。旧版本的镜像存在登录缺陷，请勿使用。**

---

## 一、为什么发这一版

之前发布的 v2–v5 镜像里，控制台会出现 `Login:` 提示，但 `root` / `password` 输入后始终 `Login incorrect`。v5 曾尝试用开机脚本修复"空密码"场景，但**没有解决真正的根因**，而且 v5 镜像内的 `CANON` 常量本身仍是 8 字段——一旦触发反而会把登录再次写坏。

本次定位到真正的机制并验证通过。

---

## 二、根因

### 2.1 musl 的 shadow 解析比 glibc 严格

musl 1.2.5 的 `getspnam_r.c` 中 `__parsespent()` 在解析完 `sp_expire` 字段后要求：

```c
if (*s != ':') return -1;
```

OpenWrt 上游模板 `/etc/shadow` 用的是 **glibc 风格 8 字段**：

```
root:HASH:0:99999:7:::
```

musl 解析到 `sp_expire`（`7`）后面发现直接是行尾，没有冒号，**判定整行无效**：

- `getspnam()` 返回 `NULL`
- `login` 与 `dropbear` 都拿不到哈希
- 任何密码（包括正确密码、空密码）都 → `Login incorrect`

glibc 对这种短行是宽容的，所以上游模板一直没暴露问题——它在 glibc 环境下工作正常，只在 musl 目标上失效。

### 2.2 实证

用固件自身工具链编译的静态测试程序 `/root/sptest` 直接调用 musl 的解析逻辑：

| shadow 行 | 字段数 | `parsed` |
|---|---|---|
| `root:HASH:0:99999:7:::` | 8 | **0（失败）** |
| `root:HASH:0:99999:7::::` | 9 | **1（成功）** |

差别就是一个末尾冒号。

---

## 三、修复内容

### 修复 1：模板改为 9 字段

`package/base-files/files/etc/shadow` 每行补一个冒号：

```
root:$1$V4UetPzk$CYXluq4wUazHjmCDBCqXF.:0:99999:7::::
daemon:*:0:0:99999:7::::
ftp:*:0:0:99999:7::::
```

### 修复 2：开机脚本同时处理两种缺陷

`package/base-files/files/etc/init.d/fix-root-shadow`（`START=05`）：

```sh
CANON='root:$1$V4UetPzk$CYXluq4wUazHjmCDBCqXF.:0:99999:7::::'
```

判断逻辑：

| 检测到 | 动作 |
|---|---|
| root 密码字段为空 | 整行替换为 CANON（恢复默认哈希） |
| 字段数 < 9（如 v4 的 8 字段） | 整行替换为 CANON（规范化） |
| 字段数 ≥ 9 且有哈希 | 不动 |
| `*` / `!` 主动锁定 | 不动（尊重管理意图） |

**为什么整行替换**：`root:::` 与带哈希的条目字段数不同，若只改密码字段会残留多余冒号，产出畸形条目。整行输出保证与基准行逐字节一致。

**为什么覆盖 8 字段场景**：只处理空密码的话，从 v4（8 字段）升级上来的机器不会触发修复，仍然锁死。必须增加字段数检查。

---

## 四、验证结果

### 4.1 静态核验

从最终产物解包确认：

```
/etc/shadow                      → 9 字段 ✓
/etc/init.d/fix-root-shadow      → CANON 9 字段 ✓
/etc/rc.d/S05fix-root-shadow     → 已自动 enable ✓
包总数                            → 572
```

### 4.2 ESXi 实机验证（阶段 1：新装）

在 ESXi 6.7.0（172.16.99.1）上创建干净虚拟机：

| 项 | 配置 |
|---|---|
| 磁盘 | squashfs-combined.img → monolithicFlat VMDK，lsilogic |
| 虚拟机硬件版本 | 11（hw14 在此 ESXi 上 vmxnet3 无法分配 PCIe 槽位） |
| CPU / 内存 | 2 vCPU / 1024 MB |
| 网卡 | 双 vmxnet3（LAN: LEDE-TEST-INT，WAN: VM Network） |
| 固件 | BIOS |

**实测结果，全部通过：**

| 检查项 | 结果 |
|---|---|
| GRUB 引导 | ✅ |
| 内核启动 | ✅ `6.18.55` |
| 双网口 up | ✅ `br-lan 192.168.1.1` / `eth1 172.16.99.211` |
| open-vm-tools | ✅ `vmtoolsd RUNNING` |
| **`root:password` 登录** | ✅ **成功** |
| **`root:wrongpass` 登录** | ✅ **被拒绝** |
| shadow 字段数 | ✅ 9 |
| dropbear 22 LISTEN | ✅ `0.0.0.0:22` + `:::22` |
| `S05fix-root-shadow` | ✅ 已启用 |

### 4.3 ESXi 实机验证（阶段 2：升级）

在测试机 `lede-openwrt` 上执行：

1. 恢复快照 `20261022`（起始 uptime 3312891 秒）
2. `govc guest.upload` 推入 `squashfs-combined.img.gz`，**md5 校验一致**（`4fe85e69…`）
3. 同步执行 `sysupgrade -v /tmp/upgrade.img.gz`
4. 等待重启

**升级后实测结果，全部通过：**

| 检查项 | 结果 |
|---|---|
| uptime | ✅ **46 秒**（确认真正重启） |
| shadow | ✅ 保持 9 字段 |
| `root:password` 登录 | ✅ 成功 |
| `root:wrongpass` 登录 | ✅ 被拒绝 |
| dropbear 22 | ✅ LISTEN |
| `S05fix-root-shadow` | ✅ 仍启用 |
| rootfs | ✅ overlayfs |

---

## 五、镜像文件

| 文件 | 大小 | SHA256 |
|---|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 185 MB | `50e89a50…8dc2` |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 184 MB | `db03d04d…5bb` |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 186 MB | `6649b4c8…ad32` |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 186 MB | `f0171bc4…7f77` |

完整校验值见 `RELEASE_SHA256SUMS`：

```sh
sha256sum -c RELEASE_SHA256SUMS
```

> `gzip -t` 会报 `decompression OK, trailing garbage ignored` 并返回 2。这是 **OpenWrt 的 usign 签名元数据**追加在 gzip 流之后，属正常结构，不影响使用。

---

## 六、如何升级

**你当前卡在无法登录的旧版本**，两种方式：

**方式 A：全新导入（推荐）**

用本版 `.vmdk` 重建虚拟机，配置手动迁移。干净磁盘不触发保留逻辑，镜像内自带的 9 字段 shadow 直接生效。

**方式 B：sysupgrade**

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

即使你当前系统的 shadow 是 8 字段或空密码，本版的开机脚本会在首次启动时将其规范化为 9 字段。

若当前系统 SSH 已不可用，需通过 ESXi 控制台、挂载磁盘或单用户模式推入镜像。

---

## 七、登录凭据

- 用户名：`root`
- 密码：`password`

**首次登录后立即执行 `passwd` 修改。** `password` 是上游 LEDE 的公开默认值。

---

## 八、本版相对 v5 的变更

| 项 | v5 | v6 |
|---|---|---|
| shadow 字段数 | 8（缺陷） | **9** |
| `fix-root-shadow` CANON | 8 字段（缺陷） | **9 字段** |
| 短字段数自动修复 | 无 | **有** |
| ESXi 实机验证 | 未做 | **已完成（新装 + 升级）** |
| 包总数 | 572 | 572（未变） |
| 插件集合 | — | 未变更 |

本版是纯粹的登录缺陷修复，功能与插件集合与 v5 完全一致。

---

## 九、已知限制

- **默认密码公开**：`password` 必须首启后修改
- **代理工具互斥**：OpenClash / passwall / ssr-plus 只能同时启用一个
- **硬件加速不可用**：x86 无 NSS / HNAT / SFE 转发引擎，仅软件 flow offloading
- **FakeHTTP 默认关闭**：`fakehttp.main.enabled='0'`
- **升级保留 shadow 的行为未改**：仍然保留用户密码（这是正确的），只是现在会校验字段数

---

## 十、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者所有，LEDE 主源码遵循 GPL-2.0。
