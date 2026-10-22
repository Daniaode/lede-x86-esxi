# v5 / r8194-07cebbcf2 — 修复 sysupgrade 后控制台锁死

第五个构建版本。本版只做一件事：**修复从老版本升级后无法通过控制台登录的严重缺陷**。无其它功能变更。

---

## 一、问题现象

从旧固件用 `.img.gz` 执行 `sysupgrade` 升级到 v2/v3/v4 后：

- 控制台**会出现** `Login:` 提示
- 但输入 `root` / `password` 被拒
- 空密码直接回车也被拒
- `sysupgrade -n`（不保留配置）、恢复出厂设置均**无效**

结果：设备完全无法进入，只能重刷或挂盘修复。

---

## 二、根因

问题不在镜像本身。经逐层解包核对，v2/v3/v4 发布镜像内的内容全部正确：

```
/etc/shadow  → root:$1$V4UetPzk$CYXluq4wUazHjmCDBCqXF.:0:99999:7:::
/etc/passwd  → root:x:0:0:root:/root:/bin/ash
/etc/inittab → tty1::askfirst:/usr/libexec/login.sh
ttylogin     → 1
```

真正的机制是：

1. `package/base-files/files/lib/upgrade/keep.d/base-files-essential` 里列有 `/etc/shadow`
2. 该文件头注释写明 `# Essential files that will be always kept`
3. 因此 **`sysupgrade` 无条件保留 `/etc/shadow`，`-n` 也无法阻止**
4. 旧固件（v1，未启用登录认证）的 shadow 是 `root:::`（空密码字段）
5. 升级后保留了这个空密码，而新镜像的 `ttylogin=1` 让登录提示出现

**= 有登录框，但没有可用密码。**

`-n` 只清 overlay 层的配置，不触碰 `keep.d` 里列为 "essential" 的文件。所以恢复出厂设置同样无法解决。

---

## 三、修复方案

新增 `package/base-files/files/etc/init.d/fix-root-shadow`，开机早期（`START=05`）执行一次自检。

### 逻辑

```sh
cur=$(awk -F: '$1=="root"{print $2; exit}' /etc/shadow)

# 非空即放过：真实哈希、* 锁定、! 锁定、x 占位都不动
[ -z "$cur" ] || return 0

# 空密码 -> 整行替换为基准行
awk -v line="$CANON" -F: 'BEGIN{OFS=":"} $1=="root"{print line; next} {print}' \
    /etc/shadow > /etc/shadow.new
chmod 600 /etc/shadow.new
mv /etc/shadow.new /etc/shadow
```

### 为什么整行替换而不是只改密码字段

`root:::` 与 `root:$1$...:0:99999:7:::` 的**字段数量不同**。若只替换第二个字段，会残留多余的冒号，产生畸形条目。最初用 `sed 's|^root:[^:]*:|...|'` 实测会得到：

```
root:$1$V4UetPzk$CYXluq4wUazHjmCDBCqXF.::0:99999:7:::
                                             ^^ 多余冒号
```

改为按字段解析后整行输出，结果与 `base-files` 基准行**逐字节一致**。

### 为什么不改 keep.d

把 `/etc/shadow` 从 `base-files-essential` 移除也是一种解法，但那样每次升级都会重置所有用户密码——对已正常设置密码的用户是破坏性的。本方案只在校正异常状态时动作，正常升级路径零影响。

### 安全性

| shadow 状态 | 行为 |
|---|---|
| `root:::` （空） | **修复**为默认哈希 |
| `root:$1$...` （已有密码） | 不动 |
| `root:*` / `root:!` （主动锁定） | 不动，尊重管理意图 |
| `root:x` （占位） | 不动 |

---

## 四、验证

### 脚本逻辑单测

在构建机上对各类 shadow 状态逐一测试：

