---
title: "鸿蒙 Web 容器（二）：H5 和 ArkTS 说话前，先定一份「协议」"
description: "H5 里的 JS 和原生 ArkTS 怎么互相说话？通信之前先别急着写逻辑——这篇用「快递面单」的比方，把 JSBridge 的请求与响应消息格式定死。"
date: 2026-06-13
updated: 2026-06-13
tags: ["HarmonyOS", "JSBridge", "Web容器", "协议设计"]
category: "Web容器"
source: "原创"
draft: false
---

> 这是「ArkWeb / JSBridge」系列的第 2 篇，对应 demo 提交 2：`定义JSBridge通信协议`。

上一步，H5 页面已经能嵌进鸿蒙原生页面了。但马上有个问题：**H5 里的 JS 和原生的 ArkTS，到底怎么互相说话？**

如果不约定格式，双方就会开始「乱传字符串」——这次传 `"getDeviceInfo"`，下次传 `"device|info|now"`，再下次传一坨 JSON……很快就没法维护。所以正经做法是：**通信之前，先把消息格式定死。** 这一步不写逻辑，只定协议。

## 一、类比：协议就是「快递面单」

H5 调用 ArkTS，本质是「寄一个请求过去，等一个回执回来」。那就照快递来设计：

**寄件（H5 → ArkTS，叫 `BridgeRequest`）面单上要有：**
- **单号 `id`** —— 每次调用一个唯一编号；
- **寄到哪个能力 `action`** —— 比如「获取设备信息」；
- **包裹内容 `params`** —— 这次调用的参数。

**回执（ArkTS → H5，叫 `BridgeResponse`）上要有：**
- **对应单号 `id`** —— 这张回执是回哪一次的；
- **成功还是失败 `code`** —— 0 成功，非 0 失败；
- **说明 `message`** + **返回的东西 `data`**。

写成 ArkTS 就是两个 interface：

```ts
export interface BridgeRequest {
  id: string;                       // 单号
  action: string;                   // 寄到哪个能力
  params?: Record<string, string>;  // 包裹内容
}

export interface BridgeResponse {
  id: string;                       // 对应单号
  code: number;                     // 0 成功 / 非 0 失败
  message: string;
  data?: Record<string, string>;
}
```

## 二、为什么非得有个 `id`？

因为**桥上的调用是异步的**。H5 发起「获取设备信息」后，ArkTS 可能要处理一会儿才回。期间 H5 还可能又发了「获取时间」。等两个回执都回来时，H5 怎么知道哪张回执对应哪次请求？

**靠 `id` 配对**——就像快递单号：你同时寄了仨包裹，回执上印着单号，你一眼就知道哪张对哪个。没有 `id`，多个调用一并发就乱套了。

## 三、`action` 是「能力名」，不是让 H5 直接碰原生

注意 H5 永远不直接调鸿蒙 API，它只在面单上写一个 **能力名**：

```ts
export class BridgeAction {
  static readonly GET_DEVICE_INFO = 'getDeviceInfo';
  static readonly GET_CURRENT_TIME = 'getCurrentTime';
  static readonly OPEN_TOAST       = 'openToast';
}
```

H5 说「我要 `getDeviceInfo`」，至于这个能力具体怎么实现，是原生那边的事（下一步做「按 action 找实现」的分发）。这跟小程序里 H5 只会写 `wx.getSystemInfo()` / `my.xxx()`、底层由宿主实现，是**一模一样的思路**——前端只认 API 名，不关心底座怎么做。

## 四、再加一本「桥接账本」

光有协议还不够，调试时我想看清**每一次桥上到底发生了什么**。所以顺手加了个 `BridgeLog`（`@ObservedV2` 单例，和之前的网络调试面板 `NetMonitor` 一个套路）：每来一次请求记一条 `pending`，回了响应就更新成 `done`/`error`，把「H5 发了什么、ArkTS 收到什么、返回了什么」三段都存下来。后面页面上会有个区域实时显示它。

## 一句话总结

**通信前先定协议，等于寄快递前先统一面单格式：请求带 `id`/`action`/`params`，响应带对应 `id`/`code`/`message`/`data`，`id` 负责把异步回执认领回正确的调用，`action` 是「能力名」让前端只认 API 不碰原生。** 格式定死了，下一步 H5 就能照这个格式发消息、ArkTS 照这个格式收——这条链路的前半截就能跑起来了。
