---
title: "ASCF 架构升级总览：WebRuntimePage 为什么要变薄"
description: "重构不是加功能，而是把一个什么都管的胖页面拆成角色明确的小文件。这是 ASCF 架构升级系列的开篇，回答为什么要折腾这一通。"
date: 2026-06-23
updated: 2026-06-23
tags: ["HarmonyOS", "ArkTS", "ASCF", "Web容器", "重构"]
category: "Web容器"
source: "harmony-ASCF-demo"
sourceUrl: "https://github.com/lichenyang5/harmony-ASCF-demo"
draft: false
---

# ASCF 架构升级总览：WebRuntimePage 为什么要变薄

> 这是「ASCF 架构升级」系列的开篇，对应 demo 的几次重构提交：
> `5db3c07` / `0180aba` / `5825abb` / `95def05`。
> 后续四篇会把每一处拆开细讲，本篇只回答一个问题：**为什么要折腾这一通。**

写过几个练习项目的人，大概都遇到过这种页面：一开始就是一个组件，写着写着，几百行了，又是状态、又是事件、又是治理、又是日志。下次回头看，自己都得花十分钟才能找到「真正想改的那一行」在哪。

`WebRuntimePage` 就快变成这样了。它是 demo 里挂 H5 的页，从最早的「能加载一张本地网页」一路堆到了「能跑 JSBridge 闭环、能拦白名单、能展示桥接日志」。功能没问题，但页面越来越胖，胖到自己都觉得别扭。

这次的几次提交，没有加任何新功能。只做了一件事：**把这个胖页面拆成几个角色明确的小文件**。

## 一、原来的 WebRuntimePage 是怎么变胖的

挑一段重构前的代码看一眼（这是我从 `git show` 里拎出来的旧版片段）：

```ts
@ComponentV2
export struct WebRuntimePage {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: WebBridgeChannel = new WebBridgeChannel(this.controller);

  @Local progress: number = 0;
  @Local title: string = 'Web 容器';
  @Local loadState: string = '未开始';
  @Local errorMsg: string = '';
  @Local guardMsg: string = '';

  private readonly allowList: string[] = ['https://developer.huawei.com'];

  private shouldIntercept(url: string): boolean {
    const isHttp = url.startsWith('http://') || url.startsWith('https://');
    if (!isHttp) {
      return false;
    }
    for (const a of this.allowList) {
      if (url.startsWith(a)) {
        return false;
      }
    }
    this.guardMsg = '已拦截非白名单地址：' + url;
    return true;
  }

  build() {
    // ……顶栏、进度条、错误条、Web、日志列表……一大段 UI
  }
}
```

这段代码里其实**塞了四件性质完全不同的事**：

1. **页面长什么样** —— `build()` 里的顶栏、进度条、Web 组件、桥接日志列表。
2. **页面现在是什么状态** —— `progress / title / loadState / errorMsg / guardMsg` 五个 `@Local`。
3. **白名单怎么算** —— `allowList` + `shouldIntercept`。
4. **未来怎么操作 Web 容器** —— 隐含的 `controller.refresh() / runJavaScript() / loadUrl()` 等调用。

单独看每一件都不复杂，合到一起就开始打架：改第 3 件的白名单逻辑，需要滑过第 1 件的布局代码；想给第 4 件加一个 reload 按钮，得先理清第 2 件的状态字段会不会被牵连。

## 二、为什么「页面组件」和「运行时逻辑」要拆开

这就是「能跑」和「能讲清楚」的区别。代码能编译能运行，但一个新人接手得花半个小时才能在脑子里把这个文件画成一张图。

可以把鸿蒙的 `@ComponentV2` 想象成**演员**：它负责站在台上演给用户看 —— 进度条往前走、错误条变红、日志列表滚动。而下面那些「白名单怎么判」「Web 句柄怎么调」「现在到底是不是加载中」其实是**剧本和后台**：它们不上台，但决定演员该演什么。

把剧本写在演员台词里也能演，但有三个直接的麻烦：

- **想换个剧本不容易**。比如想给一个新的 H5 容器页复用白名单逻辑，得把这段代码连根挖出来。
- **想单独测试剧本几乎做不到**。`shouldIntercept` 写在 struct 里，得渲染整个页面才能测它。
- **状态字段散在 `@Local` 上**。状态之间的关系（「开始加载就要清错误」「加载完成就要进度置 100」）变成了几条隐式约定，没在任何一处集中表达。

所以这次的拆法很直白：演员（页面）只管演，剧本（状态、操作、治理）各回各家。

