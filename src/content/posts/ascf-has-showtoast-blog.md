---
title: "从 has.showToast 看 ASCF 的 API 调用链路"
date: 2026-07-02
category: HarmonyOS
tags:
  - HarmonyOS
  - ASCF
  - JSBridge
  - ArkUI
description: "通过 has.showToast 这条简单 API，理解 ASCF 中逻辑层 API 暴露、能力 key 映射、底层模块注册和鸿蒙系统能力调用的完整链路。"
---

# 从 `has.showToast` 看 ASCF 的 API 调用链路

今天继续沿着 ASCF Runtime 的源码地图往下看，没有继续泛泛看目录，而是选了一个最简单的 API：`has.showToast`。

选择它的原因很简单：它功能明确、参数少、结果可见，非常适合作为理解 ASCF API 调用链路的第一个切入点。

这次主要想搞清楚一个问题：

> 为什么开发者可以直接调用 `has.showToast({ title, duration })`，然后鸿蒙侧就能弹出 Toast？

---

## 一、从业务调用开始

业务侧调用大概是这样：

```js
has.showToast({
  title: '保存成功',
  duration: 1500
})
```

一开始我以为 `has` 可能是通过 `import` 导入的对象，但实际观察后发现，业务侧并不需要手动导入。

也就是说，`has` 更像是 ASCF 逻辑层在初始化阶段注入到 JavaScript 全局环境中的 API 命名空间。

可以先这样理解：

```text
逻辑层初始化
  ↓
收集可用 API
  ↓
生成 API 暴露清单
  ↓
挂载到全局 has 对象
  ↓
开发者可以直接调用 has.showToast
```

所以，`has.showToast` 的第一步不是模块导入，而是**运行时全局对象注入**。

---

## 二、逻辑层：`has.showToast` 是怎么暴露出来的

继续看逻辑层后，可以发现 `showToast` 并不是孤立存在的函数，而是通过一套 API 暴露机制挂到 `has` 上的。

大致链路可以理解为：

```text
逻辑层 UI 交互模块
  ↓
通过 requireAPI 获取 system.prompt 能力
  ↓
暴露 showToast / hideLoading 等方法
  ↓
统一 API 入口收集 showToast
  ↓
加入 hasInterfaceList
  ↓
框架初始化时将 hasInterfaceList 赋值给全局 has
  ↓
开发者调用 has.showToast
```

其中比较关键的是 `requireAPI('system.prompt')`。

它可以理解为逻辑层连接底层能力的一个中转站。逻辑层不直接关心底层具体怎么实现 Toast，而是通过 `system.prompt` 这个能力标识，拿到底层对应的能力代理。

所以，`has.showToast` 在逻辑层本质上大概是：

```text
has.showToast(params)
  ↓
requireAPI('system.prompt').showToast(params)
```

这里的 `params` 主要包含：

```js
{
  title: '提示内容',
  duration: 1500
}
```

---

## 三、底层核心层：`system.prompt` 是怎么注册的

逻辑层能通过 `system.prompt` 找到底层能力，前提是底层核心层提前注册了这个能力。

继续看底层核心层后，可以看到它会在 API 初始化阶段注册 Prompt 相关能力。

大致链路是：

```text
API 初始化
  ↓
懒加载 Prompt 能力模块
  ↓
创建 Prompt 能力实例
  ↓
注册到模块映射表
  ↓
key = system.prompt
  ↓
value = Prompt 能力模块实例
```

可以抽象成：

```text
moduleMap.set('system.prompt', () => new PromptModule())
```

这一步非常关键。

它说明 `system.prompt` 不是随便写的字符串，而是逻辑层和底层核心层之间约定好的能力标识。

逻辑层说：

```text
我要调用 system.prompt 里的 showToast
```

底层核心层说：

```text
system.prompt 我认识，它对应 Prompt 能力模块
```

于是两边就通过这个 key 对上了。

---

## 四、底层能力：`showToast` 最终如何执行

在 Prompt 能力模块中，`showToast` 是一个被框架声明过的底层能力方法。

它通过方法元信息声明了几个关键点：

```text
alias: showToast
callback: true
params:
  - title: 必填，字符串
  - duration: 可选，数字，有默认值
```

这说明底层 `showToast` 不只是一个普通函数，而是一个可以被 JS 侧通过桥接调用的方法。

它的核心职责是：

