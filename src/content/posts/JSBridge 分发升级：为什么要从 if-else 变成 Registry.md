---
title: "JSBridge 分发升级：为什么要从 if-else 变成 Registry"
description: "按 action 找能力这一步，if-else 写到几十个分支就成了垃圾桶。换成 NativeAbilityRegistry 注册中心之后，主流程闭合、业务开放。"
date: 2026-06-23
updated: 2026-06-23
tags: ["HarmonyOS", "ArkTS", "ASCF", "JSBridge", "Web容器"]
category: "Web容器"
source: "harmony-ASCF-demo"
sourceUrl: "https://github.com/lichenyang5/harmony-ASCF-demo"
draft: false
---

# JSBridge 分发升级：为什么要从 if-else 变成 Registry

> 这是「ASCF 架构升级」系列的第 3 篇，对应提交 `5825abb`（`refactor(bridge): add ability metadata registry`）的一部分。
> 本篇专门讲：**桥的「分发层」为什么不再写 if-else，而改用一个注册中心。**

## 一、先看「分发」到底是干嘛

回顾一下整条桥的路径：H5 调 `window.ascfBridge.send(...)`，请求经 `WebBridgeChannel` 解析成 `BridgeRequest`，下一步就是「**按 action 找到对应能力执行**」 —— 这一步叫**分发**。

H5 那头扔过来的请求长这样：

```json
{ "id": "req_001", "version": "1.0", "action": "getDeviceInfo", "params": {} }
```

ArkTS 这头要回答的问题就一个：「`getDeviceInfo` 这个能力，由谁实现？」

可能性有六个：`getDeviceInfo / getCurrentTime / openToast / setClipboardData / getClipboardData / getLocation`。还有「这个 action 名字根本不存在」这种第七种情况。

## 二、最朴素的写法：if-else 大法

很容易想到一种写法：把所有可能的 action 全写成 if 一条条匹配。

```ts
// 一种「看上去能用」的分发
dispatch(req: BridgeRequest): BridgeResponse {
  try {
    if (req.action === 'getDeviceInfo')      return ok(req.id, biz.getDeviceInfo());
    if (req.action === 'getCurrentTime')     return ok(req.id, biz.getCurrentTime());
    if (req.action === 'openToast')          return ok(req.id, biz.openToast(msg));
    if (req.action === 'setClipboardData')   return ok(req.id, biz.setClipboardData(text));
    if (req.action === 'getClipboardData')   return ok(req.id, biz.getClipboardData());
    if (req.action === 'getLocation')        return ok(req.id, biz.getLocation());
    return fail(req.id, 404, '未知 action: ' + req.action);
  } catch (e) {
    return fail(req.id, 500, '能力执行出错');
  }
}
```

第一眼看像没问题：能跑、能区分成功失败、未知 action 也能给 404。所以新手项目里这种代码极常见。问题是 —— 它能撑到能力数 < 5 个，撑不到 50 个。

## 三、为什么 if-else 越长越像「垃圾桶」

把上面的代码再想象一下，等 demo 后面加到 30 个 action：

```ts
if (req.action === 'getDeviceInfo')      ...
if (req.action === 'getCurrentTime')     ...
if (req.action === 'openToast')          ...
// ……再过 25 行……
if (req.action === 'scanQrCode')         ...
```

这玩意有几个非常具体的麻烦：

**1. 主流程每加一个能力都要动一刀。**
今天加扫码，明天加支付，后天加文件选择 —— 每加一个，都要去 `dispatch` 里塞一个 if 分支。这违反了一个朴素的工程直觉：**「加一个东西，不该需要修改原有代码」**。

**2. 分发主流程会变成「所有人都来加东西」的公共仓库。**
设备相关同事来加一行、UI 相关同事来加一行、剪贴板相关同事来加一行 —— 这个文件没有真正的所有者，谁都改一刀就走，merge 冲突频发。这就是「垃圾桶现象」：一个东西没有明确归属之后，所有人都往里扔。

**3. 主流程会被「业务噪声」淹没。**
理想中，分发主流程只应该问一个问题：**「这个 action 我认不认得？认得就调它的实现。」** 但当 30 个分支挤在 `dispatch` 里时，主流程已经看不出这个意图，全是业务名词。新人来读，得分清「哪些是分发框架」「哪些是具体能力」 —— 而它们本应是两层东西。

**4. 错误处理的位置容易混乱。**
异常该统一兜底（500 INTERNAL_ERROR），但当 `try/catch` 包住 30 行 if 时，谁都搞不清自己那段代码到底有没有被 catch 兜住、有没有被前面某个 if 提前 return。

**5. 单元测试基本写不了。**
你想测「未知 action 一定返回 404」？得 mock 整个 biz、mock 整个 imp、再跑 `dispatch`，不然 if 链就会先撞上某个能力。

## 四、换一个思路：把能力做成「报到表」

回到现实生活，要是公司里能办 30 件业务，前台不会在脑子里背 30 个 if，而是手边一本**业务名册**。来人报「我要办身份证」，前台翻名册：

