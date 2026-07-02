---
title: "从一个按钮开始，理解 ASCF 框架到底在做什么"
date: 2026-07-01
category: HarmonyOS
tags:
  - HarmonyOS
  - ASCF
  - JSBridge
  - WebView
  - 小程序运行时
description: "这是一篇基于公开资料和个人 Demo 思路整理的 ASCF 框架理解文章，不涉及任何内部源码细节。"
---

# 从一个按钮开始，理解 ASCF 框架到底在做什么

最近在学习 ASCF，也就是 Atomic Service Cross Framework。

一开始看到这个框架时，很容易把它理解成一个“WebView 套壳”。

但是继续往下看，会发现它其实不是一个简单的 WebView，也不是一个普通组件库，而是一套面向元服务场景的小程序运行时框架。

它要解决的问题大概是：

> 已经有一套小程序生态的开发方式，如何让这些页面、生命周期、组件、API 调用和系统能力，在鸿蒙元服务里跑起来？

这篇文章不涉及任何内部源码细节，只从公开资料、Demo 设计和个人理解出发，尝试用一个最小模型解释 ASCF 的核心思想。

---

## 1. 问题从哪里来

假设我们有一个很简单的 H5 页面。

页面里只有一个按钮：

```html
<button onclick="openCamera()">打开相机</button>

<script>
function openCamera() {
  window.ascfBridge.send({
    id: Date.now(),
    action: 'camera.open',
    params: {
      mode: 'photo'
    }
  })
}
</script>
```

这个按钮看起来很简单。

但是问题来了：H5 本身不能直接调用鸿蒙系统的相机能力。

它最多只能调用浏览器或 WebView 暴露出来的能力。

那么，点击这个按钮之后，真正发生了什么？

我们需要一套中间系统，负责把：

```text
H5 / 小程序 JS 调用
```

转换成：

```text
鸿蒙原生能力调用
```

这就是 ASCF 这类运行时框架要解决的核心问题。

---

## 2. ASCF 不是一个单独模块，而是一套运行时

如果只看表面，ASCF 好像只是让小程序代码能在元服务中运行。

但是换个角度看，它其实至少要做三件事：

```text
第一，让页面显示出来。
第二，让 JS 逻辑跑起来。
第三，让 JS 能调用鸿蒙原生能力。
```

所以可以先把它理解成三层：

```text
ASCF Runtime
├── 底层核心层
├── 逻辑层
└── 视图层
```

这三层分别解决不同问题。

---

## 3. 底层核心层：接住鸿蒙能力

底层核心层可以理解为 ASCF 在鸿蒙侧的运行时底座。

它负责的不是具体业务，而是把整个运行时撑起来。

它大概会处理这些事情：

```text
应用生命周期
Web 容器
页面路由
资源加载
JSBridge 通信
原生 API 调用
同层渲染组件
包管理
公共工具
```

比如，元服务启动后，需要有人接住启动事件，创建运行时上下文，准备 Web 容器，加载页面资源，建立通信桥。

这些事情就属于底层核心层的职责。

可以这样理解：

```text
鸿蒙应用启动
  ↓
底层核心层接管生命周期
  ↓
创建运行时上下文
  ↓
准备 Web 容器和路由系统
  ↓
启动逻辑层和视图层
```

它更像是整个框架的地基。

---

## 4. 逻辑层：让小程序代码跑起来

逻辑层可以理解为小程序运行时的大脑。

它主要关心这些问题：

```text
App 怎么注册？
Page 怎么注册？
Component 怎么创建？
生命周期什么时候触发？
事件怎么分发？
API 怎么注册？
JS 如何调用原生能力？
```

如果写过微信小程序，对下面这些东西应该很熟悉：

```js
App({
  onLaunch() {},
  onShow() {},
  onHide() {}
})

Page({
  data: {},
  onLoad() {},
  onShow() {},
  onReady() {},
  onUnload() {}
})

Component({
  properties: {},
  data: {},
  methods: {}
})
```

这些代码本身只是 JS 配置。

逻辑层要做的事情，就是把这些配置变成真正能运行的实例，并且在正确的时机触发生命周期。

比如页面第一次加载时：

```text
加载页面 JS
  ↓
执行 Page({...})
  ↓
创建页面实例
  ↓
触发 onLoad
  ↓
通知视图层渲染
  ↓
视图层渲染完成
  ↓
触发 onReady
```

