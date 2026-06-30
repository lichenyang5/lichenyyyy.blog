---
title: Docker 学习笔记（四）：Dockerfile，把项目打成自己的镜像
description: 从 FROM、WORKDIR、COPY、RUN、ENV、EXPOSE、CMD 开始，理解如何用 Dockerfile 构建 Node/Nest/React 项目镜像。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - Dockerfile
  - 镜像构建
  - Node.js
  - NestJS
---

# Docker 学习笔记（四）：Dockerfile，把项目打成自己的镜像

前几篇讲的是：

- 怎么拉别人做好的镜像；
- 怎么用 `docker run` 启动容器；
- 怎么理解 Docker 网络。

但是学 Docker 最关键的一步是：

> 如何把自己的项目做成镜像。

这个过程靠的就是 Dockerfile。

---

## 1. Dockerfile 是什么？

Dockerfile 是一个文本文件，里面写着构建镜像的步骤。

你可以把它理解成：

```text
Dockerfile = 镜像制作说明书
```

比如一个最小 Node 项目的 Dockerfile：

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

然后执行：

```bash
docker build -t my-node-app:1.0 .
```

就能构建出一个镜像：

```bash
docker images
```

运行：

```bash
docker run -d --name my-node-app -p 3000:3000 my-node-app:1.0
```

---

## 2. Dockerfile 的核心指令

### 2.1 `FROM`：基于哪个镜像

```dockerfile
FROM node:22-alpine
```

任何 Dockerfile 基本都从 `FROM` 开始。

它表示：

> 我的镜像不是从零开始，而是基于一个已有镜像继续加工。

比如：

```dockerfile
FROM nginx:alpine
FROM node:22-alpine
FROM mongo:7
```

实际项目中，不建议随便写 `latest`，因为它会变化。

更推荐写明确版本：

```dockerfile
FROM node:22-alpine
```

---

### 2.2 `WORKDIR`：设置工作目录

```dockerfile
WORKDIR /app
```

后面的命令默认都在 `/app` 目录下执行。

相当于：

```bash
cd /app
```

如果目录不存在，Docker 会自动创建。

---

### 2.3 `COPY`：复制文件到镜像里

```dockerfile
COPY package*.json ./
COPY . .
```

第一句：把本地的 `package.json`、`package-lock.json` 复制到镜像的 `/app`。

第二句：把当前目录其他文件复制进去。

为什么不直接先 `COPY . .`？

因为 Docker 构建有缓存机制。

更推荐这样写：

```dockerfile
COPY package*.json ./
RUN npm ci
COPY . .
```

这样只要依赖文件没变，`npm ci` 这一层就可以复用缓存，加快构建。

---

### 2.4 `RUN`：构建阶段执行命令

```dockerfile
RUN npm ci
RUN npm run build
```

`RUN` 是在构建镜像时执行。

它和 `CMD` 的区别非常重要：

| 指令 | 执行时机 |
|---|---|
| `RUN` | docker build 构建镜像时 |
| `CMD` | docker run 启动容器时 |

---

### 2.5 `ENV`：设置默认环境变量

```dockerfile
ENV NODE_ENV=production
```

这样容器运行时默认有这个环境变量。

但更敏感的配置，比如数据库密码，不建议写死在 Dockerfile 里。

更推荐运行时传入：

```bash
docker run -e MONGO_URL=xxx my-api:1.0
```

或者在 Compose 里配置。

---

### 2.6 `EXPOSE`：声明容器使用哪个端口

```dockerfile
EXPOSE 3000
```

注意：

> EXPOSE 只是声明，不等于自动映射端口。

真正让宿主机访问容器，还要靠：

```bash
-p 3000:3000
```

`EXPOSE` 更像是告诉别人：这个容器内部服务监听的是 3000 端口。

---

### 2.7 `CMD`：容器启动命令

```dockerfile
CMD ["npm", "start"]
```

它表示容器启动后默认执行什么命令。