| 业务名 | 经办窗口 |
| --- | --- |
| 身份证 | 1 号 |
| 户口本 | 2 号 |
| 居住证 | 3 号 |
| …… | …… |

名册和前台是分开的。新增业务的时候，**不用改前台**，去名册上多加一行就行。

这就是 `NativeAbilityRegistry` 在做的事情。代码上它就是一个 `Map`，键是 action 名，值是「能力本体」。

```ts
export class NativeAbilityRegistry {
  private abilities: Map<string, RegisteredAbility> = new Map();

  register(meta: AbilityMeta, handler: NativeAbilityHandler): void {
    const reg: RegisteredAbility = { meta: meta, handler: handler };
    this.abilities.set(meta.action, reg);
  }

  hasAbility(action: string): boolean {
    return this.abilities.has(action);
  }

  dispatch(req: BridgeRequest): BridgeResponse {
    // ……一会儿细讲……
  }
}
```

三件事：

- **`register(meta, handler)`** —— 在名册上登一笔
- **`hasAbility(action)`** —— 名册里有没有这个名字
- **`dispatch(req)`** —— 来一笔请求，按名字翻表、执行、统一包响应

你能立刻看出，「分发」这件事现在和具体业务**完全无关** —— 不论将来注册 1 个还是 100 个能力，`dispatch` 的代码一行不用动。

## 五、`NativeAbilityBiz.registerTo(registry)` 这种写法

「往名册里登一笔」具体在哪写？项目里放在 `NativeAbilityBiz.registerTo(registry)`：

```ts
export class NativeAbilityBiz {
  registerTo(registry: NativeAbilityRegistry): void {
    const deviceInfoMeta: AbilityMeta = {
      action: BridgeAction.GET_DEVICE_INFO,
      namespace: 'device',
      description: '获取设备信息',
      permission: 'none',
      mock: true,
      enabled: true
    };
    registry.register(deviceInfoMeta, (req: BridgeRequest): Record<string, string> => {
      return this.getDeviceInfo();
    });

    const currentTimeMeta: AbilityMeta = {
      action: BridgeAction.GET_CURRENT_TIME,
      namespace: 'runtime',
      description: '获取当前时间',
      permission: 'none',
      mock: false,
      enabled: true
    };
    registry.register(currentTimeMeta, (req: BridgeRequest): Record<string, string> => {
      return this.getCurrentTime();
    });

    // ……其他四个能力类似……
  }
}
```

这种写法的意义在于：

**Biz 是「能力清单的来源」，Registry 是「能力清单的载体」。**
Biz 知道自己提供哪些能力、每个能力的元信息是什么；Registry 不关心是谁来登记的、只负责存好和查得到。两个职责清晰分开。

**新增能力时只动一处：`registerTo`。**
想加一个新能力，比如「读取设备网络状态」，只需要在 `NativeAbilityBiz.registerTo` 里多一段：

```ts
const netStatusMeta: AbilityMeta = {
  action: 'getNetworkStatus',
  namespace: 'device',
  description: '获取网络连接状态',
  permission: 'none',
  mock: false,
  enabled: true
};
registry.register(netStatusMeta, (req): Record<string, string> => {
  return this.getNetworkStatus();
});
```

`BridgeDispatcher` 不动，`NativeAbilityRegistry` 不动，整条分发主流程对这次新增**毫无感知** —— 这就是「主流程闭合，业务开放」的具体体现。

## 六、`BridgeDispatcher` 现在还干啥

那 `BridgeDispatcher` 自己呢？它瘦成了非常薄的一层：

```ts
export class BridgeDispatcher {
  private biz: NativeAbilityBiz = new NativeAbilityBiz();
  private registry: NativeAbilityRegistry = new NativeAbilityRegistry();

  constructor() {
    this.biz.registerTo(this.registry);   // 启动时把 Biz 提供的能力登进名册
  }

  dispatch(req: BridgeRequest): BridgeResponse {
    return this.registry.dispatch(req);   // 转手就交给名册
  }

  // 读取层快捷方法（给 BridgeLog / 调试面板 / README 用）
  getAbilityMeta(action: string): AbilityMeta | undefined { ... }
  listAbilities(): AbilityMeta[] { ... }
}
```

整个 `BridgeDispatcher` 没有一句 `if (req.action === '...')`。它只是把「构造时让 Biz 注册一次」和「运行时把请求转给 Registry」这两个操作串起来。**它的代码量永远不会随能力数增长。**

## 七、用 `getDeviceInfo` 走一遍完整流程

把这条链路用具体的 action 跑一遍，会非常直观。

H5 里点了「获取设备信息」按钮，发出这条请求：

```json
{ "id": "req_001", "version": "1.0", "action": "getDeviceInfo", "params": {} }
```