所以逻辑层的重点不是“画页面”，而是“组织页面逻辑”。

它负责让小程序的 JS 代码像小程序一样运行起来。

---

## 5. 视图层：把页面画出来

视图层可以理解为 ASCF 的渲染层。

它关心的是：

```text
页面结构如何渲染？
组件如何注册？
样式如何解析？
用户事件如何监听？
数据变化后如何更新 UI？
```

如果逻辑层负责“算”，那么视图层负责“画”。

比如逻辑层有一份页面数据：

```js
{
  title: 'Hello ASCF',
  count: 1
}
```

视图层要把它渲染成页面：

```html
<view>
  <text>Hello ASCF</text>
  <button>点击次数：1</button>
</view>
```

当用户点击按钮，视图层捕获事件，再把事件传给逻辑层：

```text
用户点击
  ↓
视图层捕获事件
  ↓
通知逻辑层
  ↓
逻辑层执行事件处理函数
  ↓
逻辑层更新数据
  ↓
视图层重新渲染
```

所以，视图层不是普通页面代码，而是一套面向小程序组件模型的渲染运行时。

---

## 6. 三层合起来之后，链路长什么样

我们可以用一个按钮点击事件来串起来。

假设页面上有一个按钮：

```html
<button onclick="chooseImage()">选择图片</button>
```

点击之后，希望调用鸿蒙系统能力选择图片。

完整链路可以理解为：

```text
用户点击按钮
  ↓
视图层捕获点击事件
  ↓
事件发送到逻辑层
  ↓
逻辑层执行 chooseImage
  ↓
调用 wx.chooseImage / ascf.chooseImage
  ↓
JSBridge 封装请求
  ↓
底层核心层接收请求
  ↓
API 模块分发能力
  ↓
调用鸿蒙原生能力
  ↓
拿到结果
  ↓
通过 JSBridge 回传逻辑层
  ↓
逻辑层更新页面数据
  ↓
视图层重新渲染
```

这条链路很长。

但它的本质就是一句话：

> 视图层负责收集用户行为，逻辑层负责执行业务逻辑，底层核心层负责调用鸿蒙能力。

---

## 7. 为什么要有 JSBridge

JSBridge 是理解 ASCF 的关键。

因为 JS 代码和鸿蒙原生能力不在同一个世界里。

JS 世界里是这样的：

```js
wx.getSystemInfo({
  success(res) {
    console.log(res)
  }
})
```

鸿蒙原生侧可能是另一个调用方式。

中间就需要一个桥：

```text
JS API
  ↓
JSBridge
  ↓
ArkTS / Native
  ↓
HarmonyOS Ability
```

JSBridge 至少要解决几个问题：

```text
请求怎么表示？
参数怎么传？
结果怎么返回？
异步回调怎么匹配？
错误怎么处理？
事件怎么通知？
```

一个最小的桥接协议可以长这样：

```js
{
  id: 'request_001',
  action: 'system.getInfo',
  params: {},
  callback: true
}
```

返回结果可以长这样：

```js
{
  id: 'request_001',
  code: 0,
  data: {
    platform: 'HarmonyOS'
  },
  message: 'ok'
}
```

这里的 `id` 很重要。

因为 JS 调用原生能力通常是异步的，必须知道某个返回结果对应哪个请求。

---

## 8. 用一个 mini demo 理解 ASCF

为了不陷入真实框架细节，我们可以自己设计一个最小版运行时。

目录可以这样拆：

```text
mini-ascf-runtime-lab
├── h5-demo
│   └── index.html
│
├── bridge-core
│   ├── createBridge.ts
│   ├── callbackManager.ts
│   └── protocol.ts
│
├── runtime-core
│   ├── launcher.ts
│   ├── dispatcher.ts
│   ├── routeManager.ts
│   └── webContainer.ts
│
├── ability-plugins
│   ├── toast.ts
│   ├── storage.ts
│   ├── network.ts
│   └── system.ts
│
└── debug-panel
    ├── logger.ts
    └── devtools.ts
```

这个 Demo 不需要真的复刻 ASCF，只要模拟核心链路就够了。

目标是跑通：

```text
H5 点击按钮
  ↓
send(action, params)
  ↓
Bridge 封装请求
  ↓
Dispatcher 查找能力
  ↓
Plugin 执行
  ↓
结果返回给 H5
```

