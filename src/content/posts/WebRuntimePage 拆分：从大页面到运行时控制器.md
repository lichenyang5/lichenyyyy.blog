---
title: "WebRuntimePage 拆分：从大页面到运行时控制器"
description: "把一个什么都管的万能前台，拆成前台、登记簿、门口保安、后台调度员四个角色：WebRuntimePage / WebRuntimeState / WebGuard / WebRuntimeController 各司其职。"
date: 2026-06-23
updated: 2026-06-23
tags: ["HarmonyOS", "ArkTS", "ASCF", "Web容器", "重构"]
category: "Web容器"
source: "harmony-ASCF-demo"
sourceUrl: "https://github.com/lichenyang5/harmony-ASCF-demo"
draft: false
---

# WebRuntimePage 拆分：从大页面到运行时控制器

> 这是「ASCF 架构升级」系列的第 2 篇，对应提交：`5db3c07` / `0180aba`。
> 上一篇讲了重构总览，这一篇专门讲第一刀：**为什么 `WebRuntimePage` 要拆，以及怎么拆。**

如果你第一次看到 `WebRuntimePage.ets`，可能会有点懵：它叫「页面」，但里面塞着 Web 组件的句柄、加载状态、白名单规则、桥接日志、Toast 副作用……这页是不是干太多事了？

是的。所以我们把它拆了。

## 一、原来的 WebRuntimePage 是个「万能前台」

想象一家公司的前台。理想状态下，前台只负责一件事：**把来访的人引导到对应的座位、记一下登记表**。可一旦公司没规矩，前台就什么都要管：

- 客户咨询权限问题 —— 前台答
- 客户问会议室在不在用 —— 前台查
- 客户问公司有没有他要找的工程师 —— 前台拨电话
- 前台还得记着每件事，第二天 review 用

时间一长，前台桌子上堆满了便签、日历、电话本，没人愿意去顶这个班。

重构前的 `WebRuntimePage` 就是这个状态。它的代码里同时活着四种性质完全不同的东西：

1. **展示** —— Web 组件、顶栏、进度条、错误条、桥接日志列表（这是它本应做的）
2. **状态** —— `@Local progress / title / loadState / errorMsg / guardMsg` 五个字段散在 struct 顶部
3. **守卫规则** —— `allowList: string[]` + `shouldIntercept(url)` 写成 struct 的私有方法
4. **运行时操作** —— 持有 `webview.WebviewController`，未来想调用 `reload / runJavaScript / loadUrl` 都在它身上

四件事写在一个文件里，你想改任何一件，都得在另外三件之间穿插翻页。

## 二、为什么不能全部写在 WebRuntimePage 里

很多人会问：「能跑就行，何必拆？」拆有五个非常具体的理由，跟便签贴满前台桌子是一个道理：

**1. 页面会越来越胖。**
每加一个新治理点（HTTP 错误、SSL 错误、文件下载、地理位置请求……）就再往 `@Local` 加一个字段、`build()` 里再加一个条件分支。半年后这个文件再没人愿意打开。

**2. 状态字段会散落到 `@Local` 上。**
当 `loadState / errorMsg / guardMsg` 各占一个 `@Local` 时，「这几个字段一起怎么变」就变成了几条隐式约定：「开始加载得清错误」「加载完成得把进度置 100」「拦截不能修改 loadState」 —— 这些约定**没有任何一处集中表达**。等下一个人接手，每加一条新规则都要去 `@Local` 队列里大海捞针。

**3. 调试困难。**
想验证「白名单是不是真的拦了 example.com」，你只能去整页面渲染、找按钮、看输出。如果白名单逻辑是一个独立的类，你光开个测试就能验。

**4. 多 Web 容器实例难复用。**
如果以后 demo 里要再加一页「H5 帮助中心」，你想把白名单逻辑、加载状态机原样复用过去 —— 但它们卡在 `WebRuntimePage` 的 struct 里，你只能复制粘贴。

**5. 断点不好打。**
断点要打在「业务行为」上才好用：白名单拒掉一个 url 的那一刻、运行时去刷新 webview 的那一刻、状态从「加载中」变到「已完成」的那一刻。如果这些行为都写在页面的 `onXxx` 闭包里、变量直接 `this.xxx =`，断点命中后 Variables 面板看到的全是 `this`（即整个 struct），而不是「这条业务的输入输出」。

