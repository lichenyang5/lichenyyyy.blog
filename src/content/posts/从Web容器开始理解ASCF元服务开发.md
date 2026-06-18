---
title: "从 Web 容器开始，理解 ASCF 元服务开发"
description: "很多人第一次接触 ASCF，会先被概念绕晕。其实可以从一个更具体的问题开始：如果元服务里要承载一段 H5 页面，它怎么进入 ArkUI，又怎么调用原生能力？"
date: 2026-06-18
updated: 2026-06-18
tags:
  - HarmonyOS
  - ASCF
  - 元服务
  - Web 容器
  - JSBridge
  - ArkTS
category: HarmonyOS
source: "harmony-ASCF-demo"
sourceUrl: "https://github.com/lichenyang5/harmony-ASCF-demo"
draft: false
---

# 从 Web 容器开始，理解 ASCF 元服务开发

## 为什么要写这个

刚开始看 ASCF 的时候，我其实不是先被代码难住，而是先被概念绕住了。

什么是 ASCF？什么是元服务？为什么又和小程序生态有关？Web 容器、JSBridge、ArkTS、Native 能力这些词放在一起，到底在解决什么问题？

如果一开始就从定义出发，很容易变成背概念。

所以我更愿意从一个具体问题切进去：

> 如果一个元服务里需要承载一段 H5 页面，这个 H5 怎么进入 HarmonyOS 页面？它又怎么调用 ArkTS 侧的原生能力？

这个问题一旦想清楚，Web 容器、JSBridge、Native 能力分发、容器治理这些点就能串起来。

我在 `harmony-ASCF-demo` 里做的练习，本质上就是围绕这条链路：

```txt
H5 → ArkTS → 模拟 Native 能力 → ArkTS → H5
```

这篇文章就从这条链路开始，理解 ASCF 元服务开发里 Web 容器这一块到底在做什么。

## 问题是什么

在普通 ArkUI 页面里，我们写的是 ArkTS 组件：

```txt
Text()
Button()
Column()
List()
Web()
```

这些组件由 HarmonyOS 原生渲染。

但很多业务并不是完全从零用 ArkUI 写出来的。现实里经常会有这些情况：

- 之前已经有一套 H5 页面
- 某些活动页、营销页更适合用 Web 技术快速迭代
- 小程序生态里已有页面或业务能力，希望迁移到元服务
- 页面展示层想用 H5，但设备能力、Toast、定位、扫码等能力还得走原生

这时候就会出现一个核心问题：

> H5 可以被嵌进来，但 H5 不能直接调用 HarmonyOS 原生能力。

于是需要两层东西：

1. Web 容器：负责把 H5 放进 ArkUI 页面里。
2. JSBridge：负责让 H5 和 ArkTS 通信。

如果只加载 H5，没有 JSBridge，那只是一个网页。

如果有 JSBridge，但没有协议、分发、日志、错误处理，就很容易变成一堆临时字符串调用。

所以真正有价值的不是“能不能调通”，而是：

- 消息格式怎么设计？
- action 怎么分发？
- 返回值怎么回传？
- 出错了怎么提示？
- 调试时怎么看请求和响应？
- 哪些链接允许打开，哪些要拦截？

这些问题合起来，才是一个可维护的 Web 容器能力。

## 我的理解

我现在对 ASCF 元服务开发的理解，可以先不从大而全的定义讲起，而是从“页面承载方式”理解。

ASCF 面向的是元服务和小程序生态的开发场景。它希望让开发者能用接近小程序的开发体验，更高效地开发元服务。

而 Web 容器这一层解决的是：

> 怎么把 Web 技术栈的页面，放进 HarmonyOS 的元服务页面里，并让它具备调用原生能力的能力。

这有点像小程序里的页面和宿主环境：

- H5 负责页面展示和交互
- ArkTS 负责宿主能力和系统能力
- JSBridge 负责两边通信
- Bridge Dispatcher 负责按 action 分发
- Native Ability 层负责具体能力实现
- Log / Monitor 负责调试和排查问题

也就是说，不要把 Web 容器理解成单独的 `Web()` 组件。

更完整一点，它应该是一套链路：

```txt
ArkUI 页面
  ↓
Web 容器
  ↓
本地 H5 / 远程 H5
  ↓
JSBridge 协议
  ↓
ArkTS 分发层
  ↓
Native 能力
  ↓
结果回传给 H5
```

在我的 demo 里，`WebRuntimePage` 就是这个链路的入口。

## 关键代码或关键链路

### 1. 用 Web 组件加载本地 H5

在 ArkUI 页面里，Web 容器的入口是 `Web` 组件。

我的 demo 里加载的是 `resources/rawfile` 下的本地 HTML：

