---
title: Docker 完整学习笔记：从镜像、容器到 Dockerfile、Compose 和镜像仓库
description: 看完 Docker 入门视频后，对镜像、容器、Docker Hub、镜像仓库、docker run、Docker 网络、Dockerfile、Docker Compose 和镜像推送的一次系统整理。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - Dockerfile
  - Docker Compose
  - 容器
  - 镜像
  - 镜像仓库
  - 部署
---

# Docker 完整学习笔记：从镜像、容器到 Dockerfile、Compose 和镜像仓库

最近系统看了一遍 Docker 的视频，里面讲到了镜像、容器、Docker Hub、镜像仓库、Docker Compose、`docker run`、`-v`、`-e`、Dockerfile、网络、子网等等。

刚开始看这些概念的时候，很容易有一种感觉：

> 每个词好像都听懂了，但真要自己部署一个项目，又不知道从哪里开始。

所以这篇文章不打算写成“Docker 命令大全”。命令大全其实交给 AI 或文档查就行，背下来意义不大。真正重要的是把 Docker 的几个核心概念串起来：

- 镜像到底是什么？
- 容器和镜像是什么关系？
- Docker Hub 和镜像仓库是干什么的？
- `docker run` 里的 `-p`、`-v`、`-e` 到底在控制什么？
- Docker 网络为什么有 bridge、子网、网关？
- Dockerfile 是怎么把项目打成镜像的？
- Docker Compose 为什么能一个 YAML 启动前端、后端和数据库？
- 自己做好的镜像怎么上传到 Docker Hub 或公司内网镜像仓库？

这篇文章按照“从问题出发”的方式来整理。

---

## 1. Docker 解决的第一个问题：为什么我电脑能跑，别人电脑跑不起来？

如果做过前后端项目，大概率遇到过这种情况：

我本地项目跑得好好的，发给别人之后，对方说：

> 你这个项目启动不了。

然后开始排查：

- Node 版本不一样；
- npm / pnpm 版本不一样；
- 本地有没有装 MongoDB；
- 数据库端口是不是 27017；
- 环境变量有没有配；
- Windows、macOS、Linux 路径不一样；
- 有些依赖在公司内网拉不下来；
- 部署服务器上缺少运行环境。

最后你会发现，项目代码本身可能没有问题，问题出在“运行环境不一致”。

Docker 解决的核心问题就是：

> 不只交付代码，而是把代码、依赖、运行环境、启动方式一起打包。

以前我们交付项目，可能是：

```txt
代码 + README + 你自己装环境
```

用了 Docker 之后，更像是：

```txt
镜像 + 启动参数 + 网络 + 数据卷
```

这样别人拿到之后，不需要从零配置环境，只要机器上有 Docker，就可以按同样方式启动。

这也是为什么 Docker 特别适合：

- 前后端项目部署；
- 数据库本地开发；
- 测试环境快速搭建；
- 公司内网环境迁移；
- CI/CD 自动构建；
- “我电脑能跑，服务器也要能跑”的场景。

---

## 2. 先建立一个心智模型：镜像是模板，容器是运行实例

Docker 里最基础的两个词是：

- Image：镜像；
- Container：容器。

很多人刚学的时候会把它们混在一起，其实可以这样理解：

```txt
镜像 Image      = 一个只读模板
容器 Container = 镜像运行起来之后的实例
```

如果用前端类比：

```ts
class App {}

const app1 = new App()
const app2 = new App()
```

那么：

```txt
class App  类似镜像
app1/app2  类似容器
```

一个镜像可以启动很多个容器。

比如 `nginx` 镜像，可以启动三个容器：

```txt
nginx 镜像
   ├── nginx-container-1
   ├── nginx-container-2
   └── nginx-container-3
```

镜像本身不运行，它只是一个打包好的模板。真正跑起来的是容器。

### 2.1 镜像里面有什么？

一个镜像通常包含：

- 基础系统环境，比如 Alpine、Debian、Ubuntu；
- 运行时，比如 Node.js、Java、Nginx；
- 项目代码；
- 依赖包；
- 启动命令；
- 一些默认环境变量或配置。

