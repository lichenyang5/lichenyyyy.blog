---
title: "从本地 Markdown 到服务器自动部署：我的 Astro 博客上线流程"
description: "这篇文章记录我如何把一个 Astro 静态博客部署到自己的服务器，并用 GitHub Actions 实现提交 Markdown 后自动构建和发布。"
date: 2026-06-17
updated: 2026-06-17
tags: ["Astro", "GitHub Actions", "Nginx", "VPS", "部署"]
category: "部署"
source: "original"
sourceUrl: ""
draft: false
---

# 从本地 Markdown 到服务器自动部署：我的 Astro 博客上线流程

## 为什么要写这个

我之前的网站更像一个临时页面，后来想把它改成一个长期维护的个人博客。

一开始我以为博客上线就是把页面写好，然后丢到服务器上就结束了。但真正动手之后才发现，问题不只是“页面能不能打开”，而是后续如何持续写文章。

如果每次新增文章都要手动登录服务器、上传文件、替换目录、重载 Nginx，这件事很快就会变得麻烦。

所以这次我想把流程整理成这样：

```text
本地新增 Markdown
→ git commit
→ git push
→ GitHub Actions 自动构建
→ 自动同步 dist 到服务器
→ Nginx 直接访问最新静态文件
```

这样以后发文章就不需要手动上传服务器了。

## 问题是什么

我的博客技术栈是 Astro，文章放在：

```text
src/content/posts/
```

Astro 构建后会生成静态文件：

```text
dist/
```

服务器上用 Nginx 托管这些静态文件。

这里真正要解决的是三个问题：

1. 如何把本地构建出来的 `dist` 放到服务器正确目录。
2. 如何让 Nginx 访问静态文件，而不是继续代理到旧的 Node 服务。
3. 如何让 GitHub 在每次 `push` 后自动完成构建和部署。

## 我的理解

静态博客和后端服务不一样。

它不需要长期运行一个 Node 进程，也不需要 PM2。Astro 构建完成后，最终产物就是 HTML、CSS、JS、图片和 RSS 等静态资源。

所以服务器上真正需要做的事情很少：

```text
Nginx root 指向站点目录
站点目录里放 dist 的内容
用户访问域名时返回静态文件
```

后续自动化也是围绕这一点做的：

```text
GitHub Actions 负责 build
rsync 负责同步文件
Nginx 负责提供访问
```

## 第一步：本地构建博客

在项目根目录执行：

```bash
npm install
npm run build
```

构建成功后会生成：

```text
dist/
```

这个目录就是最终要部署到服务器的内容。

如果只是手动部署，可以把 `dist` 上传到服务器站点目录。

## 第二步：确认服务器站点目录

服务器上需要确认 Nginx 当前域名指向哪里。

可以查看 Nginx 配置：

```bash
sudo /www/server/nginx/sbin/nginx -T | grep -A 20 -B 5 "example.com"
```

重点看两个配置：

```nginx
server_name example.com;
root /www/wwwroot/example.com/;
```

这里的 `root` 就是站点目录。

我的目标是让这个目录变成纯静态站点目录，也就是里面直接放：

```text
index.html
404.html
_astro/
posts/
rss.xml
sitemap-index.xml
```

## 第三步：注意旧站的反向代理

这一步是我实际部署时踩到的坑。

虽然 Nginx 的 `root` 已经指向了新目录，但页面打开后还是旧网站。原因是配置里还有一段反向代理：

```nginx
location ^~ /
{
    proxy_pass http://127.0.0.1:3000;
}
```

这会导致所有请求都被转发到旧的 Node 服务，Nginx 根本不会读取新的静态文件。

解决方式是禁用这个代理配置，只保留静态文件访问。

如果是宝塔环境，代理配置可能在类似目录：

```text
/www/server/panel/vhost/nginx/proxy/example.com/
```

可以先把代理配置文件改名备份：

```bash
sudo mv old-proxy.conf old-proxy.conf.bak
```

然后测试并重载 Nginx：

```bash
sudo /www/server/nginx/sbin/nginx -t
sudo /www/server/nginx/sbin/nginx -s reload
```

## 第四步：配置 SSH Key

自动部署不能每次都手动输入密码，所以要给 GitHub Actions 准备一把部署用的 SSH Key。

