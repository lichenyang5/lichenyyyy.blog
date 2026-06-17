---
title: "鸿蒙 Web 容器（四）：ArkTS 拿到请求后，怎么按 action 找能力？"
description: "ArkTS 收到了 H5 的请求，接下来怎么按 action 找到对应能力、执行、再包成统一回执？这篇把小程序「按 API 名分发到底座」那套亲手复刻一遍。"
date: 2026-06-15
updated: 2026-06-15
tags: ["HarmonyOS", "JSBridge", "Web容器", "ASCF"]
category: "Web容器"
source: "原创"
draft: false
---

> 这是「ArkWeb / JSBridge」系列的第 4 篇，对应 demo 提交 4：`新增BridgeDispatcher按action分发到模拟底座能力`。

上一步，ArkTS 已经能收到 H5 发来的 `BridgeRequest` 了，但只是「记了一笔」。这一步让它**真去干活**：根据 `action` 找到对应能力、执行、把结果包成统一的 `BridgeResponse`。

## 一、类比：分发器就是「政务大厅前台」

你去政务大厅办事，不会直接冲进某个科室，而是先到**前台**说「我要办身份证」。前台按业务名在名册里一查，把你指到对应窗口；窗口办完，给你一张**统一格式的回执**。

桥的这一层就是这个前台，叫 `BridgeDispatcher`：

- H5 报一个**业务名** `action`（`getDeviceInfo` / `getCurrentTime` / `openToast`）；
- 分发器按 action 找到**对应能力实现**；
- 办完，把结果**统一包成 `BridgeResponse`**（成功/失败一个格式）。

```ts
dispatch(req: BridgeRequest): BridgeResponse {
  try {
    if (req.action === BridgeAction.GET_DEVICE_INFO) return ok(req.id, biz.getDeviceInfo());
    if (req.action === BridgeAction.GET_CURRENT_TIME) return ok(req.id, biz.getCurrentTime());
    if (req.action === BridgeAction.OPEN_TOAST)       return ok(req.id, biz.openToast(msg));
    return fail(req.id, 404, '未知 action: ' + req.action);   // 名册里没有
  } catch (e) {
    return fail(req.id, 500, '能力执行出错');                  // 窗口办砸了
  }
}
```

**这正是小程序的运行机制**：H5 写 `wx.getSystemInfo()`，小程序宿主收到后按这个 API 名去找它的底座实现。我们这里把「宿主按 API 名分发」这件事，用 `BridgeDispatcher` 亲手复刻了一遍。

## 二、能力实现：分两层，和 demo 其他切片一样

具体能力没有都堆在分发器里，而是照 demo 一贯的分层拆成 Biz / Imp：

- **`NativeAbilityImp`（实现层）**：真去调系统能力。`getDeviceInfo` 读 `deviceInfo.brand / productModel / osFullName`，`getCurrentTime` 读 `Date`。**它扮演的就是「ASCF 里 C++/NDK 底座」的角色**——前端只认 action，底座具体怎么实现（读系统、调 NDK）归这层。
- **`NativeAbilityBiz`（业务层）**：编排 Imp。现在多是透传，但它是预留「参数校验 / 数据加工 / 多能力组合」的地方。

```ts
// Imp：真正读底座能力
readDeviceInfo(): Record<string, string> {
  return { brand: deviceInfo.brand, model: deviceInfo.productModel, osVersion: deviceInfo.osFullName };
}
```

> `openToast` 是「效果」类能力，真弹出需要页面的 `UIContext`，这层拿不到，所以本步先回执一个 mock，下一步在页面层接真实 Toast。

## 三、为什么「统一返回结构」这么重要？

不管成功、未知 action、还是执行炸了，**回的都是同一个形状** `BridgeResponse { id, code, message, data }`：

- 成功 → `code: 0` + `data`；
- 没这个能力 → `code: 404`；
- 执行异常 → `code: 500`（`try/catch` 兜住，绝不让一个能力的崩溃把整座桥带塌）。

H5 那头就能用一套逻辑处理所有结果：看 `code` 判断成败，不用为每个 action 写不同的解析。**桥的健壮性，一半靠这个「不管怎样都给一张格式统一的回执」。**

## 四、现在能看到什么

`WebBridgeChannel.send` 在记完请求后，多了一步 `dispatcher.dispatch(req)`，并把响应也记进账本。所以页面底部那条日志，状态会从「待处理」翻成「完成」，下面多出一行 `↩` 开头的响应 JSON——点「获取设备信息」，你会看到真实的设备品牌/型号被 ArkTS 取出来、包成 `BridgeResponse` 记了下来。只差最后一步：把它**送回 H5**。

## 一句话总结

**分发器像政务大厅前台：H5 报业务名 `action`，它按名册找到对应能力（`NativeAbilityImp` 扮演底座、`Biz` 做编排），办完统一包成 `BridgeResponse`——成功、未知、异常都是同一个形状，`try/catch` 保证一个能力崩了不连累整座桥。** 这就是小程序「按 API 名分发到底座」的核心。下一步，把这张回执真正回传给 H5，闭环就成了。