## 三、这次新出现的几个角色都是干嘛的

对应到提交里就是这几个文件：

```
entry/src/main/ets/webcontainer/
  WebRuntimeState.ets        ← 状态
  WebGuard.ets               ← 白名单 / URL 安全判断
  WebRuntimeController.ets   ← 操作（让 Web 做事情）

entry/src/main/ets/bridge/
  AbilityMeta.ets            ← 给每个 Native 能力发「身份证」
  NativeAbilityRegistry.ets  ← 升级成「带元信息」的能力注册表
  BridgeLog.ets              ← BridgeTrace：每次调用都记一条完整账单
```

逐个用大白话讲一遍。

**WebRuntimeState** —— Web 容器现在处在什么阶段。
一个 `@ObservedV2` 的小类，把 `progress / title / loadState / errorMsg / guardMsg / currentUrl` 这一组「会随着加载而变的字段」放到一处。还提供几个**有名字的动作**：`resetBeforeLoad / markLoading / markSuccess / markError / markBlocked`。页面想说「现在开始加载了」，不再 `this.loadState = '加载中'`，而是 `state.resetBeforeLoad(url)` —— 名字本身就在解释意图。

**WebGuard** —— URL 给不给放行。
原来散在页面里的「http 还是 https、是不是白名单」抽出来变成一个类，调一次 `guard.check(url)`，返回 `{ allowed, reason, url }`。页面里就只剩一句话：「如果不允许，记一笔 guardMsg，告诉 Web 别加载」。规则本身怎么改、要不要加协议白名单、要不要支持子域 —— 全在 WebGuard 这一个文件里。

**WebRuntimeController** —— 想让 Web 做点什么时调它。
封装 `loadUrl / reload / goBack / canGoBack / runJavaScript / updateCurrentUrl / getCurrentUrl`，底下持有 `webview.WebviewController` 句柄。`bindController(controller)` 之后，页面上想刷新就是 `runtime.reload()`、想在 H5 里跑一段 JS 就是 `await runtime.runJavaScript(script)` —— 再也不需要在页面里直接戳 SDK 的方法。

**AbilityMeta** —— 每个 Native 能力的「身份证」。
小程序里 `wx.getSystemInfo` 这种 jsapi 不止有一个名字，还带「权限要求 / 是不是 mock / 调用说明」等等。本项目里仿照这个思路给每个 action 配了一份 meta：

```ts
{
  action: 'getCurrentTime',
  namespace: 'runtime',
  description: '获取当前时间',
  permission: 'none',
  mock: false,
  enabled: true
}
```

六个字段各有用场：`namespace` 给调试面板分组、`description` 给 README 自动生成文档、`permission` 给未来加权限校验、`mock` 给开发者一眼看出哪些是模拟实现、`enabled` 给运营态做能力开关。现在这些字段还没有全部用上，但**有就比没有强** —— 不然每次想做点新东西都要回去补数据。

**NativeAbilityRegistry** —— 能力注册表。
原来是 `Map<string, handler>`，现在是 `Map<string, { meta, handler }>`。注册一个能力同时要交出它的身份证：`registry.register(meta, handler)`。多了几个查询方法：`listAbilities() / getAbility(action) / isEnabled(action)`，准备给后续的调试面板、能力文档、权限校验用。

**Bridge Trace** —— 每次桥调用都记一条「完整账单」。
原来的 `BridgeLogEntry` 只记 `id / action / requestJson / responseJson / status`。这次扩成了一条完整 trace：还要记**这个能力是谁**（namespace、description、permission、mock、enabled）、**这次调用花了多久**（startTime / endTime / cost）、**回复了什么**（code / message / success）、**炸了的话栈是什么**（errorStack）。一行账单写满，下游做调试面板就有现成数据。

## 四、完整链路串起来长什么样

H5 里点一下按钮，背后发生的全过程是这条路：

```
H5 页面 点击按钮
   │
   ▼  window.ascfBridge.send(JSON.stringify(req))
WebBridgeChannel.send(jsonStr)              ← 通道层
   │ 解析 JSON / 校验 id 和 action
   │ 解析失败 / 缺字段 → 直接回 BAD_REQUEST，并自己写一条 trace
   ▼
BridgeDispatcher.dispatch(req)              ← 薄入口（一行委托）
   │
   ▼
NativeAbilityRegistry.dispatch(req)         ← 真正的分发器
   │ 在 Map 里按 action 查 RegisteredAbility
   │ 检查 meta.enabled，命中后调 handler
   │ 顺手把 meta + 耗时 + 响应写进 BridgeLog
   ▼
NativeAbilityBiz.<方法>                     ← 业务层（从 req.params 抠参数）
   │
   ▼
NativeAbilityImp.<方法>                     ← 实现层（真去读 deviceInfo / Date / 内存剪贴板）
   │
   ▼  Record<string, string>
回到 Registry：包成 BridgeResponse { id, code, message, data }
   ▲
   │
WebBridgeChannel.sendBack(respJson)
   │ controller.runJavaScript('window.__ascfOnResponse(...)')
   ▼
H5 页面 收到回调
```

