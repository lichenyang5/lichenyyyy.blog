---
title: "鸿蒙 Web 容器（五·完结）：闭环回传、容器治理，兼谈 AtomicServiceEnhancedWeb"
description: "差最后一步——把结果送回 H5，闭环就成了。这篇讲 runJavaScript 回传、一个容易踩的重入坑、容器治理，并对比标准 Web 与 AtomicServiceEnhancedWeb。"
date: 2026-06-16
updated: 2026-06-16
tags: ["HarmonyOS", "JSBridge", "Web容器", "ASCF"]
category: "Web容器"
source: "原创"
draft: false
---

> 这是「ArkWeb / JSBridge」系列的第 5 篇，对应 demo 提交 5：`ArkTS通过runJavaScript回调H5+容器治理`。

前四步：H5 嵌进来了 → 协议定好了 → H5 能调到 ArkTS → ArkTS 能按 action 分发到能力。只差最后一步——**把结果送回 H5**，闭环就成了。再顺手把 Web 容器的基本治理补齐。

## 一、回传：ArkTS 怎么「回拨」给 H5

H5 调 ArkTS 用的是 `javaScriptProxy`（注入 `window.ascfBridge`）。反方向 ArkTS 调 H5，用的是另一把钥匙——`controller.runJavaScript`：在 H5 的上下文里执行一段 JS。

约定 H5 暴露一个全局函数 `window.__ascfOnResponse`，ArkTS 处理完就去调它，把响应当参数传进去：

```ts
private sendBack(respJson: string): void {
  const arg = JSON.stringify(respJson);  // JSON 串再 stringify → 合法的 JS 字符串字面量
  this.controller.runJavaScript('if(window.__ascfOnResponse){window.__ascfOnResponse(' + arg + ');}');
}
```

H5 这头接住、解析、显示：

```js
window.__ascfOnResponse = function (jsonStr) {
  var resp = JSON.parse(jsonStr);
  showResult(resp);   // 把结果画到「最近结果」区
};
```

> **注意那个 `JSON.stringify(respJson)`**：respJson 本身已经是 JSON 字符串，要把它作为实参塞进一段 JS 代码，必须再 `stringify` 一次变成带引号、转义好的 JS 字符串字面量，否则字符串里的引号会把代码拼坏（也是一种注入风险）。

## 二、一个隐蔽的坑：别在「接电话」时反向「打电话」

H5 调 `ascfBridge.send` 是 **JS → ArkTS**，这通调用还在栈上、JS 引擎正等着 `send` 返回。如果我在 `send` 里**直接** `runJavaScript`（ArkTS → JS），就是趁 JS 引擎被占着的时候反向闯进去——可能重入、卡住。

解法很简单：把回传推到**下一拍**执行，让 `send` 先返回、JS 引擎先空出来：

```ts
setTimeout(() => {
  if (openToast) this.onToast(msg);   // 真实 Toast 副作用
  this.sendBack(respJson);            // 回传 H5
}, 0);
```

这类「同步回调里别反向重入」的坑，在桥/事件系统里很常见，记一笔。

## 三、闭环长这样（四段日志对上号）

点一次「获取设备信息」，完整链路是：

1. **① H5 发出**（H5 日志）→ `ascfBridge.send`
2. **② ArkTS 收到**（ArkTS 面板）→ `WebBridgeChannel.send` 记请求
3. **③ 分发 + 返回**（ArkTS 面板的 `↩`）→ `BridgeDispatcher` 按 action 取设备信息、包成 `BridgeResponse`
4. **④ H5 收到结果**（H5 日志 + 「最近结果」）→ `runJavaScript` 回拨 `__ascfOnResponse`

`openToast` 还会多一个**真实鸿蒙 Toast** 弹出来——那是 ArkTS 用页面的 `UIContext.getPromptAction().showToast` 干的，H5 碰不到系统 Toast，必须由原生这头代劳。这就是「前端要能力、底座给能力」最直白的样子。

## 四、容器治理：壳子得「管」起来

光能跑通还不够，一个生产级 Web 容器还得管这些（标准 Web 都给了回调，我们逐个接上）：

- **加载生命周期**：`onPageBegin / onProgressChange / onTitleReceive / onPageEnd`（进度条、标题、状态）。
- **资源错误 / HTTP 错误**：`onErrorReceive`（只认主文档，滤掉 favicon 噪音）、`onHttpErrorReceive`（拿 `getResponseCode`）。
- **白名单拦截**：`onLoadIntercept` 里看 URL——非 http(s)（本地资源）一律放行，http(s) 只放行白名单，其余拦截。点那个「尝试打开外部链接」按钮，会被挡下并在顶部亮出 `🛡 已拦截…`。这是 Web 容器**最基本的安全闸**，离线包/域名管控都从这儿起步。

## 五、那 AtomicServiceEnhancedWeb 到底增强了什么？

整个系列我用的是**标准 `Web`**，因为要自己掌控双向桥（`javaScriptProxy` / `runJavaScript`）。那工程里那个 `AtomicServiceEnhancedWeb` 强在哪？翻它的类型定义，差别很清楚：

| | 标准 `Web` | `AtomicServiceEnhancedWeb` |
|---|---|---|
| 双向桥原语 | **有** `javaScriptProxy` / `runJavaScript` | **没有**（controller 只有 loadUrl/refresh/前进后退…） |
| 容器治理回调 | 有，但要自己一个个接 | 同款回调**开箱即用**（progress/title/error/httpError/loadIntercept…） |
| 与元服务集成 | 自己处理 | 内置 `darkMode/forceDarkAccess/safeArea/navPathStack`，和元服务的暗色/沉浸式/导航栈集成 |
| H5→ArkTS | 自定义（javaScriptProxy） | 走 `onMessage` + H5 `postMessage` 通道 |

**一句话选型**：要「在元服务里塞一个治理完善、和系统集成好的 Web 壳」——用 `AtomicServiceEnhancedWeb`，省心；要「自己定义一套双向 JSBridge 协议、掌控每一帧通信」——用标准 `Web` + `javaScriptProxy/runJavaScript`，灵活。我们这个 demo 的重点是「把桥的机制吃透」，所以选了后者。

## 系列总结（五步回看）

**把一个 H5 接进鸿蒙、并能和原生双向通信，本质是五件事**：① 用 `Web` 把 H5 嵌进来；② 先定死 `BridgeRequest/Response` 协议（`id` 配对、`action` 当能力名）；③ `javaScriptProxy` 让 H5 调到 ArkTS；④ 分发器按 `action` 找底座能力、统一包响应；⑤ `runJavaScript` 把结果回拨 H5，再补上加载/错误/白名单这些容器治理。**这正是「小程序/元服务」那套「前端只认 API、底座按 action 给能力」的最小可运行复刻。**
