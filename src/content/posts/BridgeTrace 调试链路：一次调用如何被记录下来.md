---
title: "BridgeTrace 调试链路：一次调用如何被记录下来"
description: "一次桥调用失败可能发生在九个环节。BridgeTrace 把请求、响应、耗时、能力元信息、错误栈聚到一条记录里，让失败分类变成结构化的事。"
date: 2026-06-23
updated: 2026-06-23
tags: ["HarmonyOS", "ArkTS", "ASCF", "JSBridge", "调试"]
category: "Web容器"
source: "harmony-ASCF-demo"
sourceUrl: "https://github.com/lichenyang5/harmony-ASCF-demo"
draft: false
---

# BridgeTrace 调试链路：一次调用如何被记录下来

> 这是「ASCF 架构升级」系列的第 5 篇，对应提交 `95def05`（`feat(bridge): enrich bridge trace with ability metadata`）。
> 上一篇讲了 `AbilityMeta` —— 能力的说明书。这一篇讲：**每次桥调用「走完一圈」的完整账单，是怎么被记录下来的。**

## 一、JSBridge 调试为什么不能只看最终结果

调一次桥的「最终结果」就两种：

- H5 上的回调被 `window.__ascfOnResponse` 调用了，拿到一个 JSON
- H5 上的回调超时了，什么都没收到

这两种结果不够用 —— 因为「没收到」可能发生在十几个地方：

1. H5 自己 JS 报错，`send` 都没调出去
2. H5 调了 `send`，但 `window.ascfBridge` 没注入成功，调的是 `undefined`
3. ArkTS 端 `WebBridgeChannel.send` 被调到了，但 `JSON.parse` 失败
4. JSON 解析成功，但请求缺 `id` 或 `action`
5. 请求结构没问题，但 action 在注册表里找不到
6. action 在表里，但 `meta.enabled === false`
7. handler 在执行过程中抛异常
8. handler 返回了，但 `runJavaScript` 回传 H5 时 webview 已销毁
9. H5 上 `window.__ascfOnResponse` 被覆盖或没定义

没有一份完整 trace 时，调这种 bug 的过程就像看一个**只剩谜底没题面的猜谜**：你看到 H5 屏幕上没反应，但不知道是上面九条里的哪一条。

## 二、一次桥接调用至少应该记下什么

trace 不只是「日志」 —— 它是一次桥调用的完整生命账单。理想情况下应该包含这些字段：

| 字段 | 含义 | 为什么要记 |
| --- | --- | --- |
| `id` | 请求唯一 id | 关联请求与响应；H5 那头也按它对账 |
| `action` | 调用的能力名 | 知道是谁出问题 |
| `requestJson` | 完整请求 JSON | 还原入参，复现问题 |
| `responseJson` | 完整响应 JSON | 看返回了什么 |
| `startTime` | 进入桥的时刻（ms） | 算耗时；和 H5 那边的发送时间对账 |
| `endTime` | 响应回出的时刻（ms） | 同上 |
| `cost` | `endTime - startTime`（ms） | 性能分析直接读这个 |
| `status` | `pending / done / error` | UI 状态条用 |
| `code` | 响应码（0 / 400 / 403 / 404 / 500） | 失败分类 |
| `message` | 响应文案 | 失败原因人话版 |
| `success` | `code === 0` | UI 二分用 |
| `namespace` | AbilityMeta.namespace | 分组 / 调试面板 |
| `description` | AbilityMeta.description | 调试时知道这是干嘛的 |
| `permission` | AbilityMeta.permission | 权限相关 bug 时一眼能看 |
| `mock` | AbilityMeta.mock | 模拟实现要标出来 |
| `enabled` | AbilityMeta.enabled（调用时） | 验证「是不是被禁用挡的」|
| `errorStack` | handler 抛错时的栈 | 真正的 root cause |

项目里这些字段都已经在 `BridgeLogEntry` 上了，对应文件 `entry/src/main/ets/bridge/BridgeLog.ets`。它就是项目里那个「BridgeTrace」的本体 —— 只是名字沿用了原来的 BridgeLog。

## 三、Bridge Trace 各自解决了什么问题

回到上一节那「九种失败的可能性」，看看 trace 怎么把它们一一定位：

**「H5 有没有发出请求？」**
看 BridgeLog 列表里有没有这条 id —— 没有，说明 H5 这头 `send` 没被调到，问题在 H5。

**「ArkTS 有没有收到？」**
看 `BridgeLogEntry.requestJson` —— 它原样保留了 H5 发来的 JSON 字符串。能在 trace 里看到这串 JSON，就证明 ArkTS 已经收到。

**「分发到哪个能力了？」**
看 `namespace / action / description` —— 它直接告诉你「这次调用被分发到了 `device/getDeviceInfo` —— 获取设备信息」。如果 namespace 是 `'unknown'`、description 是 `'未知能力'`，那就是 action 名根本没注册。

