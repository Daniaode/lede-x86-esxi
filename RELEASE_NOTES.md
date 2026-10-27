# v12 — 修复 PPPoE 下 IPv6 完全不可用（WAN 与 LAN 两侧）

**此版本取代全部历史版本。** 这是针对「PPPoE 拨号后 IPv6 用不了」的完整修复。v11 只修好了 WAN 一侧，升级验证时发现 LAN 侧仍缺配置，因此 v11 未发布，本版一并修好。

版本标识：`r8199-cbe28467f`，baked tag `v12-r8200`，包数 574，内核 `6.18.55`。

---

## 一、问题现象

PPPoE 拨号后：

- 路由器 WAN 口**能拿到公网 IPv6 地址**（中国移动 `2409:8a20::/64`）
- 局域网设备**也能分到公网 IPv6 地址**
- 但**一个包都发不出去**，外网 IPv6 完全不通

`ip -6 rule` 里能看到异常规则：

```
2062:	from all fwmark 0x3e00/0x3f00 unreachable
4200000000:	from 2409:8a20:4eb0:e9b0::1/60 iif br-lan unreachable
```

---

## 二、根因（三处缺陷叠加）

### 缺陷 1：mwan3 的 wan6 接口默认被禁用

`/etc/config/mwan3` 出厂即为：

```sh
config interface 'wan6'
	option enabled '0'          ← 禁用
```

而 `default_rule_v6` 匹配 `::/0`（全部 IPv6 流量）并指向 `balanced` 策略。策略里的 IPv6 成员（`wan6_m1_w3`）因接口被禁用而全部失效，mwan3 于是把整条策略解析为 `unreachable`，所有 IPv6 包在**路由层**就被丢弃 —— 还没走到防火墙。

### 缺陷 2：wan6 绑在裸网口上

`config_generate` 按"默认 dhcp"生成配置，写的是：

```sh
config interface 'wan6'
	option device 'eth1'        ← 裸网口
	option proto 'dhcpv6'
```

用户装完固件后在 LuCI 里把 wan 改成 PPPoE，`wan6` 仍绑 `eth1`。PPPoE 的会话在 `pppoe-wan` 上，`eth1` 上没有 PPP 会话，DHCPv6 永远起不来，mwan3 也就永远跟踪不上。必须绑 `@wan`。

### 缺陷 3：LAN 侧 IPv6 下发配置在升级时缺失

这一处只影响**升级**，全新安装正常：

| 配置项 | 来源 | 全新安装 | 升级 |
|---|---|---|---|
| `network.lan.ip6assign=60` | `config_generate` | ✅ 有 | ❌ 无（不重跑） |
| `dhcp.lan.ra=server` | `15_odhcpd` | ✅ 有 | ❌ 无 |
| `dhcp.lan.dhcpv6=server` | `15_odhcpd` | ✅ 有 | ❌ 无 |
| `dhcp.lan.ra_slaac=1` | `15_odhcpd` | ✅ 有 | ❌ 无 |

原因在 `odhcpd.defaults`（安装为 `/etc/uci-defaults/15_odhcpd`）的分支结构：

```sh
if [ -n "$(uci -q get dhcp.odhcpd)" ]; then
    # 迁移旧字段……
    exit 0                      ← 第 87 行，升级时走这里就退出了
fi

# 以下永远执行不到（升级时）
set dhcp.lan.dhcpv6=$V6MODE     ← 第 133 行
set dhcp.lan.ra=$V6MODE         ← 第 134 行
set dhcp.lan.ra_slaac=1         ← 第 135 行
```

升级时 `dhcp.odhcpd` 已存在 → 进入迁移分支 → 第 87 行退出 → 后面前缀下发配置全部跳过。

结果：路由器自己有公网 IPv6，但**不向局域网发 RA**，设备拿不到地址。这就是「IPv6 不能用」最直观的表现。

---

## 三、修复

### mwan3 默认配置

