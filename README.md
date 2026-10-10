# dsh-desktop-glass

给 **DeepSeek Harness 桌面版**加上「天蓝 + 毛玻璃」外观：窗口透出桌面壁纸，页面半透明，去掉分隔线。

> 只在 **Windows** 上能得到完整的毛玻璃效果（用 Windows 的 Mica / Acrylic 材质）。其他平台只能用页面半透明那部分。

<!--
  建议在这里放一张截图（拖进 GitHub 编辑框即可自动生成链接）：
  ![screenshot](docs/screenshot.png)
-->

---

## 效果

- **窗口透出桌面壁纸** —— 主窗口启用 Windows Acrylic / Mica 材质，背景是真正的桌面，不是纯色
- **页面半透明天蓝** —— 页面底色与侧栏改成半透明的天蓝色
- **三列渐变** —— 侧栏 / 中间列 / 右栏各一条方向不同的线性渐变
- **页面切换过渡** —— 主面板与右栏面板出现时淡入 + 上浮
- **去掉分隔线** —— 中列圆角、导航栏下划线、dock 竖线、侧栏右边界全部去掉

---

## ⚠️ 它是两半组成的，缺一不可

这是本项目最容易踩坑的地方：**窗口材质不是插件能设置的**。它属于 Electron 主进程的 `BrowserWindow` 构造参数，写死在 `app.asar` 里的 `main.js` 中；而 DSH 的客户端插件只能注入 CSS，改不了「窗口本身是否透出桌面」。

所以完整效果 = 两个部分：

| 部分 | 做什么 | 怎么装 | 缺了会怎样 |
|---|---|---|---|
| **客户端插件**<br>`lib/client.js` | 页面半透明、三列渐变、过渡动画、去分隔线 | 装进 DSH profile（本仓库根目录就是插件包） | 窗口是透的，但页面糊着不透明色，看不到壁纸 |
| **窗口材质补丁器**<br>`windows-acrylic/` | 把主窗口的 `backgroundMaterial` / `backgroundColor` 补回去（Windows） | 运行 `apply-acrylic.ps1` | 页面是半透明的，但窗口不透明，只能透到窗口底色 |

---

## 安装

### 前置

- DSH 桌面版（Windows）
- 修改窗口材质需要 **Node.js 18+**（脚本用 `node --check` 做语法校验；没有的话脚本会自动尝试 DSH 自带的运行时）

### 第一步：装客户端插件

```powershell
# 在仓库根目录
node scripts/install-plugin.mjs
```

脚本会：

1. 把本仓库复制到 `<DSH_HOME>\profiles\desktop\node_modules\dsh-desktop-glass`
2. 在 profile 的 `package.json` 里补上 `dsh.profile.bundles` 条目与依赖声明

常用参数：

```powershell
node scripts/install-plugin.mjs --dry-run     # 只打印将要写入的内容
node scripts/install-plugin.mjs --link        # 用符号链接（改源码立即生效，方便调参）
node scripts/install-plugin.mjs --profile "C:\path\to\profile"
```

装完 **重启 DSH 桌面版**。

### 第二步：打窗口材质补丁（仅 Windows）

```powershell
# 用管理员以外的普通权限即可
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\apply-acrylic.ps1
```

**脚本会先等你退出 DSH**：运行脚本后，在托盘图标上右键 → 退出，脚本检测到退出就会自动处理并重启。

参数：

```powershell
-Material mica      # 换成 mica 材质（更含蓄，失焦时降级不明显）
-AppRoot "C:\..."   # 手动指定安装目录（默认自动探测）
-NodePath "C:\..."  # 手动指定 node.exe
```

脚本自动探测 DSH 安装目录的顺序：参数 → 正在运行的进程 → 卸载登记项 → 常见安装位置。

### 第三步：验收

- 窗口应该能透出桌面壁纸
- 如果完全不透：确认 **设置 → 个性化 → 颜色 → 透明效果 = 开**

---

## 调参

想让效果更透 / 更实、颜色更深 / 更浅，改 [`lib/client.js`](lib/client.js) 里这几组 `rgba` 的 **最后一个数字**（alpha，越大越不透明）：

| 位置 | 行 | 默认值 | 说明 |
|---|---|---|---|
| 页面底色 `--dsw-alias-bg-base` | 33 | `rgba(224, 242, 254, 0.24)` | 整页主背景 |
| 侧栏 `--dsw-specific-sidebar-fill` | 34 | `rgba(186, 230, 253, 0.28)` | 左侧栏填充 |
| 渐变起点色（三列） | 63 / 66 / 69 | `rgba(186, 230, 253, 0.42)` | 决定「蓝」的深浅，改 RGB 即可调色 |
| 侧栏渐变终点 | 63 | `rgba(224, 242, 254, 0.14)` | |
| 中列 / 右栏渐变终点 | 66 / 69 | `rgba(240, 249, 255, 0.10)` | |
| `--dsw-alias-bg-layer-1/2/3` | 35–37 | `0.94` | **建议别动**，它们表示浮在内容上的卡片与面板表面，调透会让设置界面糊成一片 |

改完 **重新装一次插件**（`node scripts/install-plugin.mjs`）并重启 DSH。

> 用 `--link` 安装的话，改完源码只重启即可，不用重装。

颜色参考（同一族，由浅到深）：`#F0F9FF` → `#E0F2FE` → `#BAE6FD` → `#7DD3FC` → `#38BDF8`

