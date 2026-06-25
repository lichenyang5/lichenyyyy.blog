---
title: "AbilityMeta 能力元信息：不只是能调用，还要能看懂"
description: "光有 action 到 handler 还不够。给每个 Native 能力配一张身份证 AbilityMeta，让能力同时具备执行、展示、分类、权限识别、开关控制五种属性。"
date: 2026-06-23
updated: 2026-06-23
tags: ["HarmonyOS", "ArkTS", "ASCF", "JSBridge", "Web容器"]
category: "Web容器"
source: "harmony-ASCF-demo"
sourceUrl: "https://github.com/lichenyang5/harmony-ASCF-demo"
draft: false
---

# AbilityMeta 能力元信息：不只是能调用，还要能看懂

> 这是「ASCF 架构升级」系列的第 4 篇，对应提交 `5825abb` 的另一半。
> 上一篇讲了为什么用 `NativeAbilityRegistry` 取代 if-else；这一篇专门讲那张「报到表」的另一列：**`AbilityMeta` —— 能力的说明书。**

## 一、先想一个问题：「action → handler」够不够

上一篇里的注册表是这样的：

```ts
register(action: string, handler: NativeAbilityHandler): void
```

一个名字、一个函数。这样能跑吗？能。H5 报 `getDeviceInfo`，注册表查到对应函数、调用、返回结果。**作为「能让 H5 调通」的最小集合，这一对足够了。**

但 demo 跑起来之后，下面这些问题立刻冒出来：

- 调试面板想列「目前底座支持哪些能力」 —— 没地方读
- README 想给读者展示一张能力清单 —— 得人工抄
- 想做权限校验：「这个 H5 想调相册，它配不配？」 —— 没有元信息可查
- BridgeLog 想标注「这条调用属于 device 类、是 mock 实现」 —— 也无从查起
- 想做能力开关：「上线先把支付这个能力关掉」 —— 不知道往哪儿挂状态

这些问题的共性是：**光知道「能调」还不够，得知道「这是个什么东西」。**

对应到产品话术，就是「能力得有说明书」。

## 二、`AbilityMeta` 是什么

文件在 `entry/src/main/ets/bridge/AbilityMeta.ets`：

```ts
export interface AbilityMeta {
  action: string;
  namespace: string;
  description: string;
  permission: string;
  mock: boolean;
  enabled: boolean;
}
```

可以理解为「**能力的身份证**」：以前注册表只记一个名字，现在每个能力都带一张证件，正反面写满字段。

逐字段拆解：

**`action`** —— H5 调用时报的名字，跟 `BridgeAction` 常量一一对应，比如 `'getDeviceInfo'`。

**`namespace`** —— 能力分类，例如 `device / runtime / ui / clipboard / location`。等调试面板做出来，能力会按 namespace 分组显示；BridgeLog 里也会以 `device/getDeviceInfo` 这种格式展现，一眼能看出是哪一类。

**`description`** —— 人话能力说明，比如 `'获取设备信息'`。给两类人看：调试面板上的开发者、自动生成 README 时的读者。

**`permission`** —— 权限标识，目前是字符串：
- `'none'` —— 不需要权限
- `'clipboard.read' / 'clipboard.write'` —— 剪贴板读 / 写
- `'location.mock'` —— 模拟定位

将来真要做权限校验，会有一张「能力 → 需要权限」的表，dispatch 时先查权限再决定调不调。现在先用字符串占位，把这条数据通道打通。

**`mock`** —— 这个能力是否是「模拟实现」。
demo 里像剪贴板（内存模拟）、定位（写死坐标）就是 `mock: true`。打到真机时一眼能看出哪些是「为了能跑而 mock 的」，哪些是「读真实系统的」。这个字段以后还能驱动 UI：模拟能力前面加个「演」字标识，避免演示时被误以为是真功能。

**`enabled`** —— 是否启用。
注册表 `dispatch` 时会查这个字段：能力虽然登记在册，但 `enabled === false` 就回 `ABILITY_DISABLED` (403)，不进 handler。给「能力开关」、「灰度上线」、「应急下线」预留了入口。

## 三、`AbilityMeta` 和 handler 的关系

二者放在同一份记录里：

```ts
export interface RegisteredAbility {
  meta: AbilityMeta;          // 这是个什么东西
  handler: NativeAbilityHandler;  // 怎么做这件事
}
```