这条路上每一段都有专门的角色管，每一段都有专门的文档讲。本系列后续几篇会沿着这条路从上到下分别细写。

## 五、这不是「加功能」，是把 demo 从「能跑」整理成「能讲清楚」

本次几次提交的 diff 加起来不少行，但**功能数没变**：

- H5 上的按钮一个没多
- Native 能力还是那六个（`getDeviceInfo / getCurrentTime / openToast / setClipboardData / getClipboardData / getLocation`）
- 路由 / 白名单 / Toast / NetMonitor / TodoTab 一切照旧

变的是**结构**。这种工作叫「重构」：行为不变，结构变。重构的产出不是新功能，是三件事：

1. **能讲清楚** —— 新人指着一个文件名能立刻说出它是干什么的。
2. **能扩展** —— 想加权限校验，不用动 Channel、不用动 Page，只在 Registry 拿到 meta 时多写一句。
3. **能调试** —— BridgeTrace 已经把所有要看的信息记齐，做调试面板时不用再补字段。

很多人一上来就想「这次提交加了什么新功能」，但其实**结构调整本身就是一种产出**。它让后面所有功能都更容易加上去。

## 六、怎么验证这一次的改动没把功能弄丢

重构最大的风险是「改完发现以前能跑的功能现在跑不起来」。新人接手时，可以照下面这个清单走一遍：

1. 跑起 demo → 进入「JSBridge 调试实验室」。
2. 看顶栏 → 应该出现「加载中」胶囊 + 进度条短暂可见 + 加载完成后变成「已完成」。
3. 点 H5 中的「获取设备信息」按钮 → 下方桥接日志区出现一条 `device/getDeviceInfo` 蓝色标签 + `完成 Xms` 胶囊；H5 上自己的最近结果区也能看到设备品牌。
4. 点「显示 Toast」 → 屏幕底部弹出鸿蒙原生 Toast。
5. 在 H5 页面里临时加一个外链按钮，链到 `https://example.com` 这种不在白名单里的地址，点一下 → 顶部出现 `🛡 已拦截非白名单地址：…`。
6. 顶栏的「← 返回」按钮可以正常退出页面。

只要这六件事都还在，就说明这次重构没把 demo 弄坏 —— 任何看上去合理的「升级」如果让以上任何一条不工作，那都不是升级，是回退。

## 七、新人推荐阅读顺序

不要按提交时间线读，**按调用链从外到内读**：

1. **`WebRuntimePage.ets`** —— 看 UI 和事件入口，了解一个「Web 容器页」长什么样。
2. **`WebRuntimeController.ets`** —— 看页面想让 Web 做事情时走哪儿。
3. **`BridgeProtocol.ets`** —— 看 H5 和 ArkTS 之间约定的请求/响应格式。
4. **`BridgeDispatcher.ets`** —— 看请求进 ArkTS 之后是怎么分流的。
5. **`NativeAbilityRegistry.ets` + `AbilityMeta.ets`** —— 看一个 Native 能力是怎么登记、怎么被找到的。
6. **`ascf_bridge_demo.html`** —— 最后回到 H5 那边，看页面是怎么调桥、怎么收回调的。

读完这一圈，本系列剩下几篇文档随便挑哪篇切入都不会迷路。

## 我应该能讲出来的 5 个问题

读完这一篇，下面这五个问题应该都能脱口而出。如果还卡，那就回去再翻一遍对应章节。

1. 原来的 `WebRuntimePage` 里同时塞着哪四种不同性质的代码？
2. `WebRuntimeState` 和 `WebRuntimeController` 这两个文件的职责差别在哪？
3. `AbilityMeta` 里那六个字段（`action / namespace / description / permission / mock / enabled`）分别是为什么场景准备的？
4. 从 H5 点击一个按钮到收到回调，请求一路经过了哪几个文件？请按调用顺序说出来。
5. 这次的几次提交为什么算「重构」而不是「加功能」？重构的产出体现在哪里？