```
v1空密码  -> root:$1$V4UetPzk$CYXluq4wUazHjmCDBCqXF.:0:99999:7:::
double空    -> root:$1$V4UetPzk$CYXluq4wUazHjmCDBCqXF.:0:99999:7:::
已有哈希 -> root:$1$abc$def:0:99999:7:::          (未改动 OK)
锁定*   -> root:*:0:99999:7:::                  (未改动 OK)
锁定!   -> root:!:0:99999:7:::                  (未改动 OK)
```

与 `base-files` 基准行逐字节比对：**完全一致**。

### 镜像内确认

从**最终发布的 combined EFI vmdk** 解包验证：

```
<empty>
/etc/init.d/fix-root-shadow          ← 脚本存在
/etc/rc.d/S05fix-root-shadow         ← 已自动 enable
/etc/shadow → root:$1$V4UetPzk$...   ← 基准哈希
```

`include/rootfs.mk` 的机制会自动遍历 `etc/init.d/*` 并执行 `enable`，因此无需手工建符号链接。

---

## 五、升级前必读

**从 v1 升级到本版（v5）现在是安全的。**

但如果你当前卡在 v2/v3/v4 无法登录，**必须先用 v5 镜像重新升级或重刷**，本版才能生效：

```sh
sysupgrade -v /tmp/openwrt-x86-64-generic-squashfs-combined-efi.img.gz
```

升级后首次开机，`fix-root-shadow` 检测到空密码会自动写入默认哈希，然后即可用 `root` / `password` 登录。

> 若你已经在 v2/v3/v4 上锁死，可以直接用 v5 的 `.img.gz` 再跑一次 `sysupgrade`（通过 SSH 不行就挂盘或用单用户模式），或者用 v5 的 vmdk 全新导入。

### 登录后第一件事

```sh
passwd
```

`password` 是上游 LEDE 的公开默认值，暴露在 ESXi 控制台上等同于无防护。

---

## 六、本版相对 v4 的变更

| 项 | v4 | v5 |
|---|---|---|
| 版本号 | `r8194-07cebbcf2` | `r8194-07cebbcf2`（重新构建） |
| 上游提交 | `07cebbcf2` | `07cebbcf2`（未变） |
| 内核 | 6.18.55 | 6.18.55 |
| 软件包总数 | 572 | **572**（未变） |
| `fix-root-shadow` 开机自检 | 无 | **新增** |
| 其它功能 | — | 未变更 |

**包数量、插件集合、代理内核版本全部与 v4 相同**，本版是纯粹缺陷修复。

---

## 七、下载文件

| 文件 | 大小 | 用途 |
|---|---|---|
| `openwrt-x86-64-generic-squashfs-combined-efi.vmdk` | 185 MB | **ESXi 推荐**，EFI 启动 |
| `openwrt-x86-64-generic-squashfs-combined.vmdk` | 184 MB | Legacy BIOS 启动 |
| `openwrt-x86-64-generic-squashfs-combined-efi.img.gz` | 186 MB | 系统升级（EFI） |
| `openwrt-x86-64-generic-squashfs-combined.img.gz` | 186 MB | 系统升级（BIOS） |
| `RELEASE_SHA256SUMS` | — | SHA256 校验值 |

校验：

```sh
sha256sum -c RELEASE_SHA256SUMS
```

---

## 八、已知限制

- **默认密码是公开的**：`password` 必须首启后修改
- **未实机验证**：本次仍在 Debian 构建机上交叉编译，修复逻辑经单测与镜像解包双重验证，但**未在 ESXi 实际启动测试**
- **代理工具冲突**：OpenClash / passwall / ssr-plus 只能同时启用一个
- **硬件加速不可用**：x86 无 NSS / HNAT / SFE 转发引擎
- **FakeHTTP 默认关闭**：`fakehttp.main.enabled='0'`

---

## 九、许可

构建脚本与配置以 MIT 发布。固件内各软件包版权归原作者所有，LEDE 主源码遵循 GPL-2.0。