可以这么类比：

| | meta | handler |
| --- | --- | --- |
| 类比 | 营业执照 + 业务说明牌 | 真正办事的窗口职员 |
| 内容 | 「我是谁、归哪管、要什么证件、是不是模拟营业、今天开不开门」 | 「来一个我办一个」 |
| 谁来读 | 调试面板、BridgeLog、权限校验、README 生成器 | 注册表的 `dispatch` |
| 静态 / 动态 | 静态（一旦注册一般不变） | 动态（每次请求都跑一次）|

**两者必须同时出现**：注册一个能力的时候，handler 是必填，meta 也是必填。这避免了「有人偷偷塞个 handler 进去不写元信息」这种情况。来看实际注册代码：

```ts
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
```

每个能力都是「**先把说明书填好，再把办事函数交出来**」。这意味着代码里再也没法出现「这能力我也不知道是干嘛的，就是有」的灰色地带。

## 四、为什么 `AbilityMeta` 适合上 BridgeLog / 能力面板 / README

回想一下没有 meta 的 BridgeLog 长什么样：

```
[完成] getDeviceInfo   id req_001   → {...}   ← {...}
[失败] foobar          id t1        → {...}   ← {"code":404, ...}
```

只有 action 名。看着不亏，但回答不了下面这些问题：

- 这是个什么类别的能力？
- 这次调用是 mock 还是真实底座？
- 这能力默认要权限吗？

把 meta 一接上，立马不一样：

```
[完成] device/getDeviceInfo   id req_001  permission=none  mock=true   8ms
[失败] unknown/foobar         id t1                                      3ms  ← code 404
```

同样这条日志，现在能告诉你：

- 这是 device 类能力
- 不需要权限
- 是模拟实现（演示用，不要打包到生产去）
- 总耗时 8 ms

调试面板做出来后，能直接画成一张表：每行 action、namespace、description、permission、mock、enabled、最近调用次数、平均耗时 —— **所有需要的字段，meta 这边已经备齐了**。这就是「把数据备好 ≠ 立即做面板」，但等想做时不用回头补数据。

README 自动生成同理：写一段 markdown 模板遍历 `registry.listAbilities()`，每个 ability 渲染成一行说明 —— 这张能力清单就再也不会因为「忘了同步」而过时。

## 五、用 `getLocation` 举一个完整的例子

来挑一个 demo 里的 `getLocation` 能力，逐字段说说 meta 怎么被用上：

```ts
{
  action: 'getLocation',
  namespace: 'location',
  description: '获取模拟定位信息',
  permission: 'location.mock',
  mock: true,
  enabled: true
}
```

- **`action: 'getLocation'`** —— H5 调用时 `send({ action: 'getLocation', ... })` 就走到这里。
- **`namespace: 'location'`** —— BridgeLog 里这条记录会显示 `location/getLocation`。未来调试面板按 namespace 分组时，它跟其他定位类能力（geocode、reverseGeocode 之类，未来加的话）会被分到同一组。
- **`description: '获取模拟定位信息'`** —— README 自动生成的能力清单里，这条会输出「`location.getLocation` —— 获取模拟定位信息」。
- **`permission: 'location.mock'`** —— 这是个特殊权限标记：「模拟定位」。将来真接定位时，会换成 `'location.read'`，需要的权限就升级了。现在打这个标记，将来做权限校验时一眼能看出来「这能力在 demo 阶段允许，到真机要换」。
- **`mock: true`** —— `NativeAbilityImp.readLocation()` 写死了一组坐标（22.3193, 114.1694），返回 source=mock。BridgeLog 看到 `mock=true` 就知道这条数据不能用于业务决策。
- **`enabled: true`** —— 注册时启用；如果要临时关掉，改成 `false`，再调就会回 403。

一条 meta，让一个能力同时具备「执行」「展示」「分类」「权限识别」「开关控制」五种属性。

## 六、`hasAbility` / `isEnabled` / `listAbilities` 怎么用

`AbilityMeta` 不是只能写不能读。Registry 提供三个读取入口：

```ts
hasAbility(action: string): boolean   // action 是否已注册
isEnabled(action: string): boolean    // 已注册且 enabled=true
listAbilities(): AbilityMeta[]        // 列出所有 meta（不暴露 handler）
```