**「失败是为什么？」**
看 `code`：
- `400` —— 请求结构不对（缺 id 或 action）
- `403` —— action 找到了但 `enabled = false`（被开关挡了）
- `404` —— action 不存在
- `500` —— handler 在执行过程中抛了异常

再配合 `message` 看人话原因。如果 code 是 500，还能看 `errorStack` 拿到真实栈。

**「这能力到底有没有跑慢？」**
看 `cost`。正常 mock 能力个位数 ms。如果出现几百 ms，要么 H5 那头 setTimeout 抢资源、要么 handler 里做了不该做的同步 IO。

这就是为什么 trace 上的每一个字段都不是「凑数」 —— 它对应着一个「调试时会被反复问到」的问题。

## 四、一条 trace 是怎么被写下来的

写入路径在 `NativeAbilityRegistry.dispatch` 内部完成。挑「成功」路径走一遍：

```ts
dispatch(req: BridgeRequest): BridgeResponse {
  const log = getBridgeLog();

  // 1) BAD_REQUEST 兜底（一般 Channel 已经拦了）...

  // 2) 查能力 + 写「请求」段（先把 meta 一并写进 BridgeLogEntry）
  const reg = this.abilities.get(req.action);
  const meta = reg !== undefined ? reg.meta : undefined;
  const entry: BridgeLogEntry = log.onRequest(req, JSON.stringify(req), meta);

  if (reg === undefined) {
    // UNKNOWN_ACTION 路径……
  }
  if (!reg.meta.enabled) {
    // ABILITY_DISABLED 路径……
  }

  try {
    const data = reg.handler(req);
    const resp = BridgeResponses.ok(req.id, data);
    log.onResponse(entry, resp, JSON.stringify(resp));   // 3) 写「响应」段
    return resp;
  } catch (e) {
    // INTERNAL_ERROR 路径：拿到 error.message 和 error.stack
    // 一起回写到 trace
  }
}
```

注意两件事：

**1. `onRequest` 时就把 `meta` 一起记进去。**
不是等响应回来再补。因为「这个能力是谁」是一个静态属性，请求一进门立刻知道。等响应回来再写就晚了 —— 中间任何环节崩溃，trace 上至少能看到 meta。

**2. `onResponse` 时同时计算 `cost = endTime - startTime`。**
两个时间戳都在 BridgeLogEntry 上，diff 自然就出来了。

五条路径在 trace 上的差异：

| 路径 | namespace | description | enabled | code | errorStack |
| --- | --- | --- | --- | --- | --- |
| BAD_REQUEST | `unknown` | `未知能力` | false | 400 | '' |
| UNKNOWN_ACTION | `unknown` | `未知能力` | false | 404 | '' |
| ABILITY_DISABLED | 真实值 | 真实值 | **false** | 403 | '' |
| INTERNAL_ERROR | 真实值 | 真实值 | true | 500 | **非空** |
| OK | 真实值 | 真实值 | true | 0 | '' |

把这张表记住，调试时**看 trace 一眼就能定位是哪一种失败**。

## 五、用 UNKNOWN_ACTION 验证一遍 trace 系统

这一节有一个**重要前提**要先说清：本项目里的 H5 跑在鸿蒙 WebView 里，`window.ascfBridge` 是 ArkTS 通过 `javaScriptProxy` 注入的对象。把 `ascf_bridge_demo.html` 用桌面 Chrome 直接打开 —— **里面不会有 `ascfBridge` 这个全局** —— `ascfBridge.send(...)` 会立刻报 `Cannot read properties of undefined`。

所以「DevTools 控制台调一条 UNKNOWN_ACTION 验证」具体怎么做，有三种现实选择：

### 选择 A：临时给 H5 加一个验证按钮（最快）

在 `ascf_bridge_demo.html` 任意一组现有按钮旁加一行：

```html
<button onclick="window.ascfBridge.send(JSON.stringify({
  id: 't-unknown-' + Date.now(),
  version: '1.0',
  action: 'foobar'
}))">
  测试 UNKNOWN_ACTION
</button>
```

跑起 demo，进「JSBridge 调试实验室」，点这个按钮。下方桥接日志区会出现一条：

```
[失败] unknown/foobar   id t-unknown-XXX   Xms
→ {"id":"t-unknown-XXX","version":"1.0","action":"foobar"}
← {"id":"t-unknown-XXX","code":404,"message":"未知 action: foobar"}
```

打开调试器看 `BridgeLogEntry` 字段，应该是：

```
namespace:   'unknown'
description: '未知能力'
permission:  'unknown'
mock:        false
enabled:     false       ← 注意：因为根本没注册，所以 enabled 维持默认 false
code:        404
message:     '未知 action: foobar'
success:     false
cost:        几个 ms
errorStack:  ''
```