```ts
Web({
  src: $rawfile('ascf_bridge_demo.html'),
  controller: this.controller
})
  .javaScriptAccess(true)
  .domStorageAccess(true)
```

这里有几个点：

- `src` 指向本地 H5 文件。
- `controller` 用来控制 WebView，比如后面调用 `runJavaScript`。
- `javaScriptAccess(true)` 开启 JavaScript。
- `domStorageAccess(true)` 允许 Web 页面使用本地存储能力。

这一步只是把 H5 放进来，还没有做到 H5 和 ArkTS 互通。

### 2. H5 调 ArkTS：javaScriptProxy

H5 想调用 ArkTS，需要 ArkTS 往 Web 页面里注入一个对象。

在 demo 里，这个对象叫：

```txt
window.ascfBridge
```

ArkTS 侧通过 `javaScriptProxy` 注册：

```ts
.javaScriptProxy({
  object: this.bridge,
  name: 'ascfBridge',
  methodList: ['send'],
  controller: this.controller
})
```

这样 H5 就可以调用：

```js
window.ascfBridge.send(JSON.stringify(request))
```

这里我没有让 H5 直接调很多方法，比如：

```js
window.native.getDeviceInfo()
window.native.openToast()
window.native.getLocation()
```

而是统一收口成一个 `send` 方法。

原因是：Bridge 方法一多，管理会变复杂。统一成 `send(json)` 之后，所有调用都走同一套协议。

### 3. 先定义 Bridge 协议

Bridge 最重要的不是“能调”，而是“怎么描述一次调用”。

一次比较完整的请求可以长这样：

```json
{
  "id": "req_001",
  "action": "openToast",
  "params": {
    "message": "Hello ASCF"
  }
}
```

关键字段：

- `id`：标识一次请求，方便回调和日志追踪。
- `action`：告诉 ArkTS 要调用什么能力。
- `params`：调用参数。

返回值可以长这样：

```json
{
  "id": "req_001",
  "code": 0,
  "message": "ok",
  "data": {
    "result": true
  }
}
```

关键字段：

- `id`：和请求对应。
- `code`：错误码。
- `message`：提示信息。
- `data`：真正的数据。

这一步很重要，因为它让 Bridge 从“临时调用”变成了“协议通信”。

### 4. ArkTS 收到消息后分发 action

H5 发来的 JSON 字符串会进入 ArkTS 的 `WebBridgeChannel`。

大概流程是：

```txt
H5 调 window.ascfBridge.send(json)
  ↓
WebBridgeChannel.send(jsonStr)
  ↓
JSON.parse
  ↓
BridgeLog 记录请求
  ↓
BridgeDispatcher.dispatch(req)
  ↓
NativeAbilityBiz / NativeAbilityImp
  ↓
生成响应
  ↓
BridgeLog 记录响应
```

我比较喜欢把它拆成几层：

- `WebBridgeChannel`：只负责收发消息。
- `BridgeProtocol`：定义请求和响应格式。
- `BridgeDispatcher`：按 action 分发。
- `NativeAbilityBiz`：业务能力入口。
- `NativeAbilityImp`：模拟具体原生能力。
- `BridgeLog`：记录完整链路。

这样以后加能力时，不需要把所有逻辑都堆在 Web 页面里。

比如新增一个 `getDeviceInfo`，只需要在协议和分发层补对应 action，再到 Native 能力层实现。

### 5. ArkTS 回传给 H5：runJavaScript

H5 调 ArkTS 是一半，ArkTS 把结果回给 H5 才是闭环。

在 demo 里，我约定 H5 暴露一个全局函数：

```js
window.__ascfOnResponse = function (respJson) {
  // 处理 ArkTS 回传结果
}
```

ArkTS 侧通过 `runJavaScript` 调回去：

```ts
this.controller.runJavaScript(
  'if(window.__ascfOnResponse){window.__ascfOnResponse(' + arg + ');}'
)
```

这样完整链路就跑通了：

```txt
H5 发请求
  ↓
ArkTS 收请求
  ↓
ArkTS 调模拟 Native 能力
  ↓
ArkTS 生成响应
  ↓
H5 收到响应并更新页面
```

### 6. Web 容器治理：不是只加载页面

一个真正能用的 Web 容器，不能只写 `Web()`。

还要处理：

- 页面加载开始
- 页面加载进度
- 页面标题
- 页面加载完成
- 主页面错误
- HTTP 错误
- 外部链接拦截

在 demo 里，我做了这些状态：

```ts
@Local progress: number = 0
@Local title: string = 'Web 容器'
@Local loadState: string = '未开始'
@Local errorMsg: string = ''
@Local guardMsg: string = ''
```

对应 Web 组件事件：

