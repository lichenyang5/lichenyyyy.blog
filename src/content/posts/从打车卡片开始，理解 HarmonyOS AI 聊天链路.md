---
title: "从打车卡片开始，理解 HarmonyOS AI 聊天链路"
description: "这篇文章从一个打车卡片出发，记录我如何把 SSE 流式返回、消息类型分发、ArkUI 卡片渲染和 RDB 持久化串成一条完整链路。"
date: 2026-06-17
updated: 2026-06-17
tags: ["HarmonyOS", "ArkUI", "SSE", "RDB", "AI Chat"]
category: "HarmonyOS"
source: "original"
sourceUrl: ""
draft: false
---

## 为什么要写这个

我们对「AI 聊天」最熟悉的样子，大概是 ChatGPT 那种：你打一句话，它一个字一个字地往外蹦文本。我自己写第一个鸿蒙聊天 demo 时也是这样——一个输入框，一个气泡，文字流式出来，就算跑通了。

但真到业务里，很少有「只回文本」的聊天。打开任何一个打车、外卖、酒店类 App 的智能助手，你说一句「打车」，它通常会先回一句话，**然后在下面甩出一张卡片**：确认上车点、几个候选地点、一个「查看更多」按钮。这张卡片不是文字，是一块结构化、能点的 UI。

所以我做这个 HarmonyOS AI 聊天 demo，真正想验证的不是「能不能聊天」，而是这么一件事：

> 一条 AI 回复，怎么从一个字符串，变成屏幕上一张能渲染、能持久化、退出再进来还在的卡片？

拆开就是几个具体问题：

- 后端怎么用 **SSE** 流式把内容推过来；
- 前端怎么判断这次回复是纯文本，还是要渲染成卡片；
- **ArkUI**（鸿蒙的声明式 UI 框架，思路和 React / Vue 类似）怎么把卡片画出来；
- 卡片数据怎么存下来；
- 看历史记录时，卡片还能不能恢复。

这篇就从「输入一个『打车』」开始，把这条链路从头走到尾。

## 问题是什么

在写代码之前，先把这条链路上的几个坎说清楚，不然很容易一上来就被细节绕进去。

1. **AI 回复不只是 `string`。** 文本和卡片得共存在同一条回复里，不能再假设「一条消息 = 一段文字」。
2. **SSE 是分片来的。** 文本是一个字一个字到的，你拿不到「最终完整状态」就得先开始渲染，所以不能一上来就按最终结构画 UI。
3. **需要一套 `type` / `payload` 协议。** 否则前端没法回答「这次是文本还是卡片？是哪种卡片？」。
4. **ArkUI 要按 `type` 分发到不同组件。** UI 不应该去猜内容长什么样，而应该照着 `type` 渲染。
5. **卡片不是临时 UI。** 关掉页面、重进、翻历史记录，卡片得还在——这意味着持久化也得带上卡片。
6. **协议、状态、持久化要是混在一起，后面会很难维护。** 今天只有打车卡片，明天加订单卡片、酒店卡片时，不想推倒重来。

## 我的理解

绕了几圈之后，我把这件事想明白成一句话：

> **文本回复是一种 message，打车卡片也是一种 message，区别只是 message 的 `type` 不同。**

顺着这个想法，几件事就顺了：

- UI **不该猜**内容，而该看消息的 `type`，按 `type` 渲染对应组件；
- 后端、前端、持久化，全都围绕**同一份消息结构**工作——后端按它下发，前端按它渲染，存储按它保存；
- 一条 AI 回复里的「文字说明」和「业务卡片」，本来就是同一次回复的两半，所以让**同一条消息同时装下 `content` 和 `card`**，比拆成「文本一条 + 卡片一条」更贴近现实。

如果只让你记一句话，就是这句：

> 流式的是文本，结构化的是结果；文本进 `content`，结果进 `card`，历史保存两者，UI 根据 `type` 分发。

下面的所有代码，都是在落实这一句。

## 关键链路

整条链路看着文件不少，但主干很清楚：

```text
用户输入“打车”
→ 前端先建一条用户消息，再建一条空的 AI 消息（占位）
→ 调后端 /api/chat，建立 SSE 连接
→ 后端逐字下发 chunk 帧（纯文本），前端把每个 chunk 追加到 AI 消息的 content
→ 文本发完，后端再发一个 done 帧，里面带上 card（完整的结构化卡片）
→ 前端在 onDone 里，把 card 挂到当前这条 AI 消息上
→ ArkUI 发现这条消息有了 card，按 type 渲染对应卡片组件
→ 保存历史时，content 和 card 一起写进持久化模型
→ 下次进来，从存储恢复，card 重新挂回消息，历史里也能看到同一张卡片
```

这里最该记住的一点是：**卡片走 `done` 帧，不走 `chunk` 帧**。`chunk` 只管文本流，`done` 管「这条结束了」以及最终结果。下面第一段代码就是它。

