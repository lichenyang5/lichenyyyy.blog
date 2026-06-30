---
title: Docker 学习笔记（六）：把镜像推到 Docker Hub 或公司镜像仓库
description: 从 docker build 到 docker tag、docker login、docker push，理解镜像命名、标签、公共仓库和私有仓库发布流程。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - Docker Hub
  - 镜像仓库
  - docker push
  - CI/CD
---

# Docker 学习笔记（六）：把镜像推到 Docker Hub 或公司镜像仓库

前面我们已经能做三件事：

1. 用别人提供的镜像启动容器；
2. 用 Dockerfile 构建自己的镜像；
3. 用 Compose 启动多个服务。

最后还差一步：

> 如何把自己构建好的镜像发出去，让别人也能拉下来运行？

这就是镜像仓库的作用。

---

## 1. 镜像为什么要推到仓库？

假设你本地有一个镜像：

```bash
docker images
```

输出：

```text
REPOSITORY   TAG     IMAGE ID       CREATED        SIZE
my-api       1.0     abcdef123456   1 minute ago   220MB
```

这个镜像现在只在你的电脑上。

别人不能直接 `docker run my-api:1.0`，因为他的电脑没有这个镜像。

所以需要把镜像推到仓库：

```text
你的电脑 docker push
        │
        ▼
镜像仓库 Docker Hub / Harbor / 云厂商仓库
        │
        ▼
其他机器 docker pull
        │
        ▼
docker run
```

---

## 2. 镜像完整命名格式

本地镜像可以叫：

```text
my-api:1.0
```

但要推送到远程仓库，通常需要更完整的名字：

```text
仓库地址/命名空间/镜像名:标签
```

Docker Hub 常见格式：

```text
用户名/镜像名:标签
```

例如：

```text
lichenyang5/my-api:1.0
```

公司私有仓库可能是：

```text
registry.company.com/team/my-api:1.0
```

华为云、阿里云、Harbor 都会有自己的仓库地址格式。

---

## 3. 构建镜像时直接命名

```bash
docker build -t your-dockerhub-name/my-api:1.0 .
```

比如：

```bash
docker build -t lichenyang5/my-api:1.0 .
```

查看：

```bash
docker images
```

---

## 4. 已有镜像重新打 tag

如果你已经构建了：

```text
my-api:1.0
```

可以重新打 tag：

```bash
docker tag my-api:1.0 lichenyang5/my-api:1.0
```

这里没有复制镜像，只是给同一个镜像多了一个名字。

查看：

```bash
docker images
```

可能看到：

```text
REPOSITORY            TAG     IMAGE ID
my-api                1.0     abcdef123456
lichenyang5/my-api    1.0     abcdef123456
```

两个名字指向同一个 IMAGE ID。

---

## 5. 登录 Docker Hub

```bash
docker login
```

然后输入 Docker Hub 用户名和密码或访问令牌。

登录成功后，就可以推送：

```bash
docker push lichenyang5/my-api:1.0
```

推送完成后，其他机器可以：

```bash
docker pull lichenyang5/my-api:1.0

docker run -d --name my-api -p 3000:3000 lichenyang5/my-api:1.0
```

---

## 6. 推送到公司私有仓库

公司里一般不会把业务镜像推到公共 Docker Hub。

更常见的是私有仓库，例如：

```text
registry.company.com
```

流程类似：

```bash
# 登录私有仓库
docker login registry.company.com

# 打 tag
docker tag my-api:1.0 registry.company.com/team/my-api:1.0

# 推送
docker push registry.company.com/team/my-api:1.0

# 拉取
docker pull registry.company.com/team/my-api:1.0
```

区别只是镜像名前面多了仓库域名。

---

## 7. tag 应该怎么设计？

不建议只用 `latest`。

因为 `latest` 很难回答几个问题：

- 这是哪一次构建？
- 对应哪个 commit？
- 出问题怎么回滚？
- 线上到底跑的是哪一版？

更推荐：

```bash
my-api:v1.0.0
my-api:2026-06-29
my-api:commit-abc1234
```

实际 CI/CD 中常见：

```text
registry.company.com/team/my-api:dev-abc1234
registry.company.com/team/my-api:test-abc1234
registry.company.com/team/my-api:prod-v1.0.0
```

这样定位问题更清楚。

---

## 8. 内网环境怎么办？

如果公司内网不能访问 Docker Hub，有几种常见方式。

### 8.1 使用公司私有仓库

这是最正规的方法。

```bash
docker pull registry.company.com/base/node:22-alpine
```

基础镜像由公司统一同步和维护。

### 8.2 外网机器导出镜像

外网电脑：

```bash
docker pull mongo:7
docker save -o mongo-7.tar mongo:7
```

内网电脑：

```bash
docker load -i mongo-7.tar
```

适合临时学习或离线部署。

### 8.3 配置代理或镜像加速

如果公司允许，可以给 Docker 配置代理或镜像加速地址。

但这通常要看公司网络策略，不建议自己乱改公司机器配置。

---

## 9. 发布镜像的完整流程

以 Docker Hub 为例：

```bash
# 1. 构建镜像
docker build -t my-api:1.0 .

# 2. 打远程仓库 tag
docker tag my-api:1.0 lichenyang5/my-api:1.0

# 3. 登录 Docker Hub
docker login

# 4. 推送镜像
docker push lichenyang5/my-api:1.0

# 5. 其他机器拉取
docker pull lichenyang5/my-api:1.0

# 6. 运行
docker run -d --name my-api -p 3000:3000 lichenyang5/my-api:1.0
```

如果构建时已经带了完整名字，可以少一步 tag：

```bash
docker build -t lichenyang5/my-api:1.0 .
docker push lichenyang5/my-api:1.0
```

---

## 10. 第六篇小结

镜像仓库的核心是：

> 让镜像从“只在我电脑上”变成“团队其他机器也能拉取运行”。

流程：

```text
build -> tag -> login -> push -> pull -> run
```

常用命令：

```bash
docker build -t my-api:1.0 .
docker tag my-api:1.0 用户名/my-api:1.0
docker login
docker push 用户名/my-api:1.0
docker pull 用户名/my-api:1.0
docker run -d -p 3000:3000 用户名/my-api:1.0
```

Docker 学到这里，就已经能完成一个完整闭环：

```text
本地项目
  ↓ Dockerfile
镜像
  ↓ docker run / docker compose
容器
  ↓ docker push
镜像仓库
  ↓ docker pull
其他机器运行
```

这也是 Docker 从学习命令走向工程实践的关键一步。

---

## 参考资料

- Docker Hub quickstart: https://docs.docker.com/docker-hub/quickstart/
- Build and push your first image: https://docs.docker.com/get-started/introduction/build-and-push-first-image/
- docker image push: https://docs.docker.com/reference/cli/docker/image/push/
- docker image tag: https://docs.docker.com/reference/cli/docker/image/tag/