## 三、拆完之后的四个角色

把万能前台拆开之后，公司变成下面这样：

| 角色 | 项目里对应 | 在干嘛 |
| --- | --- | --- |
| **前台（接待）** | `WebRuntimePage.ets` | 只管展示 + 绑事件，不再自己做判断 |
| **登记簿（状态）** | `WebRuntimeState.ets` | 集中记录「容器现在处于什么阶段」 |
| **门口保安（守卫）** | `WebGuard.ets` | 进哪扇门要不要放行 |
| **后台调度员（控制器）** | `WebRuntimeController.ets` | 真去操作 webview（导航、刷新、跑 JS）|

这四个角色之间的关系也很清楚：

```
   ┌────────────────────┐
   │  WebRuntimePage    │  布局 + 把事件转给状态/控制器
   └──┬───────────────┬─┘
      │ 写状态        │ 发指令
      ▼               ▼
  ┌──────────────┐  ┌────────────────────┐
  │ WebRuntimeState│ │ WebRuntimeController │ 持有 webview Controller
  └──────────────┘  └─────────┬──────────┘
                              │ 操作前再读 state
                              ▼
                          webview.WebviewController
                          （ArkWeb SDK 句柄）

   onLoadIntercept 里：
   ┌────────────────┐    {allowed, reason, url}
   │   WebGuard     │ ───────────────────────► 写 state.guardMsg / 返回是否拦
   └────────────────┘
```

注意一个细节：`WebRuntimeController` 不直接持有页面，它持有的是 `WebRuntimeState`。这样**控制器永远不需要知道页面长什么样**，反过来页面也不需要知道控制器怎么工作 —— 它们之间只通过状态对话。这是一种很常见的"模型驱动 UI"的写法。

## 四、四个真实文件分别保留了什么

下面贴一下每个文件现在的核心内容，看到熟悉的名字就能立刻对得上。

### WebRuntimePage（前台）

```ts
@HMRouter({ pageUrl: RouterConstants.PAGE_WEB_RUNTIME })
@ComponentV2
export struct WebRuntimePage {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: WebBridgeChannel = new WebBridgeChannel(this.controller);
  private bridgeLog: BridgeLog = getBridgeLog();
  private guard: WebGuard = new WebGuard();

  @Local state: WebRuntimeState = new WebRuntimeState();
  private runtime: WebRuntimeController = new WebRuntimeController(this.state);

  aboutToAppear(): void {
    this.runtime.bindController(this.controller);
    this.bridge.bindToast((msg: string) => {
      this.getUIContext().getPromptAction().showToast({ message: 'Toast: ' + msg, duration: 2000 });
    });
  }

  build() {
    // 顶栏 / 进度条 / 错误条 / 拦截条 / Web / BridgeLog 列表
    // 所有事件回调里只做一件事：调 state.xxx() 或 runtime.xxx()
  }
}
```

页面现在的角色，可以概括成三句话：

- **持有原始句柄**（`controller`、`bridge`、`guard`、`state`、`runtime`） —— 它是仓库管理员，谁要用什么就分发。
- **在 `aboutToAppear` 接线** —— `runtime.bindController(this.controller)` 把 SDK 句柄交给运行时控制器；`bridge.bindToast(...)` 把页面级的 Toast 能力绑给桥（因为 Toast 需要 `UIContext`，只有页面拿得到）。
- **`build()` 里所有事件都转发** —— `onPageBegin → state.resetBeforeLoad`、`onLoadIntercept → guard.check`、`onPageEnd → runtime.updateCurrentUrl + state.markSuccess`。

注意它不再写 `this.loadState = '...'` 这种「自己改自己的字段」，也不再写 `if (url.startsWith(...))` 这种判断逻辑。它从「万能前台」缩成了「合格前台」 —— 接待 + 路由，不做业务。

### WebRuntimeState（登记簿）