比如一个后端项目镜像可以理解成：

```txt
node:20 基础环境
+ package.json
+ node_modules / pnpm install 后的依赖
+ dist 编译产物
+ 启动命令 npm run start:prod
= 我的后端镜像
```

### 2.2 容器里面有什么？

容器是镜像运行起来之后的进程环境。它有：

- 自己的文件系统；
- 自己的进程空间；
- 自己的网络地址；
- 自己的环境变量；
- 自己的启动命令。

但是容器不是虚拟机。

虚拟机通常会模拟一整套操作系统，而容器更轻量，它共享宿主机内核，只隔离进程、网络、文件系统等资源。

所以 Docker 的优势是：

- 启动快；
- 占用少；
- 环境一致；
- 迁移方便。

---

## 3. Docker Hub 和镜像仓库：可以理解成 npm 仓库

学前端时，我们会从 npm 拉包：

```txt
npm install react
npm install express
```

Docker 也有类似的仓库。

比如：

```txt
docker pull nginx
docker pull mongo
docker pull node
```

这些镜像通常来自 Docker Hub。

可以这样类比：

```txt
npm 包仓库       -> npm registry
Docker 镜像仓库 -> Docker Hub / 私有镜像仓库
```

镜像仓库的作用是：

- 存放镜像；
- 分发镜像；
- 管理镜像版本；
- 让不同机器可以拉取同一个运行环境。

### 3.1 Docker Hub 是公共镜像仓库

Docker Hub 是最常见的公共镜像仓库。比如：

- `nginx`：Nginx 官方镜像；
- `mongo`：MongoDB 镜像；
- `mysql`：MySQL 镜像；
- `redis`：Redis 镜像；
- `node`：Node.js 镜像。

你可以把它理解为“Docker 世界的 npm”。

### 3.2 公司内网通常会有私有镜像仓库

在公司里，不一定能直接访问 Docker Hub。尤其是内网、涉密环境、离线环境，可能会用：

- Harbor；
- Nexus；
- GitLab Container Registry；
- 阿里云/华为云/腾讯云容器镜像服务；
- 公司自建 Registry。

这时候镜像地址可能长这样：

```txt
registry.company.com/team/project-backend:1.0.0
```

意思是：

```txt
镜像仓库地址 / 命名空间 / 镜像名 : 标签
```

### 3.3 镜像标签不是版本锁死，只是一个名字

很多人以为 `latest` 就是最新稳定版，其实不一定。

`latest` 本质上只是一个 tag。它只是一个名字，不保证稳定，也不保证永远指向你想要的版本。

所以项目部署时更推荐写明确版本：

```txt
mongo:7
node:20-alpine
nginx:1.27-alpine
```

这样可复现性更强。

---

## 4. docker run：它不是一个命令，而是在描述“怎么启动容器”

刚开始学 Docker 时，最容易被 `docker run` 后面的一长串参数吓到。

比如：

```bash
docker run -d \
  --name my-mongo \
  -p 27017:27017 \
  -v mongo-data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=123456 \
  mongo:7
```

看起来很复杂，但它其实只是在回答几个问题：

```txt
用哪个镜像？
容器叫什么名字？
前台跑还是后台跑？
端口怎么映射？
数据存在哪里？
环境变量是什么？
连到哪个网络？
容器挂了要不要自动重启？
```

也就是说，`docker run` 不是单纯“运行一下”，它是在描述一个容器的运行配置。

### 4.1 常见参数先理解意思，不要死背

| 参数 | 作用 | 可以怎么理解 |
|---|---|---|
| `-d` | 后台运行 | 不占用当前终端 |
| `--name` | 指定容器名 | 方便后面停止、查看日志 |
| `-p` | 端口映射 | 宿主机端口 -> 容器端口 |
| `-v` | 挂载数据卷或目录 | 数据不要只放在容器内部 |
| `-e` | 设置环境变量 | 传配置，比如账号密码 |
| `--network` | 指定网络 | 让容器加入某个网络 |
| `--restart` | 重启策略 | 容器异常退出后是否重启 |
| `--rm` | 退出后自动删除容器 | 适合临时测试 |

