# Changelog

## 1.0.0

首个版本。

- 客户端插件：页面半透明天蓝、三列渐变、页面切换过渡、去掉分隔线
- Windows 窗口材质补丁器：为 DSH 桌面版主窗口补回 `backgroundMaterial` / 透明的 `backgroundColor`
  - 等字节原地修补，保持 asar 头部偏移与条目大小不变，只更新条目自身的完整性哈希
  - 锚点式匹配，不写死 DSH 版本
  - 先全部校验（锚点唯一性 / 大小一致 / 完整性 / `node --check` 语法）再替换，替换后复核
  - 支持 `-Material acrylic|mica`
- 安装 / 卸载脚本，幂等且支持 `--dry-run`