---

## 卸载 / 还原

```powershell
# 移除客户端插件
node scripts/uninstall-plugin.mjs

# 还原窗口材质（撤销 app.asar 补丁）
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\restore-asar.ps1
```

插件是**零侵入**的：只注入一个 `<style>`，卸载后完全还原，不改任何内置包。
补丁器也只改 `main.js` 里的两个属性，还原脚本会用打补丁前自动建立的备份覆盖回去。

---

## 兼容性

- **系统**：Windows 10 / 11；需要系统「透明效果」开启
- **DSH 版本**：在 **0.2.0-rc.2** 上验证通过
- 补丁器采用**锚点式匹配**（找主窗口的 `win32 && primary` 分支），不写死版本号。DSH 升级后一般重跑同一个脚本即可；万一新版改了这段结构，脚本会**直接报错退出，不会改动任何已安装文件**
- 非 Windows 平台：插件仍可安装，页面变半透明，但窗口材质补丁不适用

---

## 已知限制

- **Acrylic 失焦会变实**：Windows 在窗口失去焦点时会降级 Acrylic 材质，这是 DWM 的固有行为，无解。在意的话用 `-Material mica`
- **DSH 自动更新会覆盖 `app.asar`**，毛玻璃会消失，重跑 `apply-acrylic.ps1` 即可
- 补丁是**等字节替换**，为了配平大小会裁掉一小段无关的 JSDoc 注释（纯注释，不影响行为）
- 如果某个构建启用了 Electron 的 **embedded asar integrity validation**，补丁会导致启动失败——那种情况下请用 `restore-asar.ps1` 还原。目前 DSH 桌面版未启用该选项
- 修改 `app.asar` 属于对宿主程序的改动，请自行评估风险，并注意 DSH 的许可条款

---

## 原理

### 插件为什么不能只改 token

DSH 的 Windows 布局里背景是**多层不透明色叠加**：

```
.frame(侧栏色) → .centerCol(bg-base) → ConversationRoot.root(bg-base)
```

每层 alpha 即使 0.7，叠加后的有效不透明度也接近 99%，看起来就是纯色。macOS 版不是这样——它的 `.frame` 本身是 `transparent`，vibrancy 才透得上来。

所以插件做的是：把 `.frame` 设为完全透明、把页面底色与侧栏调成半透明、再给三列各铺一条渐变换取层次感。类名用 `[class*="_centerCol"]` 这样的**后缀匹配**，这样 DSH 前端构建时哈希名变化也不受影响。

### 补丁器为什么要等字节修补

`app.asar` 内部结构是「头部 JSON + 各条目原始字节」，头部记录每个条目的 `offset` / `size` / 完整性哈希。如果 `main.js` 变长，它后面所有条目的 `offset` 都要重算，改动面极大且容易出错。

所以补丁器采取等字节修补：

1. 在唯一的锚点位置插入 `backgroundMaterial` + 透明的 `backgroundColor`
2. 同时从一段真实文档注释里裁掉**等长**字节来配平
3. 条目大小不变 → 头部所有 `offset` 保持不变
4. 只更新该条目自身的完整性哈希（`hash` 与 `blocks[0]`，单块时两者相同）

---

## 目录结构

```
.
├─ package.json            # 插件包清单（仓库根即插件包）
├─ cordis.patch.yml        # bundle patch：把插件挂进 DSH
├─ lib/
│  ├─ index.js             # 宿主半部（空操作）
│  └─ client.js            # 浏览器半部：注入半透明 CSS
├─ windows-acrylic/        # 窗口材质补丁器（Windows）
│  ├─ apply-acrylic.ps1    # 打补丁（自动探测安装路径）
│  ├─ restore-asar.ps1     # 还原
│  ├─ make-acrylic.mjs     # 等字节修补 app.asar
│  └─ asar-state.mjs       # 检测当前材质状态
└─ scripts/
   ├─ install-plugin.mjs   # 安装插件到 DSH profile
   └─ uninstall-plugin.mjs # 卸载
```

`backups/` 与 `build/` 是运行时产物，已加入 `.gitignore`。

---

## 常见问题

**装上插件后完全没变化？**
确认插件在 profile 的 `dsh.profile.bundles` 里，并**重启**过 DSH。宿主侧的插件清单与浏览器 bundle 都只在启动时组装。

**窗口透了，但页面还是一块纯色？**
大概率是补丁没打（窗口材质没生效），或者你改了 `bg-layer-*` 之外的层级被别的元素盖住了。先跑 `node windows-acrylic/asar-state.mjs <安装目录>\resources\app.asar` 看 `patched` 是不是 `true`。

**窗口一点都不透？**
Windows 设置里打开「透明效果」。另外最大化 / 失焦状态下材质可能被降级。

**DSH 更新后效果没了？**
正常现象，重跑 `windows-acrylic\apply-acrylic.ps1`。

**能不能只装插件、不改 `app.asar`？**
可以。只跑第一步即可，页面会变半透明，但看不到桌面壁纸。

**补丁会不会把 DSH 改坏？**
补丁器先全部校验（锚点唯一性、大小一致、完整性哈希、`node --check` 语法校验）**再**替换，任一步失败都会报错退出且不改动已安装文件；替换后还会复核一次。出问题可以随时用 `restore-asar.ps1` 还原。

---

## License

[MIT](LICENSE) © JianHeShui
