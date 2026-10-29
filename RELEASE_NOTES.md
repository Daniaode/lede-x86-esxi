# v14 — 修复在线更新刷写时的 XHR 超时误报

**此版本取代全部历史版本。** 修复一个长期存在的接口缺陷：在固件内点「在线更新 → 安装」后，界面报 `XHR request timed out`，但固件其实正在正常写入。

版本标识：`r8201-0185dc581`，baked tag `v14-r8202`，内核 `6.18.58`，包数 575。

---

## 一、现象

在 LuCI 里用「系统 → 在线更新」安装新固件，点击安装确认后：

1. 弹出「正在安装…」窗口
2. 约 20 秒后界面报错 `XHR request timed out`
3. 但设备实际上已开始刷写，稍后自动重启并升级成功

也就是说：**升级是成功的，报错是误报**。但很容易让人误以为失败而在写入过程中断电，这是真实风险。

---

## 二、根因

### 同步调用一个永不返回的函数

`/usr/sbin/online-update` 的 `cmd_apply` 原本直接同步调用 sysupgrade：

```sh
if [ "$keep" = "1" ]; then
    sysupgrade "$DL_DIR/firmware.img.gz"
else
    sysupgrade -n "$DL_DIR/firmware.img.gz"
fi
```

sysupgrade 会关闭网络、写盘、重启，**这个调用永远不会返回**。

### 超时链条

```
sysupgrade 阻塞
  → rpcd 的 ucode 用 popen 读 stdout 直到 EOF，一直等
  → 浏览器 POST /cgi-bin/luci/admin/ubus 挂住
  → rpc.js:38   timeout: (L.env.rpctimeout ?? 20) * 1000
  → luci.js:835 rejectFn(new Error('XHR request timed out'))
```

`rpc.js` 的默认 RPC 超时是 20 秒，所以 20 秒后必然报错。

### 上游明知此问题

LuCI 原生刷写页 `flash.js:408` 有明确注释：

```js
/* Currently the sysupgrade rpc call will not return, hence no promise handling */
fs.exec('/sbin/sysupgrade', args);
```

上游因此故意不处理这个 promise。本组件却依赖 `stdout` 返回值判断结果，所以撞上了超时。

### 对照

同一个脚本里的下载路径 `cmd_start` 本来就用了 `setsid ... &` 脱离会话（否则下载会被 rpcd 回收），而 `apply` 没有。

---

## 三、修复（三处）

### 1. `cmd_apply` 让 sysupgrade 脱离会话

hash 校验仍留在前台（快，且失败必须拦住不刷），只把慢且会断网的刷写部分放到后台：

```sh
if [ "$keep" = "1" ]; then
    setsid sh -c "sysupgrade '$DL_DIR/firmware.img.gz' >/overlay/online-update-sysupgrade.log 2>&1" \
        </dev/null >/dev/null 2>&1 &
else
    setsid sh -c "sysupgrade -n '$DL_DIR/firmware.img.gz' >/overlay/online-update-sysupgrade.log 2>&1" \
        </dev/null >/dev/null 2>&1 &
fi

echo "RESULT=started"
echo "STATE=APPLYING"
```

刷写日志现在落在 `/overlay/online-update-sysupgrade.log`，重启后仍可查。

### 2. LuCI JS 补上 catch

原 `.then()` 没有 `.catch()`，超时会变成未捕获 rejection。现在：

- 收到 `RESULT=started` → 视为已移交，保留「正在安装」弹窗
- 超时或连接断开 → 同样视为已移交，不弹错误框

### 3. 排查中发现的第二个隐患

`check` / `download` 里的 GitHub API 调用超时原本是 20 秒，**与 XHR 的 20 秒完全相同**。GitHub 响应慢时两者赛跑，浏览器先超时 → 用户看到同样的报错。改为 15 秒，留出余量让 helper 自己返回 `RESULT=error REASON=network`。

---

## 四、验证（五阶段，全部 PASS）

### 阶段 1 — QEMU

```
FAIL_COUNT=0  RESULT=PASS
REVISION=R26.10.29  KERNEL=6.18.58  PKGCOUNT=575
DNS ok  53=dnsmasq  FW4=225  LUCI ok  PANIC=0
```

### 阶段 2 — ESXi 新建机

```
TAG=v14-r8202  PANIC=0
eth0/eth1 vmxnet3 均 up  WAN 172.16.99.82/24  LAN 192.168.1.1/24
toolsOk

DETACH=2          sysupgrade 已 setsid 脱离
RESULT_STARTED=2  apply 立即返回
CURL15=2          API 超时降到 15s
JS_CATCH=1        JS 有 catch
OLD_SYNC=0        旧同步写法已不存在
```

### 阶段 3 — 升级 + 真实 apply 实测（核心）

升级路径 `R26.05.20` → `R26.10.29` 通过。

随后在 v14 上构造 VERIFIED 作业并**真实调用 apply**：

```
APPLY_RC=0
APPLY_ELAPSED=1s          ← 修复前会阻塞到 20s 触发 XHR 超时
OUT RESULT=started
OUT STATE=APPLYING

SYSUPGRADE_RUNNING=yes    ← 返回后 sysupgrade 仍在后台运行
PS {sysupgrade} /bin/sh /sbin/sysupgrade /overlay/update/firmware.img.gz
PS {validate_firmwa} /usr/libexec/validate_firmware_image
```

随后设备完成重刷并重启，`TAG=v14-r8202` 仍正确 —— 证明前端 1 秒拿到响应，刷写不受影响。

### 阶段 4 — 恢复出厂

```
REVISION=R26.10.29  KERNEL=6.18.58  UPTIME=70s
DETACH=2  RESULT_STARTED=2  CURL15=2  JS_CATCH=1  OLD_SYNC=0
DNSMASQ/LUCI running  LOG_ERRORS=0
```

修复固化在镜像内的 `/usr/sbin/online-update` 与 LuCI JS 中，恢复出厂不会回退。

### 阶段 5 — 清理

测试机全部 `unregister`，datastore 残留目录已删，临时 HTTP 服务已停。

---

## 五、验证中的一处发现

测试用的旧快照（`R26.05.20`）**没有安装 `online-update` 包**，因此该快照的在线更新功能本身不可用。原始报错应来自 v7–v10（改名前但含该包的固件），根因完全相同。

---

## 六、已知限制

- 测试环境无运营商 IPv6 上游，「拿到前缀 → 外网 IPv6 通」仍无法端到端实测
- mwan3 默认不管理 IPv6（`wan6 enabled=0`），单线场景走内核正常路由
- 在线更新仅支持本仓库，不提供任意 URL 源
- 在线更新的 SHA256 与固件同源，可防传输损坏与单文件替换，防不住整个 Release 被攻陷（未加 GPG 签名）
- 刷写耗时取决于写入速度，界面在拿到 `RESULT=started` 后即停止等待，实际完成以设备重启为准

---

## 七、升级

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined.img.gz
```

或在本版固件内用 `系统 → 在线更新`（本版起不会再报 XHR 超时）。

登录：`root` / `password`，**首启后立即 `passwd` 修改**。

> 若仍看到超时提示：不要断电，刷写已移交后台，等待设备自动重启即可。日志在 `/overlay/online-update-sysupgrade.log`。

---

## 八、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者，LEDE 主源码遵循 GPL-2.0。
