# dsh-desktop-glass

DSH 桌面版的毛玻璃主题。窗口透出桌面壁纸，页面半透明，没有分隔线。

<!-- 想放截图就把注释去掉，图片丢进 docs/，或者编辑时直接拖进 GitHub 编辑器
![screenshot](docs/screenshot.png)
-->

只有 Windows 有完整效果，用的是系统自带的 Mica / Acrylic 材质。别的平台上插件照样能装，但只能做到页面半透明。在 DSH 0.2.0-rc.2 上验证过。

## 为什么是两个部分

窗口材质属于 Electron 主进程的 `BrowserWindow` 参数，写在 `app.asar` 的 `main.js` 里。插件够不着它，插件只能注入 CSS。所以要凑齐完整效果需要两样：

- **插件**（仓库根目录）—— 页面那半边：半透明底色、三列渐变、切换动画、去掉分隔线
- **补丁器**（`windows-acrylic/`）—— 窗口那半边：给主窗口补回 `backgroundMaterial` 和透明的 `backgroundColor`

只装插件，页面半透明但窗口不透明，看不到壁纸；只打补丁，窗口透了但页面还糊着一层纯色。两个都得有。

## 安装

需要 Node.js 18+。打补丁时用 `node --check` 校验语法，PATH 里找不到 node 的话脚本会去翻 DSH 自带的运行时。

先装插件：

```powershell
node scripts/install-plugin.mjs
```

它会把仓库拷到 `<DSH_HOME>\profiles\desktop\node_modules\dsh-desktop-glass`，再往 profile 的 `package.json` 里补上 bundle 条目和依赖声明。装完重启 DSH。

再打窗口材质补丁（Windows）：

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\apply-acrylic.ps1
```

脚本会等着 DSH 退出。跑起来之后从托盘右键退出就行，它会自己打补丁再重启。

参数：`-Material mica` 换材质，`-AppRoot` 手动指定安装目录（默认自动探测），`-DryRun` 只检测和生成、不动已安装的文件。

窗口要是不透，先去 `设置 → 个性化 → 颜色` 把透明效果打开。

## 调透明度

改 `lib/client.js` 里几组 rgba 的最后一个数字，越大越不透明。

| 改哪 | 行 | 默认值 |
|---|---|---|
| 页面底色 | 33 | `rgba(224, 242, 254, 0.24)` |
| 侧栏 | 34 | `rgba(186, 230, 253, 0.28)` |
| 三列渐变起点 | 63 / 66 / 69 | `rgba(186, 230, 253, 0.42)` |
| 侧栏渐变终点 | 63 | `rgba(224, 242, 254, 0.14)` |
| 中列、右栏渐变终点 | 66 / 69 | `rgba(240, 249, 255, 0.10)` |

第 35–37 行的 `bg-layer-1/2/3` 别动。那几个是浮在内容上的卡片和面板表面，调透了设置界面会糊成一片。

想换蓝色深浅就改那三个渐变起点的 RGB。同色系由浅到深：`#F0F9FF` `#E0F2FE` `#BAE6FD` `#7DD3FC` `#38BDF8`。

改完重跑一遍安装脚本再重启。装的时候加了 `--link` 的话，改完直接重启就行。

## 卸载

```powershell
node scripts/uninstall-plugin.mjs
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\restore-asar.ps1
```

插件只往页面里插一个 `<style>` 标签，卸掉就干净了。

## 已知问题

**Acrylic 失焦会变实。** 这是 Windows 降级材质的行为，绕不过去。介意的话用 `-Material mica`，那个降级不明显。

**DSH 更新会覆盖 `app.asar`**，毛玻璃就没了，重跑一次补丁脚本即可。

**补丁会裁掉一小段注释。** 为了让 `main.js` 打完补丁后长度不变，得从文件里减掉等量字节，我挑了一段 JSDoc 下手，不影响运行。

**万一 DSH 以后改了主窗口那段结构**，补丁脚本会直接报错退出，不会动已安装的文件。它靠锚点匹配，没绑版本号。

**如果某个构建开了 Electron 的 embedded asar integrity validation**，打完补丁起不来，用 `restore-asar.ps1` 还原。目前 DSH 没开。

改 `app.asar` 毕竟是对宿主程序动手，风险自己评估，也留意一下 DSH 的许可条款。

## 原理

**插件这边。** Windows 布局的背景是多层不透明色叠出来的（`.frame` → `.centerCol` → `ConversationRoot.root`），每层哪怕只有 0.7 的 alpha，叠完也接近全不透明。macOS 版没这问题，它的 `.frame` 本身透明，vibrancy 才透得上来。所以插件把 `.frame` 设成完全透明，页面底色和侧栏调半透明，三列各铺一条渐变找层次。类名按 `[class*="_centerCol"]` 这种后缀匹配，前端重新构建换掉哈希名也不受影响。

**补丁这边。** `app.asar` 是「头部 JSON + 各条目字节」，头部记着每个条目的 offset、size 和完整性哈希。`main.js` 一长，后面所有条目的 offset 都得重算。所以补丁的做法是插两个属性、同时从一段注释里删掉等量字节，让 `main.js` 长度保持不变，只更新它自己的哈希。

## 目录

```
package.json            插件清单，仓库根就是插件包
cordis.patch.yml        挂载插件用的 bundle patch
lib/client.js           浏览器半部，注入 CSS
lib/index.js            宿主半部，空的
windows-acrylic/        窗口材质补丁器
scripts/                安装、卸载
```

`backups/`、`build/` 是跑脚本时生成的，已经 ignore 了。

## License

[MIT](LICENSE)
