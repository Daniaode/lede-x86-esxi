# v15 — 修复 ddns-go 等包升级后丢失配置，并加入 kiddin9 更新源

**此版本取代全部历史版本。** 两件事：为三个包补上 `keep.d` 持久化声明，以及在固件内加入 kiddin9 社区源。

版本标识：`r8201-0185dc581`，baked tag `v15-r8202`，内核 `6.18.58`，包数 575。

---

## 一、修复：ddns-go 配置升级后丢失

### 问题

在线升级后，ddns-go 的「服务开关」还在，但**所有 DDNS 任务（域名、解析记录、API Token）全部消失**，需要重新添加。

### 根因

ddns-go 的配置分成两半：

| 文件 | 内容 | 升级后 |
|---|---|---|
| `/etc/config/ddns-go` | UCI 外壳：`enabled`、`listen`、`ttl` | ✅ 保留 |
| `/etc/ddns-go/config.yaml` | **真实配置**：域名、账号、Token | ❌ 丢失 |

UCI 文件能保留，是因为 `base-files` 的 `keep.d` 里有 `/etc/config/` 这条**整目录**规则，与包本身无关。

而 YAML 会丢，是因为 `ddns-go` 包：
- 没有 `conffiles` 声明
- 没有 `keep.d` 文件
- `/etc/sysupgrade.conf` 里也没有

三处都没有，`sysupgrade -l` 就不会收录它。

### 修复

在源码层为三个包补上 `keep.d` 声明（不是运行时脚本）：

| 文件 | 内容 |
|---|---|
| `/lib/upgrade/keep.d/ddns-go` | `/etc/ddns-go/` |
| `/lib/upgrade/keep.d/smartdns` | `/etc/smartdns/` |
| `/lib/upgrade/keep.d/taskplan` | `/etc/taskplan/` |

`ddns-go` 与 `smartdns` 是 feed 包，直接改会被 `feeds update` 还原，因此放进 `package/base-files/files/lib/upgrade/`（由 base-files 的 `$(CP) ./files/*` 整体安装）。`taskplan` 是自有包，放进它自己的 `root/` 树。

顺带修复了同类的 `smartdns`（自定义规则在 `/etc/smartdns/custom.conf`、`conf.d/`）与 `taskplan`（脚本在 `/etc/taskplan/`），这两个也有同样的丢失风险。

### ⚠️ 重要限制：本次升级仍会丢一次

`sysupgrade` 的备份清单由**正在运行的旧系统**生成：

```sh
# /sbin/sysupgrade
sysupgrade_init_conffiles="build_list_of_backup_config_files"
# → list_static_conffiles 读 /etc/sysupgrade.conf 和 /lib/upgrade/keep.d/*
```

新镜像里的 `keep.d` 无法追溯影响这次升级。

实测证据：

| 场景 | 结果 |
|---|---|
| v14（无 keep.d）→ v15，升级前种下 ddns 配置 | **GONE**（丢失） |
| v15（有 keep.d）→ v15 同版本重刷，种下同一份配置 | **PRESENT**，SHA256 完全一致 |

也就是说：**v15 修复的是「从 v15 升级到以后版本」**。如果你从 v14 或更早的版本升级到 v15，ddns-go 配置**依然会丢一次**。

### 升级前请手动备份

```sh
# 升级到 v15 之前，在旧固件上执行
tar czf /tmp/ddns-backup.tar.gz /etc/ddns-go/ /etc/smartdns/ /etc/taskplan/ 2>/dev/null
```

升级完成后解压回去即可。从 v15 开始的后续升级不再需要此步骤。

---

## 二、新增：kiddin9 社区更新源

固件内加入：

```
src/gz kiddin9 https://dl.openwrt.ai/latest/packages/x86_64/kiddin9
```

该源可用性已验证（HTTP 200，1163 个包）。

### 为什么用独立文件而不是追加到 distfeeds.conf