## 关键代码

### 1. card 放在 done 帧，不混进 chunk

**要解决的问题**：文本是流式的、一段段来；但卡片是一个完整结构，没必要、也不应该一个字段一个字段地流式拼。

后端（我用 Next.js 写的 mock）里，文本继续走 `chunk`，卡片只在最后的 `done` 帧带上：

```typescript
// 文本逐字推：每个字一个 chunk 帧
for (const ch of replyContent) {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({ chunk: ch, done: false })}\n\n`
  ))
  await sleep(50)
}

// 文本发完，最后一帧才带上结构化 card
const endFrame = { done: true, sessionId, messageId }
if (taxi) endFrame.card = TAXI_CARD
controller.enqueue(encoder.encode(`data: ${JSON.stringify(endFrame)}\n\n`))
```

前端这边，通用的 SSE 工具只负责**透传** card，不认识它是什么业务：

```typescript
// common 层的通用 SSE 工具：done 元信息里给 card 留一个槽
export interface SseDoneMeta {
  sessionId?: string
  messageId?: string
  error?: string
  card?: Object   // 注意是 Object，不是具体的 PickupCard
}

if (frame.done === true) {
  callbacks.onDone({
    sessionId: frame.sessionId,
    messageId: frame.messageId,
    card: frame.card,   // 原样透传，交给业务层去解释
  })
}
```

**为什么这么写**：

- `chunk` 只负责往 `content` 追加文本，职责单纯；`done` 本来就负责「结束 + 最终元信息」，顺手带上 `card` 最自然。
- 前端**等拿到完整 card 再渲染**，不会出现半截卡片数据把 UI 搞崩的情况。
- 通用 SSE 工具用 `Object` 而不是 `PickupCard`：它属于通用网络层，不该认识聊天业务的卡片模型，否则底层网络工具反向依赖了上层业务，分层就乱了。（类比前端：你封装的 `fetch` 工具，不应该 `import` 某个页面的 ViewModel。）

### 2. 消息模型：一条消息同时装 content 和 card

**要解决的问题**：怎么让一条 AI 消息既能流式刷新文本，又能在结尾「长出」一张卡片。

```typescript
// 卡片的数据结构：只有字段、没有方法（这一点在恢复历史时有用）
export class PickupCard {
  type: string = ''          // ← 最关键：区分这是哪一种卡片
  title: string = ''
  currentLocation: string = ''
  points: PickupPoint[] = []
  moreText: string = ''
}

@ObservedV2
export class ChatMessage {
  id: string = ''
  role: string = ''
  @Trace content: string = ''            // 流式文本，逐字刷新
  @Trace card: PickupCard | null = null  // done 帧回来后才赋值
}
```

**为什么这么写**：

- `type` 是整套协议的核心：前端就靠它决定渲染哪种卡片。现在只有 `pickup_confirm` 一种，但把 `type` 留着，以后加 `order_confirm`、`hotel_confirm` 会很自然。
- `@ObservedV2` / `@Trace` 是 ArkUI 的响应式标记（可以类比 Vue 的 `reactive` / React 的 state）：被 `@Trace` 盯住的字段一变，绑定它的 UI 就自动重渲染。`content` 要逐字刷新，所以要 `@Trace`；`card` 是结尾才赋值、同样要驱动 UI 长出卡片，所以也得 `@Trace`。

这里有个很容易漏的点：**后赋值、又要驱动 UI 的字段，都得进响应式追踪。** 我第一版忘了给 `card` 加 `@Trace`，结果 `done` 帧明明回来了、`card` 也赋上了，界面就是不冒卡片。

### 3. UI 按 type 分发：消息气泡里「长出」卡片

**要解决的问题**：assistant 消息原来只是个文本气泡，现在要在文字下面可选地接一张卡片。

```typescript
// 一条 assistant 消息 = 一段文字 +（可选）一张卡片
Column({ space: 8 }) {
  Text(this.getAssistantText())

  if (this.msg.card?.type === 'pickup_confirm') {
    PickupConfirmCardComp({ card: this.msg.card! })
  }
}
.alignItems(HorizontalAlign.Start)
```

**为什么这么写**：

- `Column` 就是纵向排布容器（≈ CSS 的 `flex-direction: column`），文字在上、卡片在下。
- 关键是**按 `card.type` 分发**，而不是写 `if (card !== null)`。现在只有一种卡片，两种写法效果一样；但按 `type` 写，将来多卡片时只要加分支，UI 永远不用「猜」内容。我第一版偷懒写的就是 `if (this.msg.card !== null)`，能跑，但不抗扩展——这点放到踩坑里说。

### 4. 持久化也要带上 card，否则历史只剩文本

**要解决的问题**：当前会话能看到卡片，但一旦关掉重进、翻历史记录，数据来源就从内存变成了本地存储；如果只存了 `content`，卡片就丢了。

```typescript
// 存：响应式 ChatMessage → 普通对象 ChatMessagePlain（方便 JSON 序列化）
private convertToPlain(): ChatMessagePlain[] {
  return this.vm.historyMessage.map((m) => {
    const plain = new ChatMessagePlain()
    plain.content = m.content
    plain.card = m.card ? m.card : null   // ← 关键：card 跟着一起存
    // ...id / role / createTime / sessionId 略
    return plain
  })
}

