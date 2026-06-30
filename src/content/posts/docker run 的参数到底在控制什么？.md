---
title: Docker 学习笔记（二）：docker run 的参数到底在控制什么？
description: 用一条 nginx 命令拆解 -d、--name、-p、-v、-e、--rm、--network 等常见 docker run 参数。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - docker run
  - volume
  - environment
  - port
---

# Docker 学习笔记（二）：docker run 的参数到底在控制什么？

学 Docker 最容易被劝退的地方，不是概念，而是命令参数。

比如：

```bash
docker run -d --name my-nginx -p 8080:80 -v ./html:/usr/share/nginx/html -e TZ=Asia/Shanghai nginx:alpine
```

第一次看到这条命令，很容易觉得：

> 这不就是一堆神秘参数拼起来的吗？

其实 `docker run` 可以拆成一个非常简单的句子：

> 用某个镜像，创建一个容器，并指定它如何运行。

这篇文章就专门拆 `docker run`。

---

## 1. 最小命令：启动一个容器

```bash
docker run nginx:alpine
```

意思是：

- 如果本地没有 `nginx:alpine` 镜像，就先拉取；
- 然后基于这个镜像创建一个容器；
- 最后启动容器。

但是这样启动有几个问题：

1. 容器会占住当前终端。
2. 容器没有名字，不方便管理。
3. 外部访问不到容器里的端口。
4. 容器里的数据默认不方便持久化。

所以才需要各种参数。

---

## 2. `-d`：后台运行

```bash
docker run -d nginx:alpine
```

`-d` 是 detached 的意思，也就是后台运行。

不加 `-d`，容器日志会直接输出到当前终端。

加了 `-d`，Docker 会返回一个容器 ID，然后容器在后台继续运行。

查看容器：

```bash
docker ps
```

查看所有容器，包括已经停止的：

```bash
docker ps -a
```

---

## 3. `--name`：给容器起名字

```bash
docker run -d --name my-nginx nginx:alpine
```

如果不给容器起名，Docker 会自动生成一个随机名字，比如：

```text
happy_morse
angry_turing
```

学习时还好，真正排查问题时很难记。

所以建议显式写名字：

```bash
docker logs my-nginx
docker stop my-nginx
docker rm my-nginx
```

名字的价值就是：

> 以后所有操作都可以用这个名字定位容器。

---

## 4. `-p`：端口映射

最常见的命令：

```bash
docker run -d --name my-nginx -p 8080:80 nginx:alpine
```

`-p 8080:80` 的意思是：

```text
宿主机端口:容器端口
8080:80
```

也就是：

```text
访问 localhost:8080
        │
        ▼
转发到容器内部的 80 端口
```

注意方向不要记反。

可以这样记：

> 外面写前面，里面写后面。

所以：

```bash
-p 3000:3000
```

表示宿主机 `3000` 映射到容器 `3000`。

```bash
-p 8080:80
```

表示宿主机 `8080` 映射到容器 `80`。

---

## 5. `-v`：挂载目录或数据卷

容器有一个特点：

> 容器删除后，容器内部新产生的数据也可能跟着消失。

比如 MongoDB 的数据、Nginx 的静态文件、上传文件，都不应该只放在容器内部。

这时要用 `-v`。

### 5.1 目录挂载

```bash
docker run -d \
  --name my-nginx \
  -p 8080:80 \
  -v ./html:/usr/share/nginx/html \
  nginx:alpine
```

意思是：

```text
宿主机 ./html 目录
        │
        ▼
挂载到容器 /usr/share/nginx/html
```

以后你修改本机 `./html/index.html`，容器里的 Nginx 就会读到新的文件。

### 5.2 命名数据卷

```bash
docker volume create mongo-data

docker run -d \
  --name mongo \
  -p 27017:27017 \
  -v mongo-data:/data/db \
  mongo:7
```

这里的 `mongo-data` 是 Docker 管理的数据卷。

对数据库来说，通常更推荐用命名卷，而不是随便挂本地目录。

---

## 6. `-e`：设置环境变量

很多镜像通过环境变量初始化配置。

比如 MongoDB：

```bash
docker run -d \
  --name mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=123456 \
  -v mongo-data:/data/db \
  mongo:7
```

`-e` 的意思是 environment。

可以理解成：

```text
给容器进程注入环境变量
```

后端项目里也常用：

```bash
-e NODE_ENV=production
-e MONGO_URL=mongodb://root:123456@mongo:27017/app?authSource=admin
-e PORT=3000
```

---

## 7. `--rm`：容器停止后自动删除

临时跑一个命令时，可以用：

```bash
docker run --rm node:22-alpine node -v
```

意思是：

- 启动一个临时容器；
- 执行 `node -v`；
- 执行完自动删除容器。

适合临时测试，不适合长期服务。

---

## 8. `-it`：进入交互式终端

```bash
docker run -it --rm node:22-alpine sh
```

这里：

- `-i`：保持标准输入打开；
- `-t`：分配一个终端；
- `sh`：容器启动后执行 shell。

进入之后可以执行：

```bash
node -v
npm -v
ls
```

如果是 Ubuntu 镜像：

```bash
docker run -it --rm ubuntu:22.04 bash
```

---

## 9. `--network`：指定容器加入哪个网络

```bash
docker network create app-net

docker run -d --name mongo --network app-net mongo:7

docker run -d --name api --network app-net my-api:1.0
```

如果两个容器在同一个 Docker 网络里，它们可以用容器名互相访问。

比如后端连接 MongoDB，可以写：

```text
mongodb://mongo:27017/app
```

这里的 `mongo` 不是 localhost，而是容器名。

这是 Docker 网络里非常重要的一个点：

> 容器访问容器，不要写 localhost，要写服务名或容器名。

---

## 10. 常用生命周期命令

启动容器后，常用这些命令管理：

```bash
# 查看运行中的容器
docker ps

# 查看所有容器
docker ps -a

# 查看日志
docker logs my-nginx

# 持续查看日志
docker logs -f my-nginx

# 停止容器
docker stop my-nginx

# 启动已停止容器
docker start my-nginx

# 重启容器
docker restart my-nginx

# 删除容器
docker rm my-nginx

# 强制删除运行中的容器
docker rm -f my-nginx
```

---

## 11. 一条完整命令拆解

```bash
docker run -d \
  --name mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=123456 \
  -v mongo-data:/data/db \
  --network app-net \
  mongo:7
```

可以翻译成中文：

> 用 `mongo:7` 镜像创建一个叫 `mongo` 的容器，让它后台运行，把宿主机 27017 端口映射到容器 27017 端口，设置 root 用户名密码，把数据库数据保存到 `mongo-data` 卷，并加入 `app-net` 网络。

这样一翻译，命令就不吓人了。

---

## 12. 第二篇小结

`docker run` 的核心是：

```text
docker run [运行参数] 镜像名 [容器内执行的命令]
```

常见参数：

| 参数 | 作用 |
|---|---|
| `-d` | 后台运行 |
| `--name` | 指定容器名字 |
| `-p` | 端口映射 |
| `-v` | 挂载目录或数据卷 |
| `-e` | 设置环境变量 |
| `--rm` | 停止后自动删除 |
| `-it` | 交互式终端 |
| `--network` | 指定 Docker 网络 |

下一篇继续讲 Docker 网络：bridge、子网、网关、容器名访问、为什么容器里不能随便写 localhost。

---

## 参考资料

- Docker run reference: https://docs.docker.com/reference/cli/docker/container/run/
- Docker volumes: https://docs.docker.com/engine/storage/volumes/
- Docker networking overview: https://docs.docker.com/engine/network/