真正重要的不是记住每个参数，而是知道它们分别控制容器的哪一部分。

---

## 5. `-p`：端口映射，解决“外面怎么访问容器”

容器默认是隔离的。你的服务在容器里监听 3000 端口，并不等于宿主机的 3000 端口也能访问。

所以需要端口映射：

```bash
-p 8080:3000
```

它的意思是：

```txt
宿主机 8080 端口 -> 容器 3000 端口
```

也就是说：

```txt
浏览器访问 http://localhost:8080
实际进入容器内部的 3000 端口
```

这个方向很重要，永远记住：

```txt
-p 宿主机端口:容器端口
```

比如：

```bash
-p 27017:27017
```

表示宿主机的 27017 映射到 MongoDB 容器的 27017。

### 5.1 EXPOSE 不等于端口映射

Dockerfile 里可能看到：

```dockerfile
EXPOSE 3000
```

它只是声明容器内部服务可能会用 3000 端口，更像文档说明。

真正让宿主机访问容器，还需要 `-p` 或 Compose 里的 `ports`。

---

## 6. `-v`：数据卷，解决“容器删了数据怎么办”

容器是可以随时删除、重建的。

这很好，因为环境可重建。

但也有一个问题：

> 如果数据库数据存在容器内部，容器删了，数据是不是也没了？

所以 Docker 里有 volume，也就是数据卷。

例如 MongoDB 的数据目录通常在容器内的：

```txt
/data/db
```

如果不挂载数据卷，数据就会跟容器绑定得很死。

更合理的方式是：

```bash
-v mongo-data:/data/db
```

意思是：

```txt
把名为 mongo-data 的 Docker volume
挂载到容器内部的 /data/db
```

这样即使容器删除，volume 还在，数据不会跟着容器一起消失。

### 6.1 volume 和 bind mount 的区别

`-v` 常见两种写法：

```bash
-v mongo-data:/data/db
```

这是 Docker 管理的数据卷。

```bash
-v /my/local/path:/app
```

这是把宿主机目录挂进容器，通常叫 bind mount。

简单理解：

| 类型 | 适合场景 |
|---|---|
| Docker volume | 数据库数据、持久化数据 |
| bind mount | 本地开发时代码同步、配置文件挂载 |

开发时经常把代码目录挂进容器；生产部署时更常用镜像本身包含代码，然后只挂载数据或配置。

---

## 7. `-e`：环境变量，解决“配置怎么传进去”

很多服务不应该把配置写死在代码里。

比如：

- 数据库地址；
- 数据库账号；
- 数据库密码；
- JWT 密钥；
- 运行环境；
- 端口号。

Docker 里经常用 `-e` 传环境变量：

```bash
-e NODE_ENV=production
-e MONGO_URL=mongodb://mongo:27017/app
```

对于容器来说，这些变量就像系统环境变量一样。

你的 Node.js 代码里可以通过：

```ts
process.env.MONGO_URL
```

读取。

这也是为什么 Docker、Kubernetes、CI/CD 都大量使用环境变量。

因为配置和代码应该分离。

---

## 8. Docker 网络：容器之间怎么互相访问？

Docker 网络是 Docker 里非常重要的一块。

初学时最容易踩的坑是：

> 在容器里访问 `localhost`，访问的是谁？

答案是：访问容器自己。

这点非常关键。

假设后端容器要访问 MongoDB：

```txt
backend 容器
mongo 容器
```

如果你在后端容器里写：

```txt
mongodb://localhost:27017/app
```

这个 `localhost` 指的是后端容器自己，不是 MongoDB 容器，也不是宿主机。

所以容器间通信不能随便写 `localhost`。

### 8.1 默认 bridge 网络

Docker 安装后会有一个默认的 bridge 网络。

如果你直接 `docker run`，不指定网络，容器通常会进入默认 bridge 网络。

但是默认 bridge 网络有一些不方便的地方，比如容器之间不能很好地通过名字互相发现。

