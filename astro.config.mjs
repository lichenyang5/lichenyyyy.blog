// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // 站点地址：用于生成绝对 URL（RSS / sitemap / Open Graph）。
  // 换绑域名后改这里即可。
  site: 'https://www.lichenyyyy.top',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    // 代码高亮：浅色主题，贴合白底极简风格
    shikiConfig: {
      theme: 'github-light',
      wrap: false,
    },
  },
});