```ts
.onPageBegin(() => {
  this.loadState = '加载中'
})
.onProgressChange((event) => {
  this.progress = event.newProgress
})
.onTitleReceive((event) => {
  this.title = event.title
})
.onPageEnd(() => {
  this.loadState = '已完成'
})
.onErrorReceive((event) => {
  this.loadState = '出错'
})
.onHttpErrorReceive((event) => {
  this.guardMsg = 'HTTP 错误 ' + event.response.getResponseCode().toString()
})
```

还有白名单拦截：

```ts
private shouldIntercept(url: string): boolean {
  const isHttp = url.startsWith('http://') || url.startsWith('https://')
  if (!isHttp) {
    return false
  }

  for (const item of this.allowList) {
    if (url.startsWith(item)) {
      return false
    }
  }

  this.guardMsg = '已拦截非白名单地址：' + url
  return true
}
```

这一步是我觉得最容易被忽略的。

很多 demo 只做到“页面能打开”，但真正开发时更常见的问题是：

- 页面打不开，原因是什么？
- 加载到多少了？
- 标题有没有同步？
- 外链能不能随便跳？
- HTTP 资源报错能不能看见？
- H5 调 Native 的请求有没有日志？

这些都属于容器治理。

## 踩坑记录

### 1. 不要一开始就堆概念

ASCF、元服务、小程序生态、Web 容器、JSBridge 这些词一起出现时，新人很容易懵。

我的经验是先抓住一个问题：

> H5 怎么进入 ArkUI？H5 怎么调用 ArkTS？

把这条链路跑通后，再回头理解 ASCF 会轻松很多。

### 2. Bridge 不要写成一堆零散方法

一开始可能会想这样写：

```js
window.native.openToast()
window.native.getDeviceInfo()
window.native.openPage()
```

短期看很直观，但后面方法越来越多，就不好维护。

更好的方式是统一成：

```js
window.ascfBridge.send(JSON.stringify(request))
```

所有能力都通过 `action` 分发。

### 3. runJavaScript 回传要注意字符串安全

ArkTS 拼 JS 字符串时，不能直接把 JSON 拼进去。

比较稳的做法是先对响应 JSON 再做一次 `JSON.stringify`，把它变成合法的 JS 字符串字面量。

这样可以避免引号、换行、特殊字符导致 JS 执行失败。

### 4. 日志面板比想象中重要

真机上调 Web 容器和 JSBridge 时，如果没有日志面板，很难判断问题出在哪。

所以我给 demo 加了两个日志：

- `BridgeLog`：看 H5 和 ArkTS 的桥接请求 / 响应。
- `NetMonitor`：看 REST 请求和 WebSocket 帧。

这两个调试能力会让 demo 从“能跑”变成“能排查问题”。

### 5. Web 容器不是只负责显示页面

Web 容器还要管：

- 加载状态
- 错误状态
- 页面标题
- 资源错误
- HTTP 错误
- 外链拦截
- JS 通信
- 日志追踪

这些才是工程里真正会遇到的问题。

## 总结

如果只从概念看，ASCF 元服务开发容易显得比较抽象。

但如果从 Web 容器切入，就能看到一条很具体的开发链路：

```txt
ArkUI 页面承载 Web
  ↓
Web 加载 H5
  ↓
H5 通过 JSBridge 调 ArkTS
  ↓
ArkTS 按 action 分发 Native 能力
  ↓
ArkTS 用 runJavaScript 把结果回传 H5
  ↓
日志面板记录完整链路
```

我现在对这个 demo 的定位是：

> 它不是一个业务产品，而是一个 ASCF 元服务开发能力的练习场。

通过它可以练到：

- ArkUI 页面组织
- ArkWeb / Web 容器
- JSBridge 协议设计
- ArkTS 和 H5 双向通信
- Native 能力分发
- Web 容器治理
- 网络请求与 WebSocket 调试
- 多模块结构拆分

对新人来说，比起一开始背概念，我更推荐先把这条链路跑通。

只要能清楚讲出：

```txt
为什么需要 Web 容器？
为什么需要 JSBridge？
Bridge 协议怎么设计？
ArkTS 怎么分发 action？
结果怎么回到 H5？
出问题时怎么调试？
```

ASCF 元服务开发就不再只是一个名词，而是一条能落到代码里的工程链路。

## 参考资料

- 华为开发者联盟：元服务开发入门  
  https://developer.huawei.com/consumer/cn/fa/get-started/
- HarmonyOS WebView Codelab：Using WebView  
  https://developer.huawei.com/consumer/en/codelab/HarmonyOS-WebView/
- HarmonyOS FAQ：javaScriptProxy 与 registerJavaScriptProxy 区别  
  https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/faqs-arkweb-20
- demo 仓库：harmony-ASCF-demo  
  https://github.com/lichenyang5/harmony-ASCF-demo