所以实际项目更推荐创建自定义 bridge 网络。

### 8.2 自定义 bridge 网络：容器可以用名字互相访问

比如创建一个网络：

```bash
docker network create app-net
```

然后后端和数据库都加入这个网络：

```txt
app-net
  ├── backend
  └── mongo
```

这时后端访问 MongoDB，可以用容器名：

```txt
mongodb://mongo:27017/app
```

因为它们在同一个 Docker 网络里，Docker 会帮你做内部 DNS 解析。

可以理解成：

```txt
mongo 这个名字 -> mongo 容器的内部 IP
```

### 8.3 子网、网关和容器 IP 是什么？

Docker 网络底层也有类似局域网的概念。

比如一个自定义网络可能长这样：

```txt
Network: app-net
Subnet: 172.20.0.0/16
Gateway: 172.20.0.1

backend: 172.20.0.2
mongo:   172.20.0.3
redis:   172.20.0.4
```

可以画成这样：

```txt
宿主机
  |
  |  Docker bridge / gateway: 172.20.0.1
  |
  +---------------- Docker network: app-net ----------------+
  |                                                         |
  |  backend 172.20.0.2  --->  mongo 172.20.0.3              |
  |       |                       |                         |
  |       +------ 用服务名 mongo 访问，不需要记 IP -----------+
  |
  +---------------------------------------------------------+
```

理论上你可以记 IP，但实际开发不应该依赖容器 IP，因为容器重建后 IP 可能变化。

更推荐用：

```txt
服务名 / 容器名
```

这也是 Compose 里特别好用的一点。

---

## 9. Docker Compose：一个 YAML 管理多个容器

如果只有一个容器，用 `docker run` 还可以接受。

但是一个真实项目往往不是一个容器：

```txt
前端容器
后端容器
MongoDB 容器
Redis 容器
Nginx 容器
```

如果每个都手写一长串 `docker run`，会很难维护。

Docker Compose 的作用就是：

> 用一个 YAML 文件描述一组服务、网络、数据卷和启动配置。

比如一个典型项目可以这样组织：

```txt
compose.yaml
  services:
    frontend
    backend
    mongo
  networks:
    app-net
  volumes:
    mongo-data
```

然后用一条命令启动整套环境。

### 9.1 Compose 的核心不是命令，而是“声明式配置”

`docker run` 更像命令式：

```txt
请帮我启动这个容器，参数是……
```

Compose 更像声明式：

```txt
我的应用由这些服务组成：
- backend 需要从 Dockerfile 构建
- mongo 使用 mongo:7 镜像
- backend 依赖 mongo
- mongo 数据挂到 mongo-data
- backend 和 mongo 在同一个网络里
```

然后 Docker 根据这个 YAML 去创建容器、网络、数据卷。

### 9.2 一个前后端 + MongoDB 的 Compose 示例

下面是一个精简示例，适合理解结构，不建议直接无脑复制到所有项目：

```yaml
services:
  mongo:
    image: mongo:7
    container_name: demo-mongo
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: 123456
    volumes:
      - mongo-data:/data/db
    networks:
      - app-net

  backend:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: demo-backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      MONGO_URL: mongodb://admin:123456@mongo:27017/app?authSource=admin
    ports:
      - "3000:3000"
    depends_on:
      - mongo
    networks:
      - app-net

  frontend:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: demo-frontend
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - backend
    networks:
      - app-net

volumes:
  mongo-data:

networks:
  app-net:
    driver: bridge
```

这个文件里最值得注意的是：

```txt
backend 访问 mongo，不写 localhost，而是写 mongo
```

因为 `mongo` 是 Compose 里的服务名。

Compose 默认会给项目创建网络，服务之间可以通过服务名互相访问。如果你显式写了 `networks`，只要它们加入同一个网络，也能通过服务名访问。

---

## 10. Dockerfile：把项目打成自己的镜像

Dockerfile 是用来构建镜像的文本文件。

可以理解成：

> Dockerfile 不是启动容器的配置，而是“如何制作镜像”的说明书。

