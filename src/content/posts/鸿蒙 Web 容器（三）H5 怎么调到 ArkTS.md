---
title: "鸿蒙 Web 容器（三）：H5 怎么「调」到 ArkTS？"
description: "协议定好了，这篇跑通链路的上半场：用 javaScriptProxy 给 H5 装一部「内线电话」，让网页里的点击真正送达原生 ArkTS。"
date: 2026-06-14
updated: 2026-06-14
tags: ["HarmonyOS", "JSBridge", "Web容器", "ArkWeb"]
category: "Web容器"
source: "原创"
draft: false
---

> 这是「ArkWeb / JSBridge」系列的第 3 篇，对应 demo 提交 3：`H5按钮通过JSBridge发请求给ArkTS`。

协议定好了（上一篇），现在跑这条链路的**上半场**：H5 里的 JS 怎么把一个请求送到原生 ArkTS 手里？

## 一、给 H5 装一部「内线电话」

H5 跑在 Web 内核里，原生 ArkTS 跑在应用进程里，两边本来互不相通。要让 H5 能「打电话」给 ArkTS，得有人在 H5 的 `window` 上**装一部内线电话**。

鸿蒙标准 `Web` 组件提供的 `javaScriptProxy` 就是干这个的——它把一个 **ArkTS 对象**注入成 H5 里的一个全局对象：

```ts
Web({ src: $rawfile('ascf_bridge_demo.html'), controller: this.controller })
  .javaScriptProxy({
    object: this.bridge,        // 要暴露的 ArkTS 对象
    name: 'ascfBridge',         // 注入到 H5 后叫 window.ascfBridge
    methodList: ['send'],       // 允许 H5 调的方法（白名单）
    controller: this.controller
  })
```

注册之后，H5 里就凭空多了个 `window.ascfBridge`，上面有个 `send` 方法。**这就是上一篇说的「AtomicServiceEnhancedWeb 没有、标准 Web 才有」的桥原语之一**——`javaScriptProxy`（另一个是回头要用的 `runJavaScript`）。

> 注意 `methodList` 是**白名单**：只有列进去的方法 H5 才调得到，没列的碰不着。这是第一道安全闸。

## 二、H5 这头：把请求装进信封，拿起电话

H5 点按钮时，按上一篇的 `BridgeRequest` 格式拼一个对象，序列化成字符串，丢进 `send`：

```js
function callNative(action, params) {
  var req = { id: 'req_' + Date.now() + '_' + (++seq), action: action, params: params || {} };
  if (window.ascfBridge && window.ascfBridge.send) {
    window.ascfBridge.send(JSON.stringify(req));   // ← 打电话给 ArkTS
  }
}
```

三个按钮分别拨 `getDeviceInfo` / `getCurrentTime` / `openToast`。**为什么传字符串而不是对象？** 因为桥两头是两套运行时，传结构化对象容易在边界上「失真」，统一序列化成 JSON 字符串最稳——所以协议里 `id/action/params` 全约定好，两边各自 `JSON.stringify` / `JSON.parse`。

## 三、ArkTS 这头：接电话、拆信封、先记一笔

被注入的那个对象 `this.bridge`，它的 `send` 方法就是「电话铃响」的地方：

```ts
export class WebBridgeChannel {
  send(jsonStr: string): void {
    const req = WebBridgeChannel.parse(jsonStr);   // 拆信封：JSON.parse → BridgeRequest
    if (req === null) { return; }                  // 非法/缺字段直接丢
    getBridgeLog().onRequest(req, jsonStr);         // 先记一笔到桥接账本
    // 提交4：按 action 分发到能力；提交5：把结果回拨给 H5
  }
}
```

**本步到此为止**——只「收到 + 记日志」，先不处理真实能力。页面下方那个「桥接日志 · ArkTS 收到」面板读的就是这本账本（`@ObservedV2` 单例），你点 H5 按钮，`action / id / 原始请求` 会实时蹦出来，状态先是「待处理」。这样就肉眼确认了：**H5 的点击，真的送到 ArkTS 了。**

## 四、为什么先不处理能力、只记日志？

因为这一步要单独验证「**通道本身通不通**」。把「通道」和「能力实现」拆开验，出问题好定位：现在如果日志能蹦出来，就说明注入、调用、序列化、接收这一串没问题；接不到，就是桥没接通——和具体能力无关。这跟之前 demo 里「先验证 WebSocket 通道、再谈业务」是同一个思路。

## 一句话总结

**`javaScriptProxy` 给 H5 装了部内线电话 `window.ascfBridge`（`methodList` 是白名单），H5 把 `BridgeRequest` 序列化成字符串丢进 `send`，ArkTS 在 `send` 里拆包、先记一笔账。** 上半场（H5 → ArkTS）就通了；下一步让 ArkTS 真去「按 action 找能力实现」。
