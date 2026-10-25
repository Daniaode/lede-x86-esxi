# v10 — mwan3 探测目标改为国内节点，并修复 reliability 失效

**此版本取代全部历史版本。** 针对 v9 实测反馈的两个问题：mwan3 日志仍在刷，以及 ttyd 的两条 `no route out` 日志。

版本标识：`r8199-cbe28467f`，baked tag `v10-r8200`，包数 574，内核 `6.18.55`。

---

## 一、mwan3：换成国内探测目标

### v9 的错误

v9 把目标换成了 `8.8.8.8` / `1.0.0.1` / `9.9.9.9` / `94.140.14.14`,理由是"国际可达"。但可达不等于稳定：这些目标从国内出口过去要跨若干跳,任何一跳抖动都会让单个目标短暂丢包,于是 `failed`/`recovered` 成对出现。日志确实比 v8 少了（v8 是每周期必写一行），但仍然不是"只在真实状态变化时写"。

### v10 的改动

`wan` / `wanb` 的探测目标改为：

| 目标 | 归属 |
|---|---|
| `223.5.5.5` | 阿里 AliDNS |
| `119.29.29.29` | 腾讯 DNSPod |
| `180.76.76.76` | 百度 BaiduDNS |
| `1.2.4.8` | CNNIC |

实测各 4 次 ping（国内出口）：

| 目标 | 结果 |
|---|---|
| `223.5.5.5` | ✅ 0% 丢包 |
| `223.6.6.6` | ✅ 0% 丢包 |
| `119.29.29.29` | ✅ 0% 丢包 |
| `180.76.76.76` | ✅ 0% 丢包 |
| `1.2.4.8` | ✅ 0% 丢包 |
| `114.114.114.114` | ❌ 不通 |
| `117.50.10.10` | ❌ 不通 |

`reliability` 保持 `2`（4 个目标里 2 个通过即判在线）。

---

## 二、mwan3：修复 `reliability` 大于目标数导致的永久 offline

### 这是一个比日志更严重的问题

现场反馈的配置是：

```
track_ip    = 223.5.5.5          (只有 1 个)
reliability = 2
```

mwan3 的判定规则是"至少 `reliability` 个探测目标在线，接口才算在线"。1 个目标永远凑不出 2 个，所以：

- 那唯一的探测本身是 `up`
- 但接口状态**永远**是 `offline`
- 日志因此反复输出 `failed` / `recovered`
- 而 `Current score: 10` 看起来"正常"，实际是死循环的副产品

### 实机复现

在 ESXi 测试机上植入该配置，连续采样 60 秒：

```
t=10s  online:0  offline:16  score:0  status:"offline"
t=20s  online:0  offline:26  score:0  status:"offline"
t=30s  online:0  offline:36  score:0  status:"offline"
t=40s  online:0  offline:46  score:0  status:"offline"
t=50s  online:0  offline:56  score:0  status:"offline"
t=60s  online:0  offline:66  score:0  status:"offline"
```

`offline` 计数单调递增，从未 online。同一时刻探测目标状态是 `"up"`。

### 修复

`/etc/uci-defaults/mwan3-fix-track-ips` 增加第三个处理分支：

```sh
rel=$(uci -q get "mwan3.$section.reliability")
if [ -n "$rel" ] && [ "$n" -lt "$rel" ]; then
    replace_list "$section"
fi
```

即：**目标数少于 `reliability` 时，直接补全为国内四目标**。这条不依赖"用户是否用了旧默认值"，因为这样的配置本身就是坏的，无论用户怎么来的。

### 升级验证（v9 → v10，ESXi 实机）

先植入坏配置，再升级：

```
升级前: track_ip=[223.5.5.5]  targets=1  reliability=2  → status=offline
升级后: track_ip=[223.5.5.5 119.29.29.29 180.76.76.76 1.2.4.8]
        targets=4  reliability=2  → status=online, offline:0, score:10
```

迁移脚本按 uci-defaults 约定执行后自动删除（`/etc/uci-defaults/` 已空）。

> 说明：开机后 `logread | grep mwan3-migrate` 初看为空，容易误判脚本没跑。核查后确认 conffile **确实被保留**——旧固件专有的 11 个选项（`initial_state`、`count`、`size`、`max_ttl`、`timeout`、`interval`、`down`、`up` 等）全部幸存，而新镜像默认配置只含 `enabled/track_ip/family/reliability`。既然 conffile 保留、`track_ip` 却已变更，且脚本单独运行时能正确改写并打日志，结论是迁移已执行、日志被 128 KB 环形缓冲区冲掉（开机 73 秒内已写 1251 行）。

单目标 + `reliability=2` 这个组合，如果你的设备上还留着，升级 v10 会自动被纠正。若想手改，注意 `reliability` 不要超过目标数量。

---