比如一个 Node 后端项目，平时本地可能这样启动：

```txt
安装 Node
安装 pnpm
安装依赖
编译 TypeScript
启动服务
```

Dockerfile 就是把这些步骤写成镜像构建流程。

### 10.1 Dockerfile 常见指令

| 指令 | 作用 |
|---|---|
| `FROM` | 指定基础镜像 |
| `WORKDIR` | 设置工作目录 |
| `COPY` | 复制文件到镜像里 |
| `RUN` | 构建时执行命令 |
| `ENV` | 设置环境变量 |
| `EXPOSE` | 声明容器端口 |
| `CMD` | 容器启动时默认执行的命令 |
| `ENTRYPOINT` | 更强控制启动入口 |

关键区别是：

```txt
RUN  是构建镜像时执行
CMD  是容器启动时执行
```

### 10.2 一个 Node / NestJS 后端 Dockerfile 示例

假设你的后端是 NestJS，构建后产物在 `dist`：

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

这个 Dockerfile 分成三段：

```txt
deps    负责安装依赖
builder 负责构建项目
runner  负责运行最终产物
```

这叫多阶段构建。

好处是最终镜像可以更干净，不把构建过程中的无关文件都塞进去。

### 10.3 为什么要有 `.dockerignore`？

构建镜像时，Docker 会把构建上下文传给 Docker daemon。

如果你不写 `.dockerignore`，可能会把这些东西也传进去：

```txt
node_modules
.git
dist
.env
日志文件
临时文件
```

这会导致：

- 构建变慢；
- 镜像变大；
- 敏感信息泄露；
- 缓存失效频繁。

一个常见 `.dockerignore`：

```txt
node_modules
.git
.gitignore
Dockerfile
compose.yaml
npm-debug.log
.env
*.log
```

### 10.4 Dockerfile 的层缓存

Dockerfile 每一条指令通常都会形成一层。

如果前面的层没变，Docker 可以复用缓存。

所以 Node 项目里经常先复制 `package.json`，再安装依赖，最后复制源码：

```dockerfile
COPY package*.json ./
RUN npm ci
COPY . .
```

这样只要依赖文件没变，就不用每次重新安装依赖。

如果你直接：

```dockerfile
COPY . .
RUN npm ci
```

那么只要任何源码改动，都可能导致依赖安装缓存失效。

---

## 11. build、tag、push：把自己的项目变成可分发镜像

当你有了 Dockerfile，就可以构建镜像。

镜像名一般包含三个部分：

```txt
仓库地址 / 命名空间 / 镜像名 : tag
```

比如：

```txt
lichenyang5/demo-backend:1.0.0
```

或者公司内网：

```txt
registry.company.com/ascf/demo-backend:1.0.0
```

### 11.1 tag 是版本管理的关键

不要只依赖 `latest`。

更推荐：

```txt
1.0.0
1.0.1
2026-06-29
commit hash
```

比如：

```txt
demo-backend:2026-06-29
demo-backend:abc1234
```

这样出问题时能知道是哪一次构建。

### 11.2 推送镜像的大致流程

概念上只有三步：

```txt
1. 登录镜像仓库
2. 给镜像打上仓库地址和 tag
3. push 到仓库
```

示意：

```bash
docker login

docker build -t lichenyang5/demo-backend:1.0.0 .

docker push lichenyang5/demo-backend:1.0.0
```

如果是公司镜像仓库：

```bash
docker login registry.company.com

docker build -t registry.company.com/team/demo-backend:1.0.0 .

docker push registry.company.com/team/demo-backend:1.0.0
```

以后另一台机器只要能访问这个仓库，就可以拉取：

```bash
docker pull registry.company.com/team/demo-backend:1.0.0
```

---

## 12. 公司内网/离线环境怎么处理镜像？

这点对实际工作很重要。

很多公司内网机器不能直接访问 Docker Hub。

这时候常见方案有三种。

### 12.1 方案一：公司内网镜像仓库

最规范的方式是公司提供私有镜像仓库。

流程是：

