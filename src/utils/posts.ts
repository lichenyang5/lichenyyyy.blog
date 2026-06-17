import { getCollection, type CollectionEntry } from 'astro:content';
import { getYear, getMonth } from './date';

export type Post = CollectionEntry<'posts'>;

/**
 * 取已发布文章，按日期倒序。
 * 生产环境（astro build）下隐藏 draft: true 的文章；开发环境全部显示。
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => {
    return import.meta.env.PROD ? data.draft !== true : true;
  });
  return posts.sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
}

/**
 * 估算阅读时间（分钟）。
 * 中文按 ~400 字/分钟、英文按 ~200 词/分钟，取上界，至少 1 分钟。
 */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const cjk = (body.match(/[一-龥]/g) || []).length;
  const words = (body.replace(/[一-龥]/g, ' ').match(/[A-Za-z0-9]+/g) || [])
    .length;
  const minutes = Math.ceil(cjk / 400 + words / 200);
  return Math.max(1, minutes);
}

/** 统计所有标签及数量，按数量倒序、同数量按名称排序。 */
export function getAllTags(
  posts: Post[],
): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      map.set(tag, (map.get(tag) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 取某个标签下的文章（已按日期倒序，沿用入参顺序）。 */
export function getPostsByTag(posts: Post[], tag: string): Post[] {
  return posts.filter((p) => p.data.tags.includes(tag));
}

export type ArchiveMonth = { month: string; posts: Post[] };
export type ArchiveYear = { year: number; months: ArchiveMonth[] };

/**
 * 按「年 -> 月」分组，年份倒序、月份倒序。
 * 入参应为已倒序的文章列表。
 */
export function groupByYearMonth(posts: Post[]): ArchiveYear[] {
  const years = new Map<number, Map<string, Post[]>>();
  for (const post of posts) {
    const y = getYear(post.data.date);
    const m = getMonth(post.data.date);
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(post);
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([month, list]) => ({ month, posts: list })),
    }));
}