## 三、ttyd 的两条 `no route out` 日志

### 日志内容

```
ttyd[10893]: [wsicli|1|GET/h1/connectivitycheck.android.com/...]: lws_sort_dns: 142.251.46.78 has no route out
ttyd[10893]: [wsicli|1|GET/h1/connectivitycheck.android.com/...]: lws_sort_dns: 2607:f8b0:400a:803::200e has no route out
```

### 含义

`wsicli` 是 libwebsockets 的**出站客户端**标记，`GET /h1/connectivitycheck.android.com/` 是 libwebsockets 的代理式请求路径格式。也就是说，**有客户端把 ttyd 的 7681 端口当成 HTTP 代理在用**：ttyd 收到请求后去解析 `connectivitycheck.android.com`，拿到 IP 后尝试出站，失败并报 `no route out`。

- `142.251.46.78` 是 Google 的 IPv4
- `2607:f8b0:400a:803::200e` 是 Google 的 IPv6
- `connectivitycheck.android.com` 是 Android 的联网检测域名

IPv6 那条可以确定：本机 `ip -6 route show default` 返回 **0 条**，即没有 IPv6 默认路由，IPv6 目标确实无路可走。IPv4 那条实测 `ping 142.251.46.78` 不通（`8.8.8.8` 通），属于该 IP 在当前出口不可达。

### 性质

**不是故障，是误配置或探测噪声**，不影响路由与上网。两条都属 `daemon.notice` 级别，本就只是提示。

### 可能来源

1. 某台安卓设备把路由器的 **7681** 当成了代理端口（正确端口通常是 7890/7891/1080 之类），浏览器或系统代理设置填错
2. 某台设备把路由器 IP 直接填进了 HTTP 代理，端口写成了 7681
3. 安卓系统的 captive portal 探测走了代理

### 定位方法

在路由器上抓当时连到 7681 的客户端：

```sh
netstat -tn | grep :7681
```

本次检查时没有活动连接，说明是偶发。若想彻底确认，可在复现时抓包：

```sh
tcpdump -i br-lan -n 'tcp port 7681' -c 20
```

### 处理建议

不需要改固件。任选其一：

- 检查局域网内设备的代理设置，把端口从 7681 改成实际代理端口
- 若不用 ttyd，`/etc/config/ttyd` 里禁用或改端口
- 若只是嫌日志吵，把 ttyd 日志级别调低（ttyd 默认 `-d 7`）

本版**未改动 ttyd**，因为它是第三方客户端的误用，不是固件缺陷。伪装成"修好了"反而会掩盖真实的代理配置错误。

---

## 四、ESXi 7.0 实机验证（v10）

| 检查项 | 结果 |
|---|---|
| 平台 | VMware ESXi **6.7.0** build-15160134（此前记为 7.0，实测为 6.7） |
| 从 v9 升级 | ✅ `sysupgrade` 保留配置 |
| 升级后 tag | ✅ `v10-r8200` |
| 内核 / 包数 | ✅ `6.18.55` / 574 |
| LAN / WAN | ✅ `192.168.1.1/24` / `172.16.99.210/24` |
| LuCI | ✅ 可达 |
| mwan3 迁移 | ✅ 单目标被纠正为 4 目标，接口回到 online |
| 迁移脚本 | ✅ 已消费 |
| 控制台认证 | ✅ `login.sh` 有效代码仅 `exec /bin/login` |
| `ttylogin` | ✅ `1` |

### 测试方法备注

- `govc guest.run` 在调用返回时会回收该会话的子进程，`sysupgrade` 必须通过一次性 cron 启动
- `govc guest.run` 的 `sh -c 'cmd'` 会丢失 argv，需先用 `guest.upload` 传脚本再执行
- guest 内 `/tmp` 是 tmpfs，重启后脚本消失
- 该 ESXi 上 VMware Tools 的 `Boot time` 字段不随 guest 内重启刷新，需用 `/proc/uptime` 与 `/proc/stat` 的 `btime` 判断

---

## 五、镜像

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

## 六、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

---

## 七、已知限制

- `ttylogin=0`（免密控制台）在本固件失效，这是 v9 起的刻意取舍
- ttyd 的 `no route out` 日志属客户端误用代理，未在固件侧掩盖
- 在线更新在国内链路上很慢（实测约 1 MB/min），建议手动下载后 `sysupgrade`
- 国内探测目标的可达性存在地区与运营商差异。若仍见 `failed`，换成你能 ping 通的目标，并确保 `reliability` 不超过目标数
- 硬件加速不可用（x86 无 NSS/HNAT/SFE）
- 代理工具互斥：OpenClash / passwall / ssr-plus 同时只能启用一个
- 在线更新的 SHA256 与固件同源，可防传输损坏与单文件替换，防不住整个 Release 被攻陷（未加 GPG 签名）

---

## 八、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