// 读：普通对象 → 响应式 ChatMessage（恢复响应式能力）
private convertToObservable(plains: ChatMessagePlain[]): ChatMessage[] {
  return plains.map((plain) => {
    const msg = new ChatMessage()
    msg.content = plain.content
    msg.card = plain.card ? plain.card : null  // ← 关键：card 挂回来
    return msg
  })
}
```

**为什么这么写**：

- 运行时的 `ChatMessage` 带响应式（`@Trace`），不适合直接塞进存储；存储用一个「纯字段」的 `ChatMessagePlain`，存的时候降级、读的时候再升级回响应式。**这一存一读两个函数都得带上 `card`**，少改一个，历史就退化成纯文本。
- 这里直接把 `plain.card` 赋回去就行，不用 `new PickupCard()`——因为 `PickupCard` 只有字段、没有方法，`JSON.parse` 回来的普通对象字段一致，够用。（哪天给它加了方法，就得手动重建实例了。）
- 顺带交代一句：这个 demo 一开始用键值存储 + JSON 存历史，后来把底层换成了 ArkData 的关系型数据库（RDB）。但「持久化模型也要存 `card`」这个点，跟用哪种存储无关。RDB 那套我单独写一篇，这里不展开。

## 踩坑记录

这些都是我真摔过的，不是事后总结的漂亮话：

- **card 一开始我想拆成 chunk 流式发，是错的。** 卡片是完整结构，根本不该一段段拼；而且半截 card 数据会让 UI 渲染异常。最后让 `chunk` 只管文本、`card` 只在 `done` 帧一次性给，问题就没了。**中间态（逐字文本）和最终态（带卡片的完整回复）必须分清楚。**
- **SSE 分片要用 buffer 拼。** 网络层每次回调拿到的不一定是一条完整帧：可能 `data: {"chunk":"你` 只来了一半，下次才来 `好"}`；也可能一次来好几帧。所以不能拿到就 `JSON.parse`，得先进 buffer，按 SSE 的空行规则切出完整帧再解析。
- **卡片字段缺失时，ArkUI 容易出问题。** `points` 为空、某个字段 `undefined` 时直接渲染会翻车。所以前端既要等 `done` 帧的完整 `card`，也要对字段做兜底（空数组、空串）。
- **历史只存 `content` 会丢卡片，这是最典型的一个。** 当前会话好好的，一翻历史卡片就没了——根因就是持久化模型和那两个转换函数没同步改 `card`。运行时模型、持久化模型、存、读，**四处都要覆盖到**，漏一个就漏了。
- **用一堆 boolean 表示消息状态，后面会乱。** loading、done、error、有没有 card……刚开始我用几个 boolean 拼，状态一多就开始打架（出现「既 loading 又 done」这种不该存在的组合）。这块后来我用一个状态机收口，也单独成文。
- **和 AI 结对写代码，容易被「顺手」改了业务逻辑。** 让 AI 帮我补卡片渲染时，它有时会顺带动了我并不想动的地方（比如那段多轮上下文逻辑）。所以 AI 生成的代码必须**人工逐段收口**，别整段照单全收——尤其是这种「只想加一个分支」的小改动。

## 总结

- **AI 聊天不只是文本流。** 真实业务里，一条回复常常是「文本 + 结构化结果」的组合。
- **`type` / `payload` 协议是地基。** 前后端、UI、存储都靠 `type` 对齐，UI 才能不靠猜。
- **UI 渲染、状态管理、持久化要围绕同一套消息模型。** 一条消息同时装 `content` 和 `card`，模型 / 渲染 / 存 / 读四处都认同一份结构。
- **卡片类消息必须考虑历史恢复。** 持久化不带 `card`，历史就退化成纯文本。
- **响应式字段要追踪到位。** 后赋值、又要驱动 UI 的字段（比如 `card`），也得 `@Trace`。
- **demo 的价值是跑通完整链路。** 重点不是画一张好看的卡片，而是把「一段 JSON 怎么变成屏幕上能恢复的卡片」这条链路，从头到尾打通一遍。

再把那句话放在最后，方便你下次直接套用：

> 流式的是文本，结构化的是结果；文本进 `content`，结果进 `card`，历史保存两者，UI 根据 `type` 分发。