```ts
@ObservedV2
export class WebRuntimeState {
  @Trace progress: number = 0;
  @Trace title: string = 'Web 容器';
  @Trace loadState: string = '未开始';     // 未开始 / 加载中 / 已完成 / 出错
  @Trace errorMsg: string = '';
  @Trace guardMsg: string = '';
  @Trace currentUrl: string = '';

  resetBeforeLoad(url: string): void { ... }   // 新一次导航前清场
  markLoading(progress?: number): void { ... } // 推进加载进度
  markSuccess(title?: string): void { ... }    // 加载完成
  markError(message: string): void { ... }     // 主框架致命错
  markBlocked(message: string): void { ... }   // 旁路提示（拦截 / HTTP 错误）
}
```

它做的事情非常单纯：

- **存** —— `progress / title / loadState / errorMsg / guardMsg / currentUrl` 全部放在一处，谁要看就读、谁要改就调动作。
- **暴露有名字的动作** —— `resetBeforeLoad / markLoading / markSuccess / markError / markBlocked`。前面那些「开始加载得清错误」「加载完成得把进度置 100」的隐式约定，现在变成了每个动作的实现细节。状态机长什么样、什么字段一起变 —— 看类顶上那段 ASCII 注释就够了。
- **不引入 UI** —— 不 import 任何 `@Component` 或 `@Builder`，纯数据 + 纯方法，任何地方都可以拿来 new。

### WebGuard（门口保安）

```ts
export interface WebGuardResult {
  allowed: boolean;
  reason: string;
  url: string;
}

export class WebGuard {
  private readonly allowedHosts: string[];   // 默认: ['developer.huawei.com']
  constructor(allowedHosts?: string[]) { ... }

  check(url: string): WebGuardResult {
    // 1) 非 http(s) 一律放行（resource:// / file:// / data: / about:）
    //    —— 鸿蒙 $rawfile 装载本地 H5 也走这一档
    // 2) http://  → 默认拦截
    // 3) https:// → 命中白名单 host（精确或子域）→ 放行；否则拦截
  }
}
```

保安只做一件事：「这个 url，进不进得来？」 返回结果带三个字段：

- `allowed` —— Boolean，给 `onLoadIntercept` 用
- `reason` —— 给用户看的解释（成功理由或者拦截原因，可以直接写进 `state.guardMsg`）
- `url` —— 把检查的 url 原样回带，方便日志和诊断

为什么单独建一个类？因为白名单规则是**一份独立的策略**：今天可能是 `developer.huawei.com`，明天可能加上 `*.consumer.huawei.com`，后天可能要做协议白名单、要做地区白名单。这些变化都关在 `WebGuard` 一个文件里，页面那头永远只调一句 `guard.check(url)`。

### WebRuntimeController（后台调度员）

```ts
export class WebRuntimeController {
  private state: WebRuntimeState;
  private controller: webview.WebviewController | null = null;

  constructor(state: WebRuntimeState) { ... }

  bindController(controller: webview.WebviewController): void { ... }
  loadUrl(url: string): void { ... }       // state.resetBeforeLoad + controller.loadUrl
  reload(): void { ... }                    // controller.refresh
  canGoBack(): boolean { ... }              // controller.accessBackward
  goBack(): void { ... }                    // 仅在 canGoBack 时才真退
  async runJavaScript(script: string): Promise<string> { ... }
  updateCurrentUrl(url: string): void { ... }  // 写 state.currentUrl，不重置其他字段
  getCurrentUrl(): string { ... }
}
```

调度员是页面**唯一**应该用来操作 webview 的入口。

- 它通过 `bindController` 拿到 webview SDK 句柄；
- 提供「让 Web 做事情」的几个动作：导航、回退、刷新、跑脚本、读/写 currentUrl；
- 导航类动作会顺手把状态机推到「加载中」并同步 `currentUrl`；纯读取动作（`canGoBack / getCurrentUrl`）不写状态。

页面以后想加一个「刷新」按钮？只需要写 `onClick(() => this.runtime.reload())` —— 不用动 state、不用动 build。

## 五、从一次页面加载看调用顺序

下面是一次典型的「进入 WebRuntimePage → 加载 ascf_bridge_demo.html → H5 点了一个外链 → 被拦」全流程，每一步会发生什么：