推荐使用 JSON 数组形式：

```dockerfile
CMD ["node", "dist/main.js"]
```

而不是：

```dockerfile
CMD node dist/main.js
```

数组形式更清晰，也更适合信号处理。

---

## 3. 为 NestJS 后端写 Dockerfile

假设项目是 NestJS 后端：

```text
nest-server/
  src/
  package.json
  package-lock.json
  tsconfig.json
  nest-cli.json
```

可以写：

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

这是一个多阶段构建。

它的思路是：

```text
第一阶段 deps：安装完整依赖
第二阶段 builder：编译 TypeScript
第三阶段 runner：只保留生产运行需要的文件
```

好处是最终镜像更干净。

---

## 4. 为 React 前端写 Dockerfile

假设前端是 React/Vite：

```text
web/
  src/
  package.json
  index.html
  vite.config.ts
```

Dockerfile：

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

思路：

```text
Node 阶段：负责安装依赖、打包前端
Nginx 阶段：只负责托管 dist 静态文件
```

前端最终不需要 Node.js 运行环境，只需要 Nginx 托管静态资源。

---

## 5. `.dockerignore` 很重要

很多人写 Dockerfile，会忘记 `.dockerignore`。

它类似 `.gitignore`，用于告诉 Docker 构建时不要把某些文件复制进去。

建议：

```dockerignore
node_modules
dist
build
.git
.gitignore
Dockerfile
.dockerignore
npm-debug.log
.env
.env.*
```

如果不写 `.dockerignore`，可能会导致：

- 构建上下文很大；
- 本地 `node_modules` 被复制进镜像；
- `.env` 等敏感文件进镜像；
- 构建速度变慢。

---

## 6. 构建镜像

在 Dockerfile 所在目录执行：

```bash
docker build -t my-api:1.0 .
```

解释：

| 部分 | 含义 |
|---|---|
| `docker build` | 构建镜像 |
| `-t my-api:1.0` | 镜像名和标签 |
| `.` | 构建上下文是当前目录 |

查看镜像：

```bash
docker images
```

运行镜像：

```bash
docker run -d --name my-api -p 3000:3000 my-api:1.0
```

查看日志：

```bash
docker logs -f my-api
```

---

## 7. 镜像标签怎么理解？

镜像名通常长这样：

```text
my-api:1.0
```

其中：

```text
my-api  是镜像名
1.0     是 tag
```

如果不写 tag，默认是 `latest`。

```bash
docker build -t my-api .
```

等价于：

```bash
docker build -t my-api:latest .
```

但在实际项目里，不建议完全依赖 `latest`。

更推荐：

```bash
docker build -t my-api:2026-06-29 .
docker build -t my-api:v1.0.0 .
docker build -t my-api:commit-abc123 .
```

这样出问题时更容易回滚。

---

## 8. 第四篇小结

Dockerfile 的主线是：

```text
选择基础镜像
  ↓
设置工作目录
  ↓
复制依赖声明文件
  ↓
安装依赖
  ↓
复制项目代码
  ↓
构建项目
  ↓
声明端口
  ↓
指定启动命令
```

常见指令：

| 指令 | 作用 |
|---|---|
| `FROM` | 基础镜像 |
| `WORKDIR` | 工作目录 |
| `COPY` | 复制文件 |
| `RUN` | 构建阶段执行命令 |
| `ENV` | 默认环境变量 |
| `EXPOSE` | 声明端口 |
| `CMD` | 容器启动命令 |

下一篇讲 Docker Compose：不用手写一堆 `docker run`，用一个 YAML 同时启动前端、后端和 MongoDB。

---

## 参考资料

- Dockerfile reference: https://docs.docker.com/reference/dockerfile/
- Build, tag, and publish an image: https://docs.docker.com/get-started/docker-concepts/building-images/build-tag-and-publish-an-image/
- Docker build reference: https://docs.docker.com/reference/cli/docker/buildx/build/
