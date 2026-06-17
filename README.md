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
npm run build    # 构建静态站点到 dist/
npm run preview  # 本地预览构建产物
```

需要 Node 18.20+ / 20+ / 22+。

## 项目结构

```
public/            favicon.svg、og-image.png 等静态资源（原样拷贝）
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
astro.config.mjs   站点地址、sitemap、代码高亮主题
```

## 新增文章

1. 在 `src/content/posts/` 下新建一个 `.md` 文件。
2. **文件名直接用中文**，URL 会据此生成（空格会被换成连字符）。例如：
   - 文件 `WebSocket 与 SSE 区别.md` → 访问路径 `/posts/WebSocket-与-SSE-区别`
   - 文件 `动态加载与延迟加载.md` → 访问路径 `/posts/动态加载与延迟加载`
3. 顶部写好 frontmatter（见下），正文从二级标题 `##` 开始写即可——**不用再写一级标题 `#`**，文章大标题由 `title` 字段渲染。

### frontmatter 字段说明

```yaml
---
title: "从打车卡片开始，理解 HarmonyOS 聊天卡片链路"   # 必填，文章标题
description: "一句话摘要，从真实问题出发，简洁清楚。"      # 必填，用于列表/SEO/RSS
date: 2026-06-08                                      # 必填，发布日期
updated: 2026-06-08                                   # 选填，更新日期；与 date 相同则不显示「更新」
tags: ["HarmonyOS", "ArkUI", "SSE"]                   # 选填，标签数组
category: "HarmonyOS"                                 # 必填，分类（单个）
source: "原创"                                         # 选填，来源平台，如 juejin / 原创
sourceUrl: "https://juejin.cn/post/xxx"               # 选填，原文链接（有才写，必须是合法 URL）
draft: false                                          # 选填，true 时仅本地可见，构建时不输出
---
```

字段在 `src/content/config.ts` 中用 Zod 校验，写错会在 `npm run build` 时报错。

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