```text
接收 option
  ↓
读取 title
  ↓
读取 duration
  ↓
组装 toastOption
  ↓
调用鸿蒙 ArkUI 的 PromptAction 能力
  ↓
展示 Toast
```

也就是说，ASCF 自己并不是重新画了一个 Toast，而是把业务侧传入的参数转换成鸿蒙 ArkUI Prompt 能力需要的参数，最后交给系统能力完成展示。

底层最终会落到类似这样的能力上：

```text
PromptAction.showToast / openToast
```

可以理解为：

```text
ASCF has.showToast
  ↓
PromptModule.showToast
  ↓
ArkUI PromptAction
  ↓
鸿蒙系统 Toast
```

---

## 五、完整链路总结

把上下两段合起来，`has.showToast` 的完整链路大概是：

```text
业务代码
has.showToast({ title, duration })
  ↓
全局 has 对象
  ↓
逻辑层 showToast API
  ↓
requireAPI('system.prompt').showToast(params)
  ↓
桥接 / 能力代理
  ↓
底层模块映射表查找 system.prompt
  ↓
找到 PromptModule
  ↓
执行 PromptModule.showToast(option)
  ↓
读取 title 和 duration
  ↓
组装 toastOption
  ↓
调用 ArkUI PromptAction
  ↓
展示 Toast
```

这条链路可以拆成两部分：

```text
上半链路：逻辑层负责暴露 API
下半链路：底层核心层负责注册和执行真实能力
```

更简洁地说：

> `has.showToast` 是逻辑层暴露给业务侧的 UI 提示 API，底层通过 `system.prompt` 找到 Prompt 能力模块，再由 Prompt 模块调用鸿蒙 ArkUI 的 Toast 能力完成展示。

---

## 六、这条链路说明了 ASCF API 的一种通用模式

通过 `showToast`，可以初步看出 ASCF API 调用的一种通用设计：

```text
全局 API 对象
  ↓
逻辑层 API 暴露
  ↓
能力 key
  ↓
底层能力 Map
  ↓
能力模块实例
  ↓
具体鸿蒙系统能力
```

对应到 `showToast` 就是：

```text
has.showToast
  ↓
requireAPI('system.prompt').showToast
  ↓
system.prompt
  ↓
PromptModule
  ↓
ArkUI PromptAction
```

这比单纯看一个函数更重要。

因为后面分析其他 API 时，也可以按这个模板去找：

```text
1. 这个 API 是否挂到了 has 上？
2. 它在逻辑层属于哪个模块？
3. 它通过哪个能力 key 调到底层？
4. 底层 Map 是否注册了这个 key？
5. 对应的能力模块是什么？
6. 这个模块里有没有对应方法？
7. 最后调用了哪个鸿蒙系统能力？
```

---

## 七、以后排查 `has.showToast` 问题可以怎么查

如果以后遇到 `has.showToast` 不弹，可以按这条链路排查：

```text
1. 全局 has 是否存在？
2. has.showToast 是否存在？
3. 逻辑层 showToast 是否正确暴露？
4. requireAPI('system.prompt') 是否能拿到能力？
5. 底层 moduleMap 是否注册了 system.prompt？
6. PromptModule 是否初始化成功？
7. showToast 方法是否被正确声明和暴露？
8. title 参数是否为空或类型错误？
9. duration 是否异常？
10. ArkUI PromptAction 是否真正执行？
```

这样就能把一个“Toast 不弹”的问题，从现象拆成不同层级的问题，而不是一上来就在源码里乱搜。

---

## 八、今日理解

今天通过 `has.showToast` 这条简单 API 链路，初步理解了 ASCF 中一个 API 从业务调用到底层能力执行的完整过程。

目前可以总结为：

```text
逻辑层负责让开发者能调用 has.showToast
底层核心层负责注册 system.prompt 能力
PromptModule 负责实现 showToast
ArkUI PromptAction 负责真正展示 Toast
```

这条链路虽然简单，但很适合作为 ASCF API 排查的第一个模板。

后续再分析更复杂的 API，比如网络、存储、媒体、设备能力时，也可以沿用这套方法：

```text
先看 API 如何暴露
再看能力 key 如何映射
再看底层模块如何注册
最后看系统能力如何调用
```

先看懂一条最简单的链路，再去看更复杂的能力，会比直接翻所有 API 更清晰。