```
1) 路由进入 WebRuntimePage
   │
   ▼ ArkTS 调用生命周期 aboutToAppear()
2) aboutToAppear:
     this.runtime.bindController(this.controller)  ← 把 SDK 句柄注入运行时控制器
     this.bridge.bindToast(...)                    ← 把页面级 Toast 能力绑给桥
   │
   ▼ build() 渲染出 Web 组件
3) Web 组件以 $rawfile('ascf_bridge_demo.html') 为 src，开始加载本地 H5
   │
   ▼ onPageBegin(event):
4) state.resetBeforeLoad(event.url)
     - currentUrl = event.url
     - loadState = '加载中'
     - progress = 0
     - errorMsg = ''
     - guardMsg = ''
   │
   ▼ onProgressChange(event):
5) state.markLoading(event.newProgress)        ← 进度条往前走
   │
   ▼ onTitleReceive(event):
6) state.title = event.title                   ← 顶栏「当前 H5:」更新
   │
   ▼ onPageEnd(event):
7) runtime.updateCurrentUrl(event.url)         ← 重定向之后真实落地的 url
   state.markSuccess()
     - loadState = '已完成'
     - progress = 100
   │
   ── 此时页面渲染稳定，等待 H5 交互 ──
   │
   ▼ H5 里有人点了一个 <a href="https://example.com">
8) onLoadIntercept(event):
     const result = this.guard.check(event.data.getRequestUrl())
       ↳ WebGuard.check('https://example.com')
         → { allowed: false, reason: '已拦截非白名单地址：…', url }
     state.markBlocked(result.reason)
     return true                               ← 告诉 Web 别加载
   │
   ▼ 如果是真的网络错误（比如断网）:
9) onErrorReceive(event):
     if (event.request.isMainFrame()) state.markError(event.error.getErrorInfo())

   或者 HTTP 4xx/5xx:
   onHttpErrorReceive(event):
     state.markBlocked('HTTP 错误 ' + code)
```

可以看到，整条路径上的「业务行为」全部在两个地方发生：

- 写状态 → `state.xxx()`
- 让 Web 做事情 / 接收 url → `runtime.xxx()`
- 安全判断 → `guard.check()`

**页面本身没有一行业务判断。** 这就是「变薄」的具体含义。

## 六、如何用断点验证这次拆分真的生效

光看代码可能还没感觉，调试一遍最有说服力。打开 DevEco Studio，进入 Debug 模式（旁边有个甲虫图标），按下面这个清单分别打几个断点：

**断点 1：`aboutToAppear()` 进入时**

文件：`WebRuntimePage.ets`，方法：`aboutToAppear`。第一行即可。

进入「JSBridge 调试实验室」页面，断点会立刻命中。Variables 面板里看 `this.controller`、`this.bridge`、`this.guard`、`this.state`、`this.runtime` —— 全部是已经实例化好的对象。注意 `this.state` 的 `loadState` 现在还是 `'未开始'`。

**断点 2：`this.runtime.bindController(this.controller)` 这一行**

同一个 `aboutToAppear` 里下一行。

step over 之后，进入 `WebRuntimeController.bindController` 看一眼 `this.controller` 字段从 `null` 变成了实参 —— 这就是 ArkTS 那条 Debug 注释里你已经验证过的事情，但现在你能看到「写到了哪儿」。

**断点 3：`onPageEnd` 回调里**

文件：`WebRuntimePage.ets`，找到 `.onPageEnd((event) => {...})` 闭包的第一行。

加载完成之后断点命中。Variables 面板里看 `event.url` —— 它是 `$rawfile` 解析出来的资源 URL（`resource://...` 之类）。step over 一次进入 `this.runtime.updateCurrentUrl(event.url)`，再 step into 进 `WebRuntimeController.updateCurrentUrl`，可以看到 `this.state.currentUrl` 立刻被赋值。step over 一次进入 `this.state.markSuccess()`，可以看到 `loadState` 从「加载中」翻到「已完成」、`progress` 跳到 100。

这个时候去看顶栏 UI：胶囊从橙色变成绿色 —— 因为 `state` 是 `@ObservedV2` + `@Trace`，字段一变 UI 自动重渲。

**断点 4：`onLoadIntercept` 里的 `this.guard.check(...)`**

