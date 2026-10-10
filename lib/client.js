/**
 * dsh-desktop-glass —— 浏览器半部。
 *
 * 目的：让 DSH 桌面版主窗口的 Windows 亚克力(acrylic)材质透出来。
 *
 * 为什么只改 token 不够：DSH 的 Windows 布局里，背景是**多层不透明色叠加**——
 *   .frame(侧栏色) → .centerCol(bg-base) → ConversationRoot.root(bg-base)
 * 每层 alpha 即使 0.7，叠加后的有效不透明度也接近 99%，看起来就是纯色。
 * macOS 版不是这样：它的 .frame 是 transparent，才让 vibrancy 透上来。
 *
 * 本插件做四件事：
 *   1. 只调透**页面底色与侧栏**(bg-base / sidebar-fill)——这两类才需要露出窗口材质；
 *   2. 按 desktop 实际类名(形如 ZTP-Xa_centerCol，用 [class*="_xxx"] 后缀匹配，
 *      哈希变化也不受影响)把 frame 设透明、给侧栏/中列/右栏各一条**线性渐变**填充；
 *   3. 页面切换过渡：主面板/右栏面板挂载时播放一次淡入 + 上浮动画；
 *   4. 尊重系统的「减少动态效果」设置(reduce 下关掉过渡)。
 *
 * 注意 bg-layer-1/2/3 **保持接近不透明**(0.94)：它们表示浮在内容之上的卡片与
 * 面板表面(设置面板、工具卡片、菜单等)，调透会让设置界面糊成一片。
 * 想调透明度：改下面几组 rgba 的最后一个数字即可。零侵入，卸载即还原。
 */
window.__ModuleLoader__.load({
  id: "dsh-desktop-glass",
  factory: () => {
    var module = { exports: {} };
    var exports = module.exports;

    var CSS = [
      "html {",
      "  background-color: transparent !important;",
      "}",
      "body {",
      "  --dsw-alias-bg-base: rgba(224, 242, 254, 0.24) !important;",
      "  --dsw-specific-sidebar-fill: rgba(186, 230, 253, 0.28) !important;",
      "  --dsw-alias-bg-layer-1: rgba(240, 249, 255, 0.94) !important;",
      "  --dsw-alias-bg-layer-2: rgba(240, 249, 255, 0.94) !important;",
      "  --dsw-alias-bg-layer-3: rgba(240, 249, 255, 0.94) !important;",
      "  background-color: transparent !important;",
      "}",
      /* 页面切换过渡：主面板/右栏面板挂载时淡入 + 上浮 */
      "@keyframes dsh-glass-enter {",
      "  from { opacity: 0; transform: translateY(6px); }",
      "  to { opacity: 1; transform: translateY(0); }",
      "}",
      "[class*=\"_centerCol\"] > *,",
      "[class*=\"_rightbarCol\"] > * {",
      "  animation: dsh-glass-enter 260ms cubic-bezier(0.22, 1, 0.36, 1) both;",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  [class*=\"_centerCol\"] > *,",
      "  [class*=\"_rightbarCol\"] > * {",
      "    animation: none;",
      "  }",
      "}",
      /* 背景渐变：frame 透明，三列各用一条线性渐变。
         当前搭配 **Acrylic** 材质(最透的那档)；
         Acrylic 会在窗口失焦时被 DWM 降级(变实),这是 Windows 的固有行为。 */

      "html[data-windows-titlebar] [class*=\"_frame\"] {",
      "  background: transparent !important;",
      "}",
      "html[data-windows-titlebar] [class*=\"_sidebarCol\"] {",
      "  background: linear-gradient(180deg, rgba(186, 230, 253, 0.42), rgba(224, 242, 254, 0.14)) !important;",
      "}",
      "html[data-windows-titlebar] [class*=\"_centerCol\"] {",
      "  background: linear-gradient(165deg, rgba(186, 230, 253, 0.42), rgba(240, 249, 255, 0.10)) !important;",
      "}",
      "html[data-windows-titlebar] [class*=\"_rightbarCol\"] {",
      "  background: linear-gradient(195deg, rgba(186, 230, 253, 0.42), rgba(240, 249, 255, 0.10)) !important;",
      "}",
      /* 对话根容器必须透明：它自带 bg-base 纯色并铺满中间列，
         会把上面那条 centerCol 渐变整个盖住(渐变看不出来的原因)。 */
      "[class*=\"_centerCol\"] [class*=\"_root\"] {",
      "  background: transparent !important;",
      "}",
      /* 去掉分隔线：中间列圆角、对话区导航栏下划线、dock 面板竖线、侧栏右边界 */
      "html[data-windows-titlebar] [class*=\"_centerCol\"] {",
      "  border-radius: 0 !important;",
      "}",
      "[class*=\"_centerCol\"] [class*=\"_header\"] {",
      "  border-bottom: none !important;",
      "}",
      "[class*=\"_tabHost\"] {",
      "  border-left: none !important;",
      "}",
      "html[data-windows-titlebar] [class*=\"_sidebarCol\"] {",
      "  border-right: none !important;",
      "}",
    ].join("\n");

    function apply(ctx) {
      // 任何异常都不能影响宿主界面：注入失败就静默降级为无毛玻璃。
      try {
        if (typeof document === "undefined" || typeof ctx.effect !== "function") return;
      } catch (error) {
        return;
      }

      var style = document.createElement("style");
      style.setAttribute("data-plugin", "dsh-desktop-glass");
      style.textContent = CSS;
      document.head.appendChild(style);

      ctx.effect(() => () => {
        try {
          style.remove();
        } catch (error) {
          /* 移除失败不影响卸载 */
        }
      });
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  },
});
