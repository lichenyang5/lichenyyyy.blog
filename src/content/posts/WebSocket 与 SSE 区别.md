---
title: "从两个 demo 说起：WebSocket 和 SSE 到底差在哪？"
description: "都是服务器主动往客户端推数据，为什么要 SSE 和 WebSocket 两套？借两个鸿蒙 demo——AI 逐字回复和实时在线人数，把这俩的区别和选型讲清楚。"
date: 2026-06-06
updated: 2026-06-06
tags: ["HarmonyOS", "SSE", "WebSocket", "网络通信"]
category: "HarmonyOS"
source: "原创"
draft: false
---

我先后写了两个鸿蒙小 demo。

一个是 **AI 对话**：你发一句话，AI 的回复不是「啪」一下整段蹦出来，而是一个字一个字往外冒，像有人在那头实时打字。

另一个是 **实时待办**：页面上挂着一个「在线人数」，我啥也没干，那个数字自己每隔两秒跳一下；我在输入框发条消息，服务端立刻原样回给我。

这俩有个共同点：**数据是服务器「主动」推给客户端的**，不是客户端傻乎乎地一直问。但我一个用了 **SSE**，一个用了 **WebSocket**。

那问题就来了：都是「服务器往客户端推数据」，为什么要两套东西？它俩到底差在哪、我该用哪个？这篇就把这事儿掰开揉碎讲清楚。看完你不用去背参数，只要记住两个画面就行。

---

## 一、先搞明白：为什么普通 HTTP 不够用？

我们平时发请求，都是这个套路：

> 客户端：「给我用户列表。」
> 服务器：「给，这是用户列表。」—— 然后**连接就断了**。

这叫**请求-响应**。它有个天生的脾气：**必须客户端先开口，服务器才能说话**。服务器再想跟你说点啥（比如「有新消息了」），它没法主动找你，只能干等着你下次来问。

那「在线人数变了要实时更新」这种需求怎么办？最朴素的想法是**轮询**——客户端每隔几秒就问一次：

> 「变了吗？」「没有。」
> （3 秒后）「变了吗？」「没有。」
> （3 秒后）「变了吗？」「变了，现在 8 个人。」

说实话，这就跟你点了外卖，每隔十秒给商家打一次电话问「做好了没」一样——**绝大多数电话都是白打的**，又费电又费流量，消息还总慢半拍（最坏要等一整个轮询间隔）。

更聪明的做法显然是：**别让我一直问，你做好了主动通知我。**

SSE 和 WebSocket，就是实现「服务器主动通知」的两种方式。区别在于——**这通「电话」是单向的还是双向的。**

---

## 二、SSE：一个「只能听、不能回」的电台

SSE 全称 Server-Sent Events，直译就是「服务器发送的事件」。

**类比：它就像你订阅了一个电台。** 电台一直在播，你打开收音机就能源源不断地听到内容；但你**没法对着收音机说话**——信息只能从电台流向你，单向的。

它最妙的一点是：**SSE 根本不是什么新协议，它就是一个「迟迟不肯结束」的普通 HTTP 响应。**

平时的 HTTP 响应是「把数据一次性给你，然后结束」。SSE 是「保持这个响应不结束，每有新数据就往这条管子里塞一段」。约定也很简单，每条消息长这样：

```
data: {"chunk":"你"}

data: {"chunk":"好"}

data: {"done":true}

```

就是 `data:` 开头、`\n\n`（两个换行）结尾。客户端这边收到后，按 `\n\n` 切一刀，就是一条完整消息。

### demo 里的 SSE 长什么样

**后端**（我用的 Next.js）——因为 SSE 本质就是个 HTTP 响应，所以一个普通路由就能搞定，返回一个「可读流」：

```ts
const stream = new ReadableStream({
  async start(controller) {
    for (const ch of replyText) {
      // 每个字塞一帧，中间睡 50ms，前端就有了「逐字蹦」的效果
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: ch })}\n\n`))
      await sleep(50)
    }
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
    controller.close()
  }
})
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
```

**客户端**（鸿蒙）——用的还是发 HTTP 请求那套 `http`，只不过换成「流式」的 `requestInStream`，然后监听 `dataReceive` 一段段接：

```ts
req.on('dataReceive', (data: ArrayBuffer) => {
  buffer += decoder.decodeToString(new Uint8Array(data), { stream: true })
  const parts = buffer.split('\n\n')   // 按 \n\n 切出完整帧
  buffer = parts.pop() ?? ''           // 最后一段可能不完整，留着下次拼
  for (const part of parts) {
    // 解析 data: 后面的 JSON，是 chunk 就往屏幕上拼字，是 done 就收尾
  }
})
req.requestInStream(url, { method: http.RequestMethod.POST, /* ... */ })
```

注意那个 `buffer`：网络是按「包」来的，一帧消息**可能被拆到两个包里**，也可能两帧挤在一个包里。所以不能收到就直接用，得先攒进 buffer，按 `\n\n` 切，**切剩下的零头留到下次再拼**。这是写 SSE 客户端最容易踩的坑。

---

## 三、WebSocket：一条「两边都能说话」的电话线

WebSocket  就不一样了。

**类比：它像打电话。** 接通之后，**两头都能随时开口**，你一句我一句，不用挂了重拨。这就是所谓的「全双工」——一条线，双向跑。

它的建立过程有点意思：**先用一个普通 HTTP 请求去敲门**，请求头里带一句「我想把这条连接升级成 WebSocket」（`Upgrade: websocket`）。服务器同意了，回一个「101 切换协议」，**这条 TCP 连接就从 HTTP「变身」成了 WebSocket**，之后地址也从 `http://` 变成 `ws://`。握手用 HTTP，握完手就不再是 HTTP 了。