文件：`WebRuntimePage.ets`，找到 `.onLoadIntercept((event) => {...})`。

最干净的触发方式：在 `ascf_bridge_demo.html` 临时加一个 `<a href="https://example.com">click</a>` 按钮，点它。

断点命中后 step into `WebGuard.check`，会看到代码走的是 `https://` 分支 → `extractHost` 抽到 `example.com` → 遍历 `allowedHosts` 没命中 → 返回 `{ allowed: false, reason: '已拦截非白名单地址：…', url }`。返回到 `WebRuntimePage` 之后 step over 一次，`state.markBlocked(result.reason)` 把 `guardMsg` 写好，return `true` 把这次加载否决掉。

UI 上你应该看到顶部出现橙色 `🛡 已拦截非白名单地址：…` 提示。

**这套断点能告诉你什么？**

整个拆分有没有生效，全看上面这几个 step into 跳到哪儿：

- **应该跳进 `WebRuntimeState.ets`、`WebGuard.ets`、`WebRuntimeController.ets`**
- **不应该停留在 `WebRuntimePage.ets` 自己里做逻辑**

如果你一路 step over 都没离开过 `WebRuntimePage`，那说明拆分形似神不似，你得回去看看代码是不是没真分出来。

## 七、新人容易误解的点

跑断点的时候，下面几条特别容易让人怀疑「是不是我哪儿没设置对」：

**1. 断点命中不代表页面卡住了。**
ArkTS Debug 暂停的是「当前线程的当前代码位置」 —— UI 渲染、动画、其他线程上的工作其实还在跑（被相应线程的调度策略影响）。所以你看到 Variables 面板停在 `aboutToAppear`，但页面已经渲染出来一部分了，这是正常的，**不代表你的断点没生效**。

**2. 断点暂停是单点暂停，不是「整个进程挂起」。**
有些事件（比如 `onProgressChange`）会在加载过程中**多次触发**。你在第 1 次命中按 continue 之后，下一次触发还会再次命中。看到「断点又跳出来了」不要慌，那是新一次事件。

**3. 页面正常挂载不代表「断点没用上」。**
反过来也成立。有人会想：「我设了断点，怎么页面还是正常加载完了？」 —— 是因为你按了 continue / resume，让程序继续跑下去。如果你想观察某段代码到底执行到哪里，按 Step Over / Step Into，不要按 Resume。

**4. Variables 面板看到的是「当前执行上下文」，不是「全局」。**
- 在 `aboutToAppear` 命中时，`this` 指 `WebRuntimePage` 实例 —— 能看到 `state`、`runtime`、`controller` 等所有字段；
- step into 进 `WebRuntimeController.bindController` 之后，`this` 变成了 `WebRuntimeController` 实例 —— 看到的是它自己的字段。
- 上下文一变，看的就是新对象，不要怀疑「我的字段哪儿去了」 —— 它在调用栈上一层。

**5. `@Trace` 字段值改变后 UI 不会立刻刷新（在断点暂停期间）。**
在断点上修改 `state.loadState = '已完成'`，UI 不会马上跳到「已完成」。因为 ArkUI 重渲发生在事件循环里，而你现在卡住了事件循环。按 continue 之后，UI 会刷新。

## 我应该能讲出来的 5 个问题

读完这一篇，下面这五个问题应该都能脱口而出。

1. 重构前的 `WebRuntimePage` 同时塞着哪四种性质不同的代码？为什么把它们写在一起后会出问题？
2. `WebRuntimeState` / `WebGuard` / `WebRuntimeController` 这三个类各自的职责是什么？为什么 Controller 持有的是 State，而不是 Page？
3. 从「进入页面」到「H5 加载完毕」的过程中，`state.resetBeforeLoad` / `state.markLoading` / `runtime.updateCurrentUrl` / `state.markSuccess` 分别由哪个 Web 回调触发？顺序是什么？
4. 白名单判断现在写在哪个文件？`WebGuard.check` 返回的 `WebGuardResult` 是怎么被 `onLoadIntercept` 用上的？
5. 如何用一组断点验证「页面真的把业务逻辑下沉到了那三个类里」？分别要打在哪几个位置？
