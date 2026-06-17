---
title: "鸿蒙 Web 容器（一）：怎么把 H5 页面嵌进鸿蒙页面？"
description: "活动页、帮助中心这类页面常用 H5 塞进原生壳。这篇走通第一步：鸿蒙怎么用 Web 组件把一个本地 H5 嵌进原生页面，并把进度、标题、错误管起来。"
date: 2026-06-12
updated: 2026-06-12
tags: ["HarmonyOS", "ArkWeb", "WebView", "Web容器"]
category: "Web容器"
source: "原创"
draft: false
---

> 这是「ArkWeb / JSBridge」系列的第 1 篇，对应 demo 提交 1：`feat(ascf): add web runtime demo page`。

很多 App 里都有「长得像网页」的页面——活动页、帮助中心、用户协议、营销落地页。这些东西用原生一个个写既慢又难改，常见做法是：**写成 H5，塞进原生壳里**。这就是所谓的「混合开发（Hybrid）」。

那第一个问题就来了：**鸿蒙怎么把一个 H5 页面嵌进自己的原生页面里？** 这篇就把这第一步走通。

## 一、一句话：开一扇「窗」

把鸿蒙的 `Web` 组件想象成原生页面里开的**一扇窗**：

- **窗户本身** = `Web` 组件，占据页面的一块区域；
- **窗里显示什么** = `src`，给它一个网页地址；
- **遥控器** = `WebviewController`，用来刷新 / 前进 / 后退 / 之后调 JS；
- **窗户上的传感器** = 一堆回调，告诉你「加载到百分之几了」「网页标题是什么」「有没有报错」。

原生页面只管把这扇窗摆好、把传感器接上，窗里那张网页怎么画，是 Web 内核（ArkWeb）的事。

## 二、本地 H5 放哪、怎么被找到

这次我们嵌的是**本地** H5（不是远程网址），它就放在工程的：

```
entry/src/main/resources/rawfile/ascf_bridge_demo.html
```

`rawfile` 是鸿蒙专门放「原样打包、不被编译」的资源目录。引用它用一个特殊函数 `$rawfile('文件名')`，它会被解析成这个文件的资源地址。所以窗里要显示这张本地网页，就是：

```ts
Web({ src: $rawfile('ascf_bridge_demo.html'), controller: this.controller })
```

> 远程页面也一样，把 `src` 换成 `'https://...'` 即可（但要在 `module.json5` 声明 `ohos.permission.INTERNET`，工程已声明）。

## 三、把容器「管」起来：进度 / 标题 / 错误

光能显示还不够，一个像样的容器得知道网页此刻什么状态。这一步我接了最基础的几个「传感器」回调：

```ts
Web({ src: $rawfile('ascf_bridge_demo.html'), controller: this.controller })
  .onPageBegin(() => { this.loadState = '加载中'; })        // 开始加载
  .onProgressChange((e) => { this.progress = e.newProgress; }) // 进度 0~100
  .onTitleReceive((e) => { this.title = e.title; })          // 网页 <title>
  .onPageEnd(() => { this.loadState = '已完成'; })            // 加载完成
  .onErrorReceive((e) => { this.errorMsg = e.error.getErrorInfo(); }) // 资源出错
```

把这几个值绑到顶栏上，就有了进度条、网页标题、加载状态、错误提示——这就是「**容器治理**」最朴素的雏形。后面第 5 步还会把它补全（HTTP 错误、白名单拦截等）。

## 四、为什么这一步用「标准 Web」，没用 AtomicServiceEnhancedWeb？

工程里其实装了 `@atomicservice/ascfapi`，它提供了一个 `AtomicServiceEnhancedWeb`——专为元服务（原子化服务）做的「增强版 Web」。它**强在容器治理**：进度、标题、错误、HTTP 错误、资源拦截这些回调全是现成的。

但我翻了它的类型定义，发现它的控制器**只有** `loadUrl / refresh / forward / backward …`，**没有** `javaScriptProxy` 和 `runJavaScript`——而这两个恰恰是「H5 调 ArkTS、ArkTS 调 H5」这座**双向桥**的官方原语。所以从第 2 步开始要搭桥，我选了带这两把钥匙的**标准 `Web` 组件**。至于 `AtomicServiceEnhancedWeb` 到底「增强了什么」、什么时候该用它，留到系列最后一篇专门对比。

## 一句话总结

**嵌一个 H5，就是在原生页面里开一扇 `Web` 窗：`src` 指向网页（本地用 `$rawfile`）、`controller` 当遥控器、一组回调当传感器盯住进度/标题/错误。** 这一步只验证「鸿蒙页面能嵌入 Web 页面」；下一步，我们先把 H5 和 ArkTS 之间「怎么说话」的协议定下来，免得后面乱传字符串。