验完把这个临时按钮删掉就行。

### 选择 B：HarmonyOS WebView 远程调试

鸿蒙的 WebView 支持远程调试 —— ArkTS 这边把 webview 开启调试，电脑 Chrome 打开 `chrome://inspect/#devices` 能挂上去。挂上之后就能在 Chrome DevTools 控制台里直接敲：

```js
window.ascfBridge.send(JSON.stringify({
  id: 't1', version: '1.0', action: 'foobar'
}))
```

效果和「选择 A」一样。配置略繁，临时验一次通常不值得；但常驻调试时这套环境很方便。

### 选择 C：ArkTS 端打断点（最稳）

如果只是想确认 trace 系统在五条路径上工作正常，**不必触发 UNKNOWN_ACTION**：

- 正常路径：点 H5 任何一个已有按钮，断点打在 `NativeAbilityRegistry.dispatch` 的 `log.onResponse(...)`，看 Variables 面板里 `entry.namespace / cost / code / success` 是否都对。
- ABILITY_DISABLED：临时把 `NativeAbilityBiz.registerTo` 里某个 meta 的 `enabled: true` 改成 `false`，点对应按钮，断点打在「`if (!reg.meta.enabled)`」分支，看返回的 resp 是否 403。
- INTERNAL_ERROR：临时在 `NativeAbilityImp.readDeviceInfo()` 第一行 `throw new Error('mock-boom')`，点设备信息按钮，断点打在 catch 段，看 `errorStack` 是否被填进了 entry。

走完三类后，UNKNOWN_ACTION 是唯一需要外部触发的 —— 这时再回选择 A 临时加个按钮就行。

## 六、Bridge Trace 对新人调试的价值

调桥这件事，**反复出问题的是「中间环节」**：不是 H5 没发、不是 ArkTS 没收，而是「发出来了但中间某步出错」。新人最大的痛苦就是：

- 用 console.log 调，但日志都在 H5 那边、ArkTS 那边、两边各看一半
- 用断点调，但断点打错地方、没命中
- 用 try/catch 加 alert，搞了半天发现 alert 都没出现

trace 解决的核心问题是**「把所有相关信息聚到一处」**：

1. **一条调用，一条 trace。** 不用拼接日志、不用找上下文 —— 同一个 id 下面，请求、响应、耗时、meta、错误栈，全部在一行里。
2. **失败分类是结构化的。** 不靠看 message 字符串猜，看 code + namespace + enabled 三个字段就能 5 秒定位是哪一种。
3. **能在生产用。** trace 是 `@ObservedV2` + `@Trace`，UI 上就能直接呈现。开发模式下打开调试面板，QA 不用懂代码也能截屏给开发看。
4. **不依赖 console。** ArkTS 的 console 不一定都能直观看到（HiLog 里翻日志成本不低）；trace 是真正的内存数据，挂在 `getBridgeLog()` 单例上，任何地方都能读。
5. **数据为未来的功能保留入口。** 想做调试面板？读 `entries`。想做异常告警？监听 `status === 'error'`。想做性能监控？看 `cost`。trace 数据是开放的，未来加任何观测能力都不需要回头补字段。

新人最容易踩的两个坑：

- **以为「我看不到 UI 显示就是没记 trace」。** 错。trace 是数据，UI 是渲染。即便 WebRuntimePage 上的桥接日志区不显示 cost，trace 数据里 `cost` 字段也是有值的，去断点里看 entry 对象本身。
- **以为「`pending` 状态就是 trace 出问题了」。** 不是。`pending` 只是 trace 默认值。本项目里因为 dispatch 是同步的，pending 几乎是一瞬，UI 上肉眼基本看不到。如果你看到一直停在 pending，那确实是 handler 卡住了 —— 这反而是 trace 在告诉你「这次调用永远没回」。

## 我应该能讲出来的 5 个问题

1. 调一次桥失败，可能发生在哪些环节？BridgeTrace 是怎么帮你区分这些环节的？
2. `BridgeLogEntry` 的 17 个字段里，哪几个是 `onRequest` 时写的、哪几个是 `onResponse` 时写的？为什么 meta 要在 `onRequest` 时就写进去？
3. UNKNOWN_ACTION、ABILITY_DISABLED、INTERNAL_ERROR 这三种失败的 trace 长什么样？在 namespace / enabled / errorStack 字段上能看出什么差别？
4. 为什么本项目的 H5 不能直接用桌面 Chrome 打开 + 控制台敲 `ascfBridge.send`？要验 UNKNOWN_ACTION，新人有哪几种现实做法？
5. BridgeTrace 这套数据为「调试面板」「异常告警」「性能监控」「README 自动生成」分别预留了什么入口？
