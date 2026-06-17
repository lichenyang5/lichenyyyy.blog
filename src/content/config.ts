import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 文章集合。
 *
 * 用 glob loader（Astro 5 Content Layer）加载 src/content/posts 下的 Markdown。
 * generateId 自定义了 slug 生成规则：保留中文与大小写，仅把空格换成连字符，
 * 这样「WebSocket 与 SSE 区别.md」会得到 URL「/posts/WebSocket-与-SSE-区别」，
 * 而不是被默认规则改成全小写英文。
 */
const posts = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/posts',
    generateId: ({ entry }) => entry.replace(/\.md$/, '').replace(/\s+/g, '-'),
  }),
  schema: ({ image }) =>
    z.object({
      /** 文章标题 */
      title: z.string(),
      /** 摘要（按阮一峰周刊风格：从真实问题出发，简洁清楚） */
      description: z.string(),
      /** 发布日期 */
      date: z.coerce.date(),
      /** 更新日期（可选，缺省时按发布日期显示） */
      updated: z.coerce.date().optional(),
      /** 标签 */
      tags: z.array(z.string()).default([]),
      /** 分类（单选） */
      category: z.string(),
      /** 来源平台，如 juejin（可选） */
      source: z.string().optional(),
      /** 原文链接（可选） */
      sourceUrl: z.string().url().optional(),
      /** 草稿：true 时不在生产环境展示 */
      draft: z.boolean().default(false),
      /** 可选封面图（预留） */
      cover: image().optional(),
    }),
});

export const collections = { posts };