---

## 9. mini JSBridge 示例

H5 侧可以这样写：

```js
window.ascfBridge = {
  callbacks: {},

  send(action, params, callback) {
    const id = `req_${Date.now()}_${Math.random()}`

    this.callbacks[id] = callback

    const message = {
      id,
      action,
      params
    }

    window.NativeBridge.postMessage(JSON.stringify(message))
  },

  receive(response) {
    const callback = this.callbacks[response.id]

    if (callback) {
      callback(response)
      delete this.callbacks[response.id]
    }
  }
}
```

页面调用：

```js
window.ascfBridge.send(
  'ui.showToast',
  { title: 'Hello ASCF' },
  function (res) {
    console.log('调用结果：', res)
  }
)
```

这段代码说明了一个核心思想：

> JSBridge 不是魔法，它本质上就是请求、分发、回调。

---

## 10. mini Dispatcher 示例

原生侧可以有一个分发器：

```ts
type Handler = (params: Record<string, unknown>) => Promise<unknown>

class Dispatcher {
  private handlers = new Map<string, Handler>()

  register(action: string, handler: Handler) {
    this.handlers.set(action, handler)
  }

  async dispatch(message: {
    id: string
    action: string
    params: Record<string, unknown>
  }) {
    const handler = this.handlers.get(message.action)

    if (!handler) {
      return {
        id: message.id,
        code: 404,
        message: `unknown action: ${message.action}`
      }
    }

    try {
      const data = await handler(message.params)

      return {
        id: message.id,
        code: 0,
        data,
        message: 'ok'
      }
    } catch (error) {
      return {
        id: message.id,
        code: 500,
        message: String(error)
      }
    }
  }
}
```

然后注册能力：

```ts
const dispatcher = new Dispatcher()

dispatcher.register('ui.showToast', async (params) => {
  return {
    shown: true,
    title: params.title
  }
})
```

这样，一个最小的 API 调用链路就出来了。

---

## 11. mini Runtime 示例

运行时核心可以负责启动流程：

```ts
class MiniRuntime {
  constructor(
    private dispatcher: Dispatcher,
    private webContainer: WebContainer
  ) {}

  async start() {
    await this.loadManifest()
    await this.createWebContainer()
    await this.injectBridge()
    await this.loadHomePage()
  }

  private async loadManifest() {
    console.log('加载配置文件')
  }

  private async createWebContainer() {
    console.log('创建 Web 容器')
  }

  private async injectBridge() {
    console.log('注入 JSBridge')
  }

  private async loadHomePage() {
    console.log('加载首页')
  }
}
```

这个 Demo 虽然简单，但它对应了真实运行时中的几个关键动作：

```text
加载配置
创建容器
注入桥
加载页面
处理 API 调用
```

理解了这个最小模型，再去看更复杂的框架源码，就不会迷路。

---

## 12. ASCF 里的“同层渲染”怎么理解

普通 Web 页面里，很多东西都在 WebView 里渲染。

但是某些组件，比如：

```text
video
map
camera
canvas
```

可能对性能、权限、层级、手势、系统能力有更高要求。

这时就需要让原生组件参与渲染。

可以粗略理解为：

```text
普通组件
  → Web 渲染

复杂组件
  → 原生组件增强渲染
```

这就是同层渲染相关能力的意义。

它解决的不是“能不能显示一个标签”，而是“复杂组件如何在 Web 容器里和页面一起协作”。

---

## 13. 遇到问题时，怎么判断该看哪一层

学习框架源码，最怕一上来就全文搜索。

更好的方式是先按现象分层。

| 问题现象 | 优先怀疑方向 |
|---|---|
| 应用启动失败 | 底层核心层、生命周期入口 |
| 页面白屏 | Web 容器、页面路由、视图层渲染 |
| app.js 没执行 | 逻辑层启动器、配置加载 |
| Page 生命周期没触发 | 逻辑层页面管理 |
| 点击事件没反应 | 视图层事件、逻辑层事件处理 |
| API 找不到 | API 注册、模块导出 |
| API 有调用但没返回 | JSBridge、回调管理、原生桥接 |
| video / map / camera 异常 | 同层渲染组件、权限、原生能力 |
| 页面数据更新但 UI 不变 | 逻辑层数据更新、视图层响应式渲染 |
| 构建或导入失败 | 包管理、共享包配置 |