### demo 里的 WebSocket 长什么样

**客户端**（鸿蒙）——用的是专门的 `webSocket` 模块，事件驱动：连上 `open`、来消息 `message`、断了 `close`、出错 `error`，自己想说话就 `send`：

```ts
const ws = webSocket.createWebSocket()
ws.on('open',    () => { /* 接通了 */ })
ws.on('message', (err, data) => { /* 服务端推来的数据，比如在线人数 */ })
ws.on('close',   () => { /* 挂断了 */ })
ws.connect('ws://192.168.x.x:3000/api/ws')
// 任何时候都能主动发：
ws.send('hello')
```

**后端**——这里有个特别值得记的坑：**WebSocket 不能像 SSE 那样写在一个普通路由里。**

为啥？因为 SSE 只是「一个 HTTP 响应」，而 Next.js 的路由处理函数本来就是处理 HTTP 响应的，天作之合。但 WebSocket 需要在握手时**接管底层的 socket** 去做「协议升级」，而路由函数拿不到那个底层 socket。

所以我后端不得不**单开一个自定义服务器**（`server.js`），用 `ws` 这个库去接管 `/api/ws` 的升级请求：

```js
const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname === '/api/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  }
})
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'welcome' }))
  setInterval(() => ws.send(JSON.stringify({ type: 'tick', onlineCount })), 2000) // 主动推
  ws.on('message', raw => ws.send(JSON.stringify({ type: 'echo', message: raw.toString() }))) // 收到再回
})
```

**「SSE 一个路由就行，WebSocket 得单开服务器」——这句话你要是记住了，这俩的本质区别其实就懂了一大半。**

---

## 四、并排对比一下

| | **SSE** | **WebSocket** |
|---|---|---|
| 通信方向 | **单向**（只能服务器 → 客户端） | **双向**（两头都能发） |
| 底层协议 | 就是普通 HTTP | HTTP 握手后「升级」成 `ws://` |
| 客户端能发消息吗 | 不能（要发只能另外再发普通请求） | 能，随时 `send` |
| 数据类型 | 只能文本 | 文本 + 二进制都行 |
| 断线自动重连 | 浏览器原生 `EventSource` 自带（鸿蒙用裸流要自己管） | 都得自己写重连 |
| 后端实现成本 | 低，一个路由返回流就行 | 高，通常要独立的 WebSocket 服务 |
| 典型场景 | AI 逐字输出、消息通知、股票行情、进度条 | 聊天室、多人协作、在线游戏、双向实时 |

---

## 五、那我到底该用哪个？

别纠结，一句话判断：

> **只要「服务器单方面往下推」就够了 → 用 SSE，更简单。**
> **需要「两头频繁你来我往」→ 用 WebSocket。**

拿我那两个 demo 对号入座，特别清楚：

- **AI 对话**：你的问题用一个普通请求发出去就完事了，剩下的全是 AI 单方面把回复一个字一个字推给你——**纯单向**。这种用 WebSocket 属于杀鸡用牛刀，**SSE 正合适**，后端还省一个服务器。
- **实时待办**：服务端要主动推在线人数（服务器说），我也要随时发消息让它 echo（我也说）——**双向都要**。这就是 WebSocket 的主场，SSE 干不了「客户端主动发」这件事。

一个朴素但好用的经验法则：**能用 SSE 解决的，就别上 WebSocket。** 双向能力听着很美，但它带来的连接管理、重连、心跳、单独部署的服务……都是实打实的成本。**按需选型，不要因为 WebSocket「更高级」就无脑选它。**

---

## 一句话总结

**SSE 是「订电台」——服务器单向广播，本质还是个没结束的 HTTP 响应，轻量；WebSocket 是「打电话」——两头随时对讲，要专门的长连接和服务器伺候。先问自己「需不需要客户端也能主动说话」，答案就出来了。**