```txt
外网机器构建镜像
     ↓
推送到公司镜像仓库
     ↓
内网机器从公司镜像仓库拉取
```

优点是流程规范，适合团队协作。

### 12.2 方案二：镜像 save/load 离线传输

如果内网完全不能访问镜像仓库，可以用离线包：

```txt
外网机器 docker save 导出镜像 tar
     ↓
通过 U 盘/内网传输/制品平台传进去
     ↓
内网机器 docker load 导入镜像
```

概念上是：

```bash
docker save -o demo-backend.tar demo-backend:1.0.0

docker load -i demo-backend.tar
```

这对你之前遇到的“公司内网不能 pull Docker Hub 镜像”很有意义。

如果公司电脑拉不到 `mongo:7`，不是 Docker 不会用，而是网络链路或代理限制导致拉取失败。

### 12.3 方案三：提前准备基础镜像

比如项目依赖：

```txt
node:20-alpine
mongo:7
nginx:1.27-alpine
```

这些基础镜像也要提前进内网。

否则你 Dockerfile 第一行：

```dockerfile
FROM node:20-alpine
```

构建时仍然会尝试拉基础镜像。

如果内网拉不到，构建就会失败。

所以离线环境里要注意：

```txt
不仅业务镜像要准备，基础镜像也要准备。
```

---

## 13. 把 Docker 用到自己的前后端项目里

如果用你的前后端项目举例，比如：

```txt
react-manager           前端
react-manager-server    后端
MongoDB                 数据库
```

Docker 化之后，可以拆成：

```txt
frontend 镜像
backend 镜像
mongo 官方镜像
```

Compose 管理：

```txt
services:
  frontend
  backend
  mongo
```

访问关系是：

```txt
浏览器 -> 宿主机 8080 -> frontend 容器
frontend -> 后端 API 地址
backend -> mongo:27017
mongo -> mongo-data volume
```

开发时和生产时的区别：

| 场景 | 前端 | 后端 | 数据库 |
|---|---|---|---|
| 本地开发 | 可能用 Vite dev server | nodemon / ts-node | Docker 跑 MongoDB |
| 测试环境 | Nginx 托管前端产物 | Node 运行 dist | Docker volume 持久化 |
| 生产环境 | 独立镜像 | 独立镜像 | 托管数据库或容器数据库 |

所以 Docker 不是一上来就要把所有东西都搞复杂。

更推荐的学习路线是：

```txt
第一步：先用 Docker 跑 MongoDB
第二步：后端连接 Docker 里的 MongoDB
第三步：给后端写 Dockerfile
第四步：用 Compose 同时启动 backend + mongo
第五步：前端也打镜像
第六步：Compose 管理 frontend + backend + mongo
第七步：推送镜像到 Docker Hub / 公司镜像仓库
```

这样每一步都能验证，不会一下子被所有概念淹没。

---

## 14. 常见坑：Docker 初学者最容易卡在哪里？

### 14.1 容器里的 localhost 不是宿主机

这是第一大坑。

```txt
容器里的 localhost = 容器自己
```

后端容器访问 MongoDB 容器，不应该写：

```txt
localhost:27017
```

而应该写服务名：

```txt
mongo:27017
```

前提是两个容器在同一个网络里。

### 14.2 端口映射方向写反

记住：

```txt
-p 宿主机端口:容器端口
```

比如：

```bash
-p 8080:80
```

表示浏览器访问宿主机 8080，进入容器 80。

### 14.3 容器删了，volume 还在

很多人以为删除容器就是删除所有数据。

其实如果数据在 volume 里，删除容器不一定删除 volume。

这既是优点，也是坑。

优点是数据能保留；坑是你以为“重置环境”了，其实旧数据还在。

### 14.4 depends_on 不等于服务已经完全可用

Compose 里的 `depends_on` 只能表达启动顺序。

它不一定保证数据库已经准备好接收连接。

所以后端项目最好有：

- 连接失败重试；
- healthcheck；
- 启动时等待依赖服务可用。

### 14.5 bind mount 会覆盖镜像里的目录