`/etc/opkg/distfeeds.conf` 每次构建时由 `FeedSourcesAppendOPKG` 重新生成，追加的行会被静默丢弃。改为独立文件 `/etc/opkg/kiddin9.conf`。

opkg 会读取 `/etc/opkg/` 下任意 `*.conf`——这一点在真机上实测确认过（列表成功拉取并缓存到 `/var/opkg-lists/kiddin9`，145 KB）。

### 签名说明

该源不由本项目的构建密钥签名。若镜像保留了 `option check_signature`（默认保留），从该源安装包需要 `--force-signature`：

```sh
opkg install --force-signature <package>
```

---

## 三、五阶段验证

### 阶段 1 — QEMU

```
FAIL_COUNT=0  RESULT=PASS
REVISION=R26.10.30  KERNEL=6.18.58  PKGCOUNT=575
DNS ok  53=dnsmasq  FW4=225  LUCI ok  PANIC=0
```

### 阶段 2 — ESXi 新建机

```
TAG=v15-r8202  PANIC=0
eth0/eth1 vmxnet3 均 up  WAN 172.16.99.53/24  LAN 192.168.1.1/24

KEEPD_ddns-go=OK [/etc/ddns-go/]
KEEPD_smartdns=OK [/etc/smartdns/]
KEEPD_taskplan=OK [/etc/taskplan/]

ddns-go 造文件后 sysupgrade -l → DDNS_YAML=PRESERVED

kiddin9.conf 存在，feed 行正确
```

### 阶段 3 — 升级（`R26.10.29` → `R26.10.30`）

升级前在 v14 上种下 ddns-go 配置（188 字节，SHA `70d7e15c...`）：

```
旧系统 keep.d/ddns-go: missing（符合预期）
旧系统 sysupgrade -l:  NOT_PRESERVED
升级后:                DDNS_CONFIG=GONE   ← 限制所在
新系统 keep.d 三件套:  全部 OK
```

随后做同版本重刷（v15 → v15），种下另一份配置（191 字节，SHA `bf60d05e...`）：

```
sysupgrade -l 收录: /etc/ddns-go/config.yaml
重刷后:            DDNS_CONFIG=PRESENT
SHA 一致:          bf60d05ea81ba67406a6b32b4d6ee32706258036e62a26bc204ac5c8bd4205b7
keep.d 三件套:     ddns-go smartdns taskplan
```

这一组对照证明：`keep.d` 机制本身有效，局限只在于无法追溯保护安装它的那次升级。

### 阶段 4 — 恢复出厂

```
REVISION=R26.10.30  KERNEL=6.18.58  TAG=v15-r8202
KEEPD 三件套全部在位
DDNS_YAML=PRESERVED（造文件后测试）
kiddin9.conf 在位
DNSMASQ/LUCI running  LOG_ERRORS=0
```

### 阶段 5 — 清理

测试机全部 `unregister`，datastore 残留已删，临时 HTTP 服务已停。

---

## 四、镜像

| 文件 | 大小 |
|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 185 MB |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 184 MB |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 186 MB |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 186 MB |
| `openwrt-x86-64-generic-ext4-combined.img.gz` | 234 MB |
| `openwrt-x86-64-generic-ext4-combined-efi.img.gz` | 234 MB |
| `openwrt-x86-64-generic.manifest` | 15 KB |

校验：`sha256sum -c RELEASE_SHA256SUMS`

---

## 五、升级

```sh
# 从 v14 或更早升级前，先备份（见上文「重要限制」）
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

---

## 六、已知限制

- **v14 及更早版本升级到 v15 仍会丢一次 ddns-go/smartdns/taskplan 配置**，需手动备份恢复；从 v15 起不再需要
- kiddin9 源未由构建密钥签名，安装需 `--force-signature`
- 测试环境无运营商 IPv6 上游，IPv6 端到端连通性仍无法实测
- 在线更新的 SHA256 与固件同源，防不住整个 Release 被攻陷（未加 GPG 签名）

---

## 七、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