- **`hasAbility`** —— 「这个 action 我认不认识」的预检；调试面板用它筛已注册名单。
- **`isEnabled`** —— 「这个能力现在能不能调」的预检；UI 上灰显某个按钮的逻辑可以挂在这里。
- **`listAbilities`** —— 直接把所有 meta 倒出来给上层用。

为什么 `listAbilities` 不返回 handler，只返回 meta？因为对外暴露的应该是「能力的描述」，不是「能力的实现」。Handler 是动态的、有副作用的、可能改的；meta 是静态的、能转 JSON 的、可以截屏放进文档的。

## 七、如果要加扫码 / 支付 / 分享，meta 怎么扩

设想一下，明天要加三个能力：扫码、支付、分享。每个能力的 meta 提前先想清楚：

```ts
const scanQrCodeMeta: AbilityMeta = {
  action: 'scanQrCode',
  namespace: 'camera',
  description: '调起扫码界面，识别二维码 / 条形码',
  permission: 'camera.use',
  mock: false,
  enabled: true
};
```

```ts
const requestPaymentMeta: AbilityMeta = {
  action: 'requestPayment',
  namespace: 'payment',
  description: '发起一次支付（需要商户接入）',
  permission: 'payment.request',
  mock: true,         // demo 阶段先 mock 一个支付成功
  enabled: false      // 默认关，需要灰度时再打开
};
```

```ts
const shareTextMeta: AbilityMeta = {
  action: 'shareText',
  namespace: 'social',
  description: '调起系统分享面板分享一段文字',
  permission: 'share.system',
  mock: false,
  enabled: true
};
```

看出门道了吗？**`AbilityMeta` 让「这能力到底什么样」的所有维度都集中在一个对象里**：

- 扫码需要相机权限 —— `permission: 'camera.use'`
- 支付目前是 mock，并且默认不开 —— `mock: true, enabled: false`
- 分享是 UI 层副作用 —— `namespace: 'social'`

如果只有 `action → handler` 的注册方式，这些「能力到底什么样」的信息就会散在四处：权限分布在某个权限校验函数里、是不是 mock 注释在 Imp 文件里、是不是默认开看运维配置文件……每加一个能力都要找一遍。有了 meta，**一处定义、处处使用**。

## 八、新人最容易踩到的几个点

**1. meta 不是注释。**
看上去 meta 字段都是「人话描述」，但它们是 ArkTS 强类型对象，会跟着代码一起被打包、可以被读、可以被序列化。注释不能被代码访问，meta 可以 —— 这是它们的根本区别。

**2. `enabled` 和 `mock` 是两个独立维度。**
新手容易混。`enabled = false` 表示「这能力不能调」，是一个开关；`mock = true` 表示「这能力的实现是模拟的」，是一种性质。一个 mock 能力可以是 `enabled = true`（dem 里能调）；一个真实能力也可以是 `enabled = false`（线上没准备好）。

**3. `permission` 暂时只是字符串。**
当前项目没接真实权限校验框架，`permission` 字段就是个标签，谁都没拿它做拦截判断。但**字段已经在那儿了**，将来加权限校验时，只需要在 `Registry.dispatch` 里加一句 `if (!permissionGranted(reg.meta.permission)) return fail(...)`，整张表的权限要求都生效 —— 这就是「数据先备齐、再做功能」的好处。

**4. meta 必须和 handler 一起注册。**
不存在「先注册 handler，后补 meta」的 API。这是设计上故意的：能力的「身份」和「实现」要么一起出现要么都没有，避免出现「能调但说不出是干嘛」的孤魂能力。

## 我应该能讲出来的 5 个问题

1. 只有 action → handler 的注册方式，会让哪些场景没法做？至少举出三个。
2. `AbilityMeta` 里六个字段（`action / namespace / description / permission / mock / enabled`）分别给什么场景用？请逐个对应。
3. `mock` 和 `enabled` 这两个字段差别在哪？能不能用同一个字段表示？
4. `listAbilities()` 为什么返回 `AbilityMeta[]` 而不是 `RegisteredAbility[]`？
5. 假设明天要加一个 `requestPayment` 能力，且支付权限尚未到位，应该怎么填它的 meta？为什么？
