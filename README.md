# lichenyyyy 的个人博客

一个长期维护的个人博客：记录 HarmonyOS / ArkUI / ASCF / WebView / JSBridge、前端工程、AI 工作流、部署与调试复盘。

视觉上追求极简：白底、文字优先、留白充足、移动端阅读舒服，不堆渐变、不堆阴影、不做营销 landing。

线上地址：<https://www.lichenyyyy.top>

## 技术栈

- **[Astro](https://astro.build/)** —— 静态站点生成，构建产物是纯静态文件，方便丢到 VPS + Nginx
- **TypeScript** —— 全程类型校验
- **Content Collections（Content Layer）** —— Markdown 文章 + frontmatter 字段校验
- **CSS Variables** —— 颜色与尺寸集中管理（见 `src/styles/global.css`）
- **RSS**（`@astrojs/rss`）、**Sitemap**（`@astrojs/sitemap`）
- 预留 **Pagefind** 全文搜索（见文末）

## 本地运行

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器（默认 http://localhost:4321）
npm run check    # 类型 / frontmatter 校验（astro check）
npm run build    # 构建静态站点到 dist/
npm run preview  # 本地预览构建产物
```

需要 Node 18.20+ / 20+ / 22+。

## 项目结构

```
public/            favicon.svg、og-image.png 等静态资源（原样拷贝）
文章模板.md         新文章模板，复制到 src/content/posts/ 改名即可
src/
  consts.ts        站点信息、导航、社交链接、关注方向（改站点先动这里）
  content/
    config.ts      文章集合的 schema（frontmatter 校验 + slug 规则）
    posts/         所有 Markdown 文章（中文文件名）
  layouts/         BaseLayout（HTML 壳 + SEO）、PostLayout（文章页）
  components/       Header / Footer / PostList / Tag / Prose
  pages/           路由页面（首页、列表、详情、标签、归档、项目、关于、RSS、404）
  styles/          global.css（全局）、prose.css（正文排版）
  utils/           posts.ts（取文章/标签/归档/阅读时间）、date.ts（日期）
astro.config.mjs   站点地址、sitemap、代码高亮主题、devToolbar 开关
```

## 如何新增一篇博客

这是一个 **Astro 静态博客**，新增文章**不是**随便放到某个 blog 文件夹，而是把 Markdown 文件放进固定目录：

```text
src/content/posts/
```

例如：

```text
src/content/posts/鸿蒙 Web 容器（六）：离线包和白名单怎么设计.md
```

### 第 1 步：写 frontmatter

每篇文章**必须**以 frontmatter 开头（项目根目录有现成的 `文章模板.md`，复制改名最省事）：

```md
---
title: "鸿蒙 Web 容器（六）：离线包和白名单怎么设计"
description: "这篇文章记录我如何理解 Web 容器里的离线包、白名单和页面加载安全。"
date: 2026-06-17
updated: 2026-06-17
tags: ["HarmonyOS", "ArkWeb", "Web容器", "ASCF"]
category: "Web容器"
source: "original"
sourceUrl: ""
draft: false
---
```

字段含义（在 `src/content/config.ts` 用 Zod 校验，写错会在 `npm run check` / `npm run build` 时直接报错）：

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✅ | 文章标题，列表页 / SEO / 文章页大标题都用它 |
| `description` | ✅ | 一句话摘要，列表、SEO、RSS 都会用 |
| `date` | ✅ | 发布日期，文章按它倒序排列 |
| `updated` | 选填 | 更新日期；与 `date` 相同则不显示「更新」 |
| `tags` | 选填 | 字符串数组，自动生成 `/tags` 统计 |
| `category` | ✅ | 单个分类 |
| `source` | 选填 | 来源标识，如 `original` / `juejin` |
| `sourceUrl` | 选填 | 原文链接；**没有就留空字符串 `""`**，有就必须是合法 URL |
| `draft` | 选填 | `false` 正式发布；`true` 草稿，仅本地可见、构建不输出 |

### 第 2 步：写正文

frontmatter 下面直接写正文，**从二级标题 `##` 开始**：

```md
## 为什么要写这个

...
```

> 注意：正文里**不要再写一级标题 `#`**。文章大标题由 frontmatter 的 `title` 自动渲染，
> 正文再写 `#` 会出现两个一级标题。

### 几条约定

- 文件名**可以用中文**，URL 会**根据文件名自动生成**（空格换成连字符）。
  - `WebSocket 与 SSE 区别.md` → `/posts/WebSocket-与-SSE-区别`
  - `动态加载与延迟加载.md` → `/posts/动态加载与延迟加载`
- ❌ 不要把文章放到 `public/` 目录（那里是原样拷贝的静态资源）
- ❌ 不要把文章放到项目根目录
- ❌ 不要直接改页面 HTML——内容只通过 Markdown 管理

### 第 3 步：本地检查

```bash
npm run dev      # 浏览器看效果（草稿也能看到）
npm run check    # 校验类型和 frontmatter
npm run build    # 确认能正常构建
```

### 第 4 步：上线

提交并推送：

```bash
git add .
git commit -m "新增文章：文章标题"
git push
```

如果服务器是手动部署，则在服务器上拉取最新代码并重新构建：

```bash
git pull
npm install      # 依赖有变化时才需要
npm run build
```

然后让 Nginx 指向 `dist` 目录（Nginx 配置见下方「构建与部署」）。

### 功能说明

- 文章按 `date` **倒序**排列
- `draft: true` 的文章**只在 `npm run dev` 可见**，`npm run build` 不会输出
- 阅读时间按正文字数**自动估算**（中文 ~400 字/分钟）
- `/tags` 自动**统计标签**与数量，`/archive` 自动**按年月归档**
- 自动生成 **RSS**（`/rss.xml`）与 **sitemap**（`/sitemap-index.xml`）
- 每页带基础 **SEO meta** 与 **Open Graph** 信息

## 构建与部署（VPS + Nginx）

构建：

```bash
npm run build      # 产物输出到 dist/，是一堆纯静态文件
```

把 `dist/` 上传到服务器（例如 `/var/www/blog`），Nginx 最小配置：

```nginx
server {
    listen 80;
    server_name www.lichenyyyy.top lichenyyyy.top;

    root /var/www/blog;
    index index.html;
    charset utf-8;                       # 中文 URL/内容，务必 UTF-8

    # Astro 默认每篇文章是 /posts/xxx/index.html，按目录回退
    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    # 静态资源缓存
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    error_page 404 /404.html;
}
```

> 文章 URL 含中文，Nginx 默认就能正确处理 UTF-8 路径；上传时注意保持文件名编码不被改动。
> 上线后建议再配 HTTPS（用 Certbot 申请 Let's Encrypt 证书），把 80 跳转到 443。

部署改动只需：本地 `npm run build` → 同步 `dist/` 到服务器，无需后端、无需数据库。

## 后续可扩展：Pagefind 搜索

[Pagefind](https://pagefind.app/) 是为静态站点设计的全文搜索，构建后对 `dist/` 做一次索引即可：

```bash
npm i -D pagefind
# 在 package.json 的 build 脚本后追加： && pagefind --site dist
```

然后在需要搜索的页面引入 Pagefind 的 UI 组件即可（无需服务端）。

---

换站点信息（标题、域名、GitHub / 掘金 / 邮箱、关注方向）统一改 `src/consts.ts`；换域名再同步改 `astro.config.mjs` 里的 `site`。