比如你镜像里已经有 `/app/node_modules`，但开发时又写了：

```txt
-v 当前目录:/app
```

宿主机目录会覆盖容器里的 `/app`。

如果宿主机没有 `node_modules`，容器里可能也“看不到”原来的依赖。

这就是很多 Docker 本地开发环境里 node_modules 出问题的原因。

### 14.6 容器启动后马上退出，不一定是报错

容器需要一个前台进程保持运行。

如果启动命令执行完就结束，容器也会退出。

比如临时执行一个 echo：

```txt
命令执行完 -> 主进程结束 -> 容器退出
```

所以 Web 服务容器通常要以前台方式启动服务。

---

## 15. 最后总结：Docker 真正要掌握的是这条链路

Docker 不应该只当成命令来学。

真正要掌握的是这条链路：

```txt
Dockerfile 负责制作镜像
      ↓
docker build 生成镜像
      ↓
docker run 根据镜像启动容器
      ↓
-v 持久化数据
-e 注入配置
-p 暴露服务给宿主机
--network 连接容器网络
      ↓
Docker Compose 管理多容器应用
      ↓
Docker Hub / 私有仓库 分发镜像
      ↓
服务器 / 公司内网 拉取镜像并运行
```

再压缩成一句话：

> Dockerfile 管“怎么做镜像”，docker run 管“怎么跑容器”，Compose 管“怎么跑一组容器”，镜像仓库管“怎么分发镜像”。

如果只是背命令，很容易忘。

但只要理解这几个对象之间的关系：

```txt
镜像 -> 容器
Dockerfile -> 镜像
镜像仓库 -> 分发镜像
网络 -> 容器互通
数据卷 -> 数据持久化
Compose -> 多服务编排
```

以后看到任何 Docker 命令，都能知道它大概在操作哪一层。

这才是学 Docker 最重要的地方。

---

## 16. 我自己的学习路线建议

如果我是刚看完 Docker 入门视频，我不会马上去背所有命令，而会按下面顺序练：

### 第一阶段：只跑现成镜像

目标：理解镜像和容器。

练习：

```txt
用 Docker 跑 nginx
用 Docker 跑 mongo
知道如何查看容器、停止容器、删除容器、查看日志
```

### 第二阶段：理解端口、环境变量、数据卷

目标：理解 `-p`、`-e`、`-v`。

练习：

```txt
用 -p 映射 Web 服务端口
用 -e 配置 MongoDB 用户名密码
用 -v 保存 MongoDB 数据
删除容器后重新创建，确认数据还在
```

### 第三阶段：理解网络

目标：知道容器之间不要乱写 localhost。

练习：

```txt
创建自定义 bridge 网络
让 backend 容器通过 mongo 这个名字访问 MongoDB
理解服务名、容器名、内部 DNS
```

### 第四阶段：写 Dockerfile

目标：把自己的后端项目打成镜像。

练习：

```txt
给 Node/Nest 后端写 Dockerfile
构建镜像
启动容器
访问接口
```

### 第五阶段：写 Compose

目标：一条命令启动一组服务。

练习：

```txt
compose.yaml 管理 backend + mongo
再加入 frontend
最后加入 nginx
```

### 第六阶段：推送镜像仓库

目标：让镜像可以在另一台机器复现。

练习：

```txt
打 tag
登录 Docker Hub 或公司镜像仓库
push 镜像
另一台机器 pull 并启动
```

这条路线比直接背命令更适合长期掌握。

---

## 参考资料

- Docker 官方文档：Dockerfile reference  
  https://docs.docker.com/reference/dockerfile/
- Docker 官方文档：Compose file reference  
  https://docs.docker.com/reference/compose-file/
- Docker 官方文档：Networking overview  
  https://docs.docker.com/engine/network/
- Docker 官方文档：Bridge network driver  
  https://docs.docker.com/engine/network/drivers/bridge/
- Docker 官方文档：Networking in Compose  
  https://docs.docker.com/compose/how-tos/networking/
- Docker 官方文档：Docker Hub / Registry  
  https://docs.docker.com/docker-hub/
