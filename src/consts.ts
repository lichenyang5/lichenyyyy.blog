/**
 * 站点级常量集中在这里，改站点信息只动这一个文件。
 */

export const SITE = {
  /** 站点标题 / 作者名 */
  title: 'lichenyyyy',
  /** 站点一句话描述（用于首页与 SEO） */
  description:
    '前端转 HarmonyOS 的开发者，记录 ArkUI、ASCF、WebView、JSBridge 与前端工程的学习、调试和复盘。',
  /** 站点地址（与 astro.config.mjs 的 site 保持一致） */
  url: 'https://www.lichenyyyy.top',
  /** 作者 */
  author: 'lichenyyyy',
  /** 语言 */
  lang: 'zh-CN',
  /** 默认 Open Graph 图片（位于 public/） */
  ogImage: '/og-image.png',
};

/** 顶部导航 */
export const NAV: { href: string; label: string }[] = [
  { href: '/posts', label: 'Posts' },
  { href: '/projects', label: 'Projects' },
  { href: '/archive', label: 'Archive' },
  { href: '/about', label: 'About' },
];

/**
 * 外部链接 / 联系方式。
 * TODO: 把下面的占位地址换成你真实的 GitHub、掘金、邮箱。
 */
export const SOCIAL = {
  github: 'https://github.com/lichenyyyy',
  juejin: 'https://juejin.cn/user/0000000000000',
  email: 'hello@lichenyyyy.top',
};

/** 首页「当前关注方向」 */
export const FOCUS: string[] = [
  'HarmonyOS / ArkUI / ArkTS',
  'ASCF / WebView / JSBridge',
  'Frontend / Next.js',
  'AI Workflow / Dify',
  'Debugging / Project Review',
];