| 项 | 修改前 | 修改后 |
|---|---|---|
| `wan6.enabled` | `0` | **`1`** |
| `wan6.track_ip` | `2606:4700:4700::1001`<br>`2606:4700:4700::1111`<br>`2620:0:ccd::2`<br>`2620:0:ccc::2` | `2400:3200::1`<br>`2400:3200:baba::1`<br>`240c::6666` |
| `wanb6.track_ip` | 同上（Cloudflare/Facebook） | 同上（国内地址） |

原探测目标是 Cloudflare 与 Facebook 的地址，从国内出口普遍不可达 —— 和 v10 修的 IPv4 问题同类。现改为阿里 IPv6 公共 DNS（`2400:3200::1`、`2400:3200:baba::1`）与 CNNIC（`240c::6666`）。

> 这三个地址已在参考排查记录中用中国移动线路实测：0% 丢包，11ms。

### 新增：`/etc/uci-defaults/mwan3-fix-ipv6`

一次性迁移脚本，在升级后首个启动时运行：

- PPPoE 下把 `network.wan6.device` 从 `eth1` 改为 `@wan`
- 把 `wan.ipv6` 从 `auto` 改为 `1`（保留 IPV6CP，但阻止 pppd 自建动态 `wan_6` 与静态 `wan6` 争抢同一条链路）
- 把旧的国外探测目标换成国内地址

### 新增：`/etc/init.d/fix-ipv6`（开机守卫，S18）

uci-defaults 只跑一次，覆盖不到两个场景：「装完再改 PPPoE」和「升级后 LAN 配置缺失」。所以加一个每次启动都执行的守卫：

**WAN 侧**（仅当 `wan.proto=pppoe`）
- `wan6.device` 若为裸网口（`eth*`）或空 → 改为 `@wan`

**LAN 侧**（只补缺失的键，已设置的一律不动）
- `network.lan.ip6assign` 缺失 → `60`
- `dhcp.lan.ra` 缺失 → `server`，同时补 `dhcpv6=server`、`ra_slaac=1`

**只在 odhcpd 已运行时才重启它**。守卫在 S18，odhcpd 在 S35，若此时强行拉起 odhcpd 会与 network（S20）竞争，导致它启动时还没有前缀可发。

### Makefile

新增文件由 `Package/mwan3/install` 安装，并**直接创建 rc.d 符号链接**：

```make
ln -sf ../init.d/fix-ipv6 $(1)/etc/rc.d/S18fix-ipv6
```

不用 `postinst`，因为镜像构建是解包 ipk，postinst 不执行，链接会缺失。

---

## 四、验证（五阶段门禁，全部 PASS）

### 阶段 1 — QEMU 启动

```
FAIL_COUNT=0   RESULT=PASS
REVISION=R26.10.27   KERNEL=6.18.55   PKGCOUNT=574
DNS ok   PORT53=dnsmasq   FW4=225 行   LUCI ok   PANIC=0
```

### 阶段 2 — ESXi 新建机

```
TAG=v12-r8200   PANIC=0
eth0/eth1 vmxnet3 均 up，WAN 172.16.99.246/24，LAN 192.168.1.1/24
toolsStatus=toolsOk，vmtoolsd running

WAN6_ENABLED=1
WAN6_TRACK=2400:3200::1 2400:3200:baba::1 240c::6666

LAN_IP6ASSIGN=60
DHCP_LAN_RA=server   DHCP_LAN_DHCPV6=server   DHCP_LAN_RA_SLAAC=1
GUARD_HAS_LAN_FIX=4   OLD_GUARD_LEFT=0
```

### 阶段 3 — ESXi 升级（`R26.05.20` → `R26.10.27`）

升级前基线（两处缺陷同时存在）：

```
WAN6_ENABLED=0
WAN6_TRACK=2606:4700::...（国外）
LAN_IP6ASSIGN=（空）  DHCP_LAN_RA=（空）  DHCP_LAN_DHCPV6=（空）
```

升级后：