本地生成密钥：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/blog_deploy
```

会生成两个文件：

```text
blog_deploy      私钥
blog_deploy.pub  公钥
```

公钥放到服务器：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '这里放 blog_deploy.pub 的内容' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

然后本地测试：

```bash
ssh -i ~/.ssh/blog_deploy user@example-server
```

如果可以直接登录，说明 SSH Key 配置成功。

## 第五步：配置 GitHub Secrets

私钥不能提交到仓库里，要放到 GitHub Secrets。

在仓库里进入：

```text
Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

添加这些变量：

```text
SERVER_HOST   服务器地址
SERVER_USER   登录用户
SERVER_TARGET 服务器站点目录
SERVER_SSH_KEY 私钥完整内容
```

其中 `SERVER_SSH_KEY` 要复制完整私钥，从：

```text
-----BEGIN OPENSSH PRIVATE KEY-----
```

到：

```text
-----END OPENSSH PRIVATE KEY-----
```

中间换行也要保留。

## 第六步：编写 GitHub Actions

在项目里新增：

```text
.github/workflows/deploy.yml
```

内容如下：

```yaml
name: Deploy Blog

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install
        run: npm ci

      - name: Check
        run: npm run check --if-present

      - name: Build
        run: npm run build

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SERVER_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.SERVER_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy
        run: |
          rsync -az --delete \
            -e "ssh -i ~/.ssh/deploy_key" \
            dist/ ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_HOST }}:${{ secrets.SERVER_TARGET }}/
```

这里的关键是最后一步：

```bash
rsync -az --delete dist/ user@host:/server/path/
```

它会把本地构建出的 `dist` 同步到服务器站点目录。

`--delete` 表示服务器上多余的旧文件也会被删除，避免旧文章、旧资源残留。

## 第七步：以后怎么发文章

以后新增文章，只需要把 Markdown 放进：

```text
src/content/posts/
```

例如：

```text
src/content/posts/从本地 Markdown 到服务器自动部署：我的 Astro 博客上线流程.md
```

文章开头写 frontmatter：

```md
---
title: "文章标题"
description: "文章摘要"
date: 2026-06-17
updated: 2026-06-17
tags: ["Astro", "部署"]
category: "部署"
source: "original"
sourceUrl: ""
draft: false
---
```

然后提交：

```bash
git add .
git commit -m "新增文章：Astro 博客自动部署流程"
git push
```

GitHub Actions 成功后，网站就会自动更新。

## 踩坑记录

这次部署里有几个点需要注意。

第一，服务器里可能同时有多个 Nginx。

有的系统默认在：

```text
/etc/nginx/nginx.conf
```

宝塔环境可能在：

```text
/www/server/nginx/conf/nginx.conf
```

要看当前真正运行的是哪个：

```bash
ps -ef | grep nginx
```

第二，`root` 指向正确目录，不代表页面一定会读取静态文件。

如果还有反向代理规则，例如代理到 `127.0.0.1:3000`，请求会优先走代理。

第三，目录权限要保证 Nginx 能读取。

可以统一处理：

```bash
sudo find /www/wwwroot/example.com -type d -exec chmod 755 {} \;
sudo find /www/wwwroot/example.com -type f -exec chmod 644 {} \;
```

第四，GitHub Actions 失败时，不要只看 Summary。

真正的错误要点进：

```text
Actions
→ 失败的 workflow
→ build-and-deploy
→ 展开红色步骤
```

常见失败原因包括：

- `npm ci` 找不到 `package-lock.json`
- SSH 私钥复制不完整
- 服务器目录权限不足
- Nginx 仍然代理到旧服务

## 总结

这套流程跑通之后，个人博客的维护方式就变得很简单：

```text
写 Markdown
提交 Git
GitHub Actions 自动构建
rsync 同步到服务器
Nginx 提供静态访问
```

个人博客本身不需要复杂后端。

对我来说，更重要的是把它变成一个长期写作入口：技术文章、项目复盘、调试记录都可以用 Markdown 慢慢沉淀下来。

网站负责展示，GitHub 负责记录，服务器负责托管。

这样后面写文章时，就不用再把精力花在“怎么发布”上，而是回到内容本身。