```
Step 1: WebBridgeChannel.send(jsonStr)
  - JSON.parse 成 BridgeRequest
  - 校验 id / action 都有
  - 把 req 交给 dispatcher

Step 2: BridgeDispatcher.dispatch(req)
  - 一行委托：return this.registry.dispatch(req)

Step 3: NativeAbilityRegistry.dispatch(req)
  - 检查 req.id / req.action 都在 → OK
  - this.abilities.get('getDeviceInfo')
    → 命中！拿到 RegisteredAbility { meta, handler }
  - 检查 meta.enabled === true → OK
  - 调用 handler(req)

Step 4: handler 内部
  - 调 NativeAbilityBiz.getDeviceInfo()
  - 这个方法又调 NativeAbilityImp.readDeviceInfo()
  - Imp 读 deviceInfo.brand / productModel / osFullName
  - 返回 Record<string, string>
    { brand: 'HUAWEI', model: 'XXX', osVersion: 'HarmonyOS X.X' }

Step 5: Registry 把 handler 返回值包成 BridgeResponse
  { id: 'req_001', code: 0, message: 'success', data: {...} }

Step 6: WebBridgeChannel.sendBack(respJson)
  - controller.runJavaScript('window.__ascfOnResponse(...)')

Step 7: H5 收到回调
```

整条路径上**没有任何一处 `if (action === ...)` 判断**。注册表查到就调、查不到就 404、handler 抛错就 500 —— 主流程就这三条规则。

## 八、UNKNOWN_ACTION 为什么能统一返回 404

来看看 H5 故意发一个不存在的 action，比如：

```json
{ "id": "t1", "version": "1.0", "action": "foobar" }
```

走到 `NativeAbilityRegistry.dispatch` 时：

```ts
dispatch(req: BridgeRequest): BridgeResponse {
  // ...
  const reg = this.abilities.get(req.action);   // → undefined
  if (reg === undefined) {
    return BridgeResponses.fail(req.id, BridgeCode.UNKNOWN_ACTION, '未知 action: ' + req.action);
  }
  // ...
}
```

`Map.get` 没命中返回 `undefined`，一个 `if` 兜住，统一回 404。

这件事如果在 if-else 写法里 —— 「未知 action」是写在 if 链最末尾的 fallback。每加一个新能力，那个 fallback 都得防止被误删；忘了写它，H5 那头连错误码都收不到，请求就在 ArkTS 里**悄无声息地丢了**。注册表的写法里，「未知」是结构性的、不会忘记的。

ABILITY_DISABLED 也是同理：能力在表里，但 `meta.enabled === false`，统一回 403。这种「按结构而非按枚举」的错误处理，是注册表带来的额外红利。

## 九、和微信小程序 / ASCF 底座的呼应

这种写法不是项目里发明的，而是几乎所有「宿主 + 多业务」架构都长这样。

**小程序的 jsapi 注册**就是这个模式。`wx.getSystemInfo()`、`wx.scanCode()`、`wx.chooseLocation()` —— 这些不是基础库里的 if 链，而是宿主在启动时往一张「jsapi 表」里注册每一个名字对应的实现。小程序基础库版本升级新增 API，不会修改宿主的分发主流程，只会**多注册几条**。

**ASCF 元服务对底座能力的暴露**思路一致。ASCF 提供的接口（设备、UI、网络、定位……）在底座侧是一组注册项，元服务侧通过统一的桥调用，谁能调、谁不能调由能力表 + 权限元信息一起决定。

这就是为什么本项目把 `NativeAbilityRegistry` 单独写出来 —— 它不是为了「让代码好看」，而是把 ASCF 真实的底座抽象在 demo 尺度内还原一遍：你在 demo 里看到的注册表，几乎就是真实底座那张表的小号缩影。

## 十、新人最容易看走眼的地方

- 「`dispatch` 没有 if，是不是少写了什么？」 —— 没有少写。`Map.get` 已经替你做了 30 行 if 链的事情，并且更快。
- 「为什么 `registerTo` 是 Biz 的方法，而不是 Registry 的？」 —— 因为「登记什么」属于 Biz 的知识（它知道自己有哪些能力），「怎么存」才属于 Registry。让 Biz 主动 `registerTo(registry)` 比让 Registry 反过来「问」 Biz 要清单更符合所有权方向。
- 「`BridgeDispatcher` 看着没存在感，能不能直接删掉？」 —— 不能。它是 `WebBridgeChannel` 唯一面对的入口；删掉后，Channel 得直接持有 Registry 和 Biz，反而变重。`Dispatcher` 的薄正是它的价值。

## 我应该能讲出来的 5 个问题

1. 为什么 if-else 写分发，行数到 30 之后就开始痛苦？至少举出三条具体麻烦。
2. `NativeAbilityRegistry` 内部存的数据结构是什么？`register / hasAbility / dispatch` 各自做什么？
3. 加一个新能力，至少要改哪几个文件？哪些文件**一定不用动**？
4. UNKNOWN_ACTION 在 Registry 里是怎么自然产生 404 的？为什么这种「结构性兜底」比 if-else 末尾的 fallback 更可靠？
5. 把这个写法和微信小程序的 jsapi 注册、ASCF 底座的能力暴露对应起来，相似点和不同点各有什么？
