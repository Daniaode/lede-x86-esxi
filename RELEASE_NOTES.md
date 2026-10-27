# v13 — IPv6 修复改为源码级，并同步 LEDE 上游

**此版本取代全部历史版本。** 核心变化有两件：IPv6 修复从「运行时脚本」重构为「源码级修复」，以及同步上游（内核 6.18.55 → 6.18.58）。

版本标识：`r8201-0185dc581`，baked tag `v13-r8202`，内核 `6.18.58`，包数 575。

---

## 一、IPv6 修复改为源码级（重要）

v12 的 IPv6 修复采用运行时兜底：一个 `/etc/init.d/fix-ipv6` 开机守卫脚本 + 一个 `/etc/uci-defaults/mwan3-fix-ipv6` 迁移脚本。这套方案在升级验证时暴露了问题：`config_generate` 里的修复函数因为脚本早退守卫没执行到，导致升级后 `network.lan.ip6assign` 仍为空。

本轮按「在产生错误状态的源码路径上修复」的原则彻底重构，**删除了所有运行时脚本**，改为三处源码级修复：

### 1. `config_generate` 接口派生修复（每次启动执行）

PPPoE 场景下，`config_generate` 生成时把 `wan6.device` 绑定到裸网口 `eth1`，用户事后改成 PPPoE 后该绑定失效，DHCPv6 永远起不来。新增两个修复函数：

- `repair_pppoe_v6_sibling()`：遍历所有 pppoe 接口，把 `wan6.device` 从 `eth*` 改回 `@wan`，并确保 `wan.ipv6=1`（保留 IPV6CP，阻止 pppd 自建动态 `wan_6` 与静态 `wan6` 争抢）
- `repair_lan_ip6assign()`：LAN 为 static 且 `ip6assign` 缺失时补 `60`

**关键修正**：这两个函数最初放在脚本末尾，但 `config_generate` 第 6 行有早退守卫 `[ -s /etc/config/network -a -s /etc/config/system ] && exit 0`——升级后两个 conffile 都非空，脚本在开头就退出，修复函数根本没执行。本轮把函数定义和调用移到早退守卫**之前**，确保每次启动都执行。

### 2. `odhcpd.defaults` LAN 下发配置确保

`15_odhcpd` 原本只在「首次安装」分支写 `dhcp.lan.ra/dhcpv6/ra_slaac`，升级时走迁移分支直接 `exit 0`，导致升级后 LAN 不发 RA。重构为 `ensure_lan_ipv6_serving()` 辅助函数，**首次安装和迁移两个分支都调用**，只补缺失键。

### 3. `mwan3 common.sh` IPv6 接管门控

mwan3 原本在 wan6 未启用时仍会安装 `ip -6 rule ... unreachable` 规则，把全部 IPv6 黑洞。新增 `mwan3_has_v6_iface()`：**无任何已启用的 IPv6 接口时，`NO_IPV6=1`，跳过所有 IPv6 规则**，交给内核正常路由。启用 wan6 后重启 mwan3 即恢复接管。

### 删除的运行时脚本

- ~~`/etc/init.d/fix-ipv6`~~（开机守卫，已删除）
- ~~`/etc/uci-defaults/mwan3-fix-ipv6`~~（迁移脚本，已删除）

### 升级配置策略（需求 2）

- **覆盖**：`config_generate` 每次启动执行修复函数（S10，先于 network S20），升级后**单次重启即生效**，无需二次重启
- **保留**：修复函数只补缺失键，用户已显式设置的值（含 `disabled`）一律不动
- **迁移**：`mwan3-fix-track-ips`（conffile 迁移，一次性自删）处理 IPv4/IPv6 探测目标，只在目标列表等于旧出厂值时改写

---

## 二、同步 LEDE 上游

- 主树：`cbe28467f` → `0185dc581`（内核 6.18.55 → 6.18.58，qualcommax 内核镜像瘦身）
- feeds/packages：22 个提交（zerotier 1.16.2、golang 1.27.3、rust 1.99.1、mihomo/xray EIP93 加速等）
- feeds/luci：11 个提交

### 上游内核升级导致的补丁失配

内核 6.18.58 改变了 conntrack notifier API（从 chain-notifier 改为单一指针），导致 LEDE 自带的 `953-net-patch-linux-kernel-to-support-shortcut-fe.patch` 无法应用。本机 x86 配置不使用 shortcut-fe（turboacc 走 `xt_FLOWOFFLOAD`，内核 `CONFIG_SHORTCUT_FE` 未启用），已将该补丁从 `hack-6.18` 目录移除。上游后续修复此补丁后需重新评估。

---

## 三、五阶段验证（全部 PASS）

### 阶段 1 — QEMU 启动

```
FAIL_COUNT=0  RESULT=PASS
REVISION=R26.10.28  KERNEL=6.18.58  PKGCOUNT=575
DNS ok  53端口=dnsmasq  FW4=225行  LUCI ok  PANIC=0
SSH/控制台登录 PASS
```

### 阶段 2 — ESXi 新建机

```
eth0/eth1 vmxnet3 均 up  WAN 172.16.99.91/24  LAN 192.168.1.1/24
toolsOk，vmtoolsd running

CG_REPAIR=4（config_generate 修复函数在位）
MWAN3_GATE=2（common.sh IPv6 gate 在位）
RUNTIME_GUARD=0（运行时脚本已删除）
UNREACH6_GLOBAL=0（关键：无 IPv6 unreachable 黑洞）

LAN_IP6ASSIGN=60  RA=server  DHCPV6=server
```

### 阶段 3 — ESXi 升级（`R26.05.20` → `R26.10.28`）

首次验证发现 bug（`ip6assign` 未补），修复后复验通过：

```
升级前: LAN_IP6ASSIGN=[]  DHCP_LAN_RA=[]
升级后:
  LAN_IP6ASSIGN=[60]     ← 已修复
  DHCP_LAN_RA=[server]
  DHCP_LAN_DHCPV6=[server]
  DHCP_LAN_RA_SLAAC=[1]

WAN6_TRACK=2400:3200::1 / 2400:3200:baba::1 / 240c::6666
MIGRATE_IPV6=consumed  MIGRATE_TRACK=consumed
UNREACH6_GLOBAL=0  PANIC=0  LOG_ERRORS=0
```

### 阶段 4 — 恢复出厂

```
LAN_IP6ASSIGN=[60]  RA=server  DHCPV6=server  RA_SLAAC=[1]
BR_LAN_V6=1（LAN 从委托前缀派生出全局 IPv6）
TTYLOGIN=1（镜像默认）  UNREACH6_GLOBAL=0
MWAN3/DNSMASQ/LUCI running  LOG_ERRORS=0
```

### 阶段 5 — 清理

测试机全部 `unregister`，datastore 残留目录已删，临时 HTTP 服务已停。

---

## 四、已知限制

- 测试环境无运营商 IPv6 上游，未能做「拿到前缀 → 探测成功 → 外网 IPv6 通」的端到端实测；已验证配置正确性、迁移逻辑、策略标记机制
- mwan3 默认不管理 IPv6（wan6 enabled=0），单线场景 IPv6 走内核正常路由；多线用户需手动启用 wan6
- shortcut-fe 补丁因上游内核升级失配已移除（本机不使用 SFE）
- `ttylogin=0`（免密控制台）失效，属 v9 起刻意取舍
- 硬件加速不可用（x86 无 NSS/HNAT/SFE）
- 代理工具互斥：passwall / ssr-plus / openclash 同时只能启用一个

---

## 五、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

---

## 六、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