这张表比记住某个文件名更重要。

因为维护框架时，第一步不是马上改代码，而是判断问题属于哪条链路。

---

## 14. 新增 API 时，大概会经过哪些步骤

假设要新增一个公开能力：

```js
ascf.getBatteryInfo({
  success(res) {
    console.log(res.level)
  }
})
```

从框架角度看，大概需要做这些事情：

```text
定义 JS API 名称
  ↓
实现参数校验
  ↓
注册 API
  ↓
通过 JSBridge 发起请求
  ↓
底层核心层分发请求
  ↓
调用鸿蒙原生能力
  ↓
封装返回结果
  ↓
触发 success / fail / complete
```

所以新增 API 不只是“写一个函数”。

它至少涉及：

```text
API 定义
API 注册
参数协议
桥接通信
原生能力
错误处理
回调机制
测试验证
```

如果有一天需要维护或新增 API，就可以按照这条链路去拆任务。

---

## 15. 为什么自己写一个 mini runtime 有价值

学习这种框架，光看源码很容易晕。

因为真实工程里会有大量边界逻辑：

```text
兼容逻辑
异常处理
版本判断
性能优化
历史包袱
内部适配
工程化配置
```

一上来就看这些，很容易抓不到主线。

更好的方式是先自己写一个最小模型。

它不需要完整，也不需要强大。

只要能跑通下面这条链路，就已经很有价值：

```text
页面点击
  ↓
JSBridge 请求
  ↓
原生分发
  ↓
API 执行
  ↓
结果回调
  ↓
页面更新
```

这个过程会让你真正理解：

```text
为什么需要运行时
为什么需要桥接层
为什么需要 API 注册
为什么需要回调管理
为什么视图层和逻辑层要分开
为什么复杂组件需要原生增强
```

---

## 16. 我的当前理解

我现在对 ASCF 的理解是：

> ASCF 是一套面向元服务的小程序运行时框架。它不是单纯的 WebView，而是通过底层核心层、逻辑层和视图层的配合，把小程序生态中的页面、生命周期、组件、API 和原生能力接入到鸿蒙元服务中。

更简单地说：

```text
底层核心层：负责接住鸿蒙能力
逻辑层：负责让 JS 小程序代码跑起来
视图层：负责把页面渲染出来
JSBridge：负责让 JS 和原生能力通信
API 系统：负责把 wx.xxx / ascf.xxx 变成真实能力调用
同层渲染：负责让复杂组件获得更接近原生的体验
```

如果用一句话总结：

> ASCF 做的事情，就是在鸿蒙元服务里，搭出一套“小程序可以运行的环境”。

---

## 17. 下一步可以继续看什么

如果继续学习源码，我会按照下面顺序推进：

```text
第一步：启动链路
从鸿蒙生命周期入口看到 Runtime 启动。

第二步：配置加载链路
看 app.json、页面配置、分包配置如何进入运行时。

第三步：app.js 加载链路
看应用 JS 如何被加载、执行，并触发 App 生命周期。

第四步：页面创建链路
看 Page 如何注册、创建、入栈，并通知视图层渲染。

第五步：JSBridge 链路
看 JS API 如何发起请求、如何回调、如何处理异常。

第六步：API 注册链路
看 API 如何分类、导出、注册和分发。

第七步：同层渲染链路
看 video、map、camera 等复杂组件如何接入原生能力。
```

这七步看完，才算真正从“看目录”进入“看框架运行”。

---

## 18. 结尾

刚开始学习 ASCF，不要急着问“每个文件到底做什么”。

更重要的是先回答：

```text
这个框架为什么存在？
它解决了什么问题？
它把问题拆成了哪几层？
每一层负责什么？
一次 API 调用会经过哪些环节？
遇到问题应该从哪里排查？
```

只要这几个问题想清楚，后面再看源码，就不是在黑暗里摸索，而是在验证自己的架构地图。

这也是我接下来学习 ASCF 的方法：

> 先画地图，再走链路，最后看细节。

---

## 参考资料

- 华为开发者联盟：ASCF / 元服务相关公开文档
- HarmonyOS 共享包、HAR、HSP、ohpm 相关公开文档
- 个人公开 Demo 思路：mini runtime、JSBridge、Web 容器、API Dispatcher