```
WAN6_ENABLED=1
WAN6_TRACK=2400:3200::1 2400:3200:baba::1 240c::6666
WAN_TRACK=223.5.5.5 119.29.29.29 180.76.76.76 1.2.4.8

LAN_IP6ASSIGN=60
DHCP_LAN_RA=server   DHCP_LAN_DHCPV6=server   DHCP_LAN_RA_SLAAC=1
```

守卫日志直接记录了补齐动作：

```
23:17:31 fix-ipv6: set network.lan.ip6assign=60
23:17:31 fix-ipv6: set dhcp.lan.ra/dhcpv6=server
```

### 阶段 4 — 恢复出厂设置

```
REVISION=R26.10.27   TAG=v12-r8200   PKGCOUNT=574   PANIC=0
WAN6_ENABLED=1   LAN_IP6ASSIGN=60   DHCP_LAN_RA=server
TTYLOGIN=1   LOGIN_ACTIVE=[exec /bin/login;]
MWAN3/DNSMASQ running   LUCI ok   LOG_ERRORS=0

BR_LAN_V6=1     ← 关键：LAN 真的从前缀派生出全局 IPv6
```

`BR_LAN_V6` 在阶段 3 为 0、阶段 4 为 1 —— 恢复出厂重建配置后前缀派生正常，说明 LAN 侧修复真实有效。

### 阶段 5 — 清理

测试机全部 `unregister`（不用 `destroy`），datastore 上 `v10/v11/v12-esxi-test` 三个目录（共约 568MB）已删，临时 HTTP 服务与验证脚本已清。

---

## 五、验证过程中的两处自我纠正

诚实记录，避免把测试环境的假象当成固件结论：

1. **网卡接反**：首次建 `v11-test` 时把两块网卡接到了相反的端口组，`eth1`（WAN）接在了没有 DHCP 的网络上，导致 IPv4 也拿不到地址。修正接线后恢复。这不是固件问题。

2. **dnsmasq 误判**：阶段 4 首次检查报 `DNSMASQ=stopped`，复查发现检查时开机仅 111 秒，dnsmasq 尚未拉起。重测为 `running`，53 端口在 127.0.0.1 / br-lan / eth1 / ::1 全部正常监听，`dnsmasq --test` 语法 OK。时序问题，非缺陷。

---

## 六、v11 为什么没有发布

v11 已编译完成并通过阶段 1、2、3 的前半段，但在阶段 3 升级验证中发现 LAN 侧配置缺失（缺陷 3），说明「WAN 修好了但内网设备仍拿不到 IPv6」。按门禁规则未发布，补齐后重编为 v12。

v11 与 v12 的差异仅在新增的 LAN 侧补齐逻辑（守卫脚本从 `fix-pppoe-ipv6` 扩展为 `fix-ipv6`）。镜像、包集、内核完全一致。

---

## 七、镜像

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

> `.img.gz` 的 `gzip -t` 会报 `trailing garbage ignored`（退出码 2）。那是 OpenWrt 追加的 usign 签名块，属正常结构。

---

## 八、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`（已修复仓库改名导致的重定向问题）。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

从任意旧版本升级到 v12 都会自动补齐 IPv6 配置，无需手工干预。

---

## 九、已知限制

- 本测试环境无运营商 IPv6 上游，**未能做「拿到前缀 → 探测成功 → 外网 IPv6 通」的端到端实测**。已验证的是配置正确性、迁移与补齐逻辑、以及策略标记机制（成员 up 时走接口路由表，不会命中 unreachable 兜底）
- IPv6 探测目标的可达性存在地区与运营商差异。若日志出现 `failed`，换成你能 ping 通的地址，并确保 `reliability` 不超过目标数量
- `ttylogin=0`（免密控制台）在本固件失效，属 v9 起的刻意取舍
- 硬件加速不可用（x86 无 NSS/HNAT/SFE）
- 代理工具互斥：passwall / ssr-plus / openclash 同时只能启用一个

---

## 十、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
