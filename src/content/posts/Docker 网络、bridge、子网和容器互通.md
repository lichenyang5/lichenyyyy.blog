---
title: Docker 学习笔记（三）：Docker 网络、bridge、子网和容器互通
description: 理解 Docker bridge 网络、容器 IP、网关、子网、端口映射，以及为什么后端连接数据库不要写 localhost。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - Docker 网络
  - bridge
  - subnet
  - container network
---

# Docker 学习笔记（三）：Docker 网络、bridge、子网和容器互通

学 Docker 网络时，最容易卡在一句话：

> 容器里面的 localhost，不是你的电脑。

很多后端项目本地可以连接数据库，一放进 Docker 就报错：

```text
ECONNREFUSED 127.0.0.1:27017
```

原因往往不是 MongoDB 挂了，而是你在容器里写了 `localhost`。

这篇文章专门讲 Docker 网络。

---

## 1. 先记住一个原则

```text
在宿主机上访问容器：用 localhost + 映射端口
容器访问另一个容器：用容器名 / 服务名 + 容器端口
```

比如：

```text
浏览器访问后端：
localhost:3000

后端容器访问 MongoDB 容器：
mongodb://mongo:27017/app
```

不要混用。

---

## 2. Docker 默认 bridge 网络

安装 Docker 后，默认会有几个网络：

```bash
docker network ls
```

常见输出：

```text
NETWORK ID     NAME      DRIVER    SCOPE
xxxx           bridge    bridge    local
xxxx           host      host      local
xxxx           none      null      local
```

其中最常见的是 `bridge`。

可以把 bridge 理解成 Docker 在你电脑里创建的一台“虚拟交换机”：

```text
宿主机
  │
  ├── docker0 / bridge 网络
  │       ├── container A
  │       ├── container B
  │       └── container C
  │
  └── 本机网络
```

容器加入 bridge 网络后，会获得一个内部 IP。

---

## 3. 查看网络详情

```bash
docker network inspect bridge
```

你会看到类似信息：

```json
{
  "Name": "bridge",
  "Driver": "bridge",
  "IPAM": {
    "Config": [
      {
        "Subnet": "172.17.0.0/16",
        "Gateway": "172.17.0.1"
      }
    ]
  }
}
```

这里有两个重要字段：

| 字段 | 含义 |
|---|---|
| `Subnet` | Docker 网络使用的子网范围 |
| `Gateway` | 这个 Docker 网络的网关 |

`172.17.0.0/16` 表示这个网络里可以分配一批内部 IP，例如：

```text
172.17.0.2
172.17.0.3
172.17.0.4
```

这些 IP 主要用于容器之间通信。

---

## 4. 为什么不推荐直接用容器 IP？

你可能会想：既然容器有 IP，那后端连接 MongoDB 写 IP 不就行了？

比如：

```text
mongodb://172.17.0.2:27017/app
```

不推荐。

原因是容器 IP 可能变化：

- 容器删除后重建，IP 可能变；
- Compose 重新启动服务，IP 可能变；
- 网络重新创建，IP 也可能变。

更推荐使用容器名或服务名。

```text
mongodb://mongo:27017/app
```

这类似一个内部 DNS。

---

## 5. 自定义 bridge 网络

默认 bridge 网络能用，但实际项目更推荐自己创建网络。

```bash
docker network create app-net
```

查看：

```bash
docker network ls
```

启动 MongoDB：

```bash
docker run -d \
  --name mongo \
  --network app-net \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=123456 \
  -v mongo-data:/data/db \
  mongo:7
```

启动后端：

```bash
docker run -d \
  --name api \
  --network app-net \
  -p 3000:3000 \
  -e MONGO_URL="mongodb://root:123456@mongo:27017/app?authSource=admin" \
  my-api:1.0
```

后端里的 `mongo` 就能解析到 MongoDB 容器。

---

## 6. 创建指定子网的网络

有时公司内网、VPN、虚拟机网络可能和 Docker 默认网段冲突。

这时可以指定 Docker 网络的子网：

```bash
docker network create \
  --driver bridge \
  --subnet 172.30.0.0/16 \
  --gateway 172.30.0.1 \
  app-net
```

解释一下：

| 参数 | 作用 |
|---|---|
| `--driver bridge` | 使用 bridge 网络驱动 |
| `--subnet 172.30.0.0/16` | 指定网络子网 |
| `--gateway 172.30.0.1` | 指定网关 |
| `app-net` | 网络名字 |

创建后查看：

```bash
docker network inspect app-net
```

---

## 7. 端口映射和 Docker 网络不是一回事

很多人会把 `-p` 和 Docker 网络混在一起。

其实它们解决的问题不同。

### 7.1 `-p` 解决的是宿主机访问容器

```bash
-p 3000:3000
```

表示：

```text
宿主机 localhost:3000 -> 容器 3000
```

也就是浏览器、Postman、curl 从宿主机访问容器。

### 7.2 Docker 网络解决的是容器访问容器

```text
api 容器 -> mongo 容器
```

这时不需要 `-p 27017:27017`，只要两个容器在同一个网络里，后端就能访问：

```text
mongodb://mongo:27017/app
```

当然，如果你还想从宿主机上的 MongoDB Compass 连接容器里的 MongoDB，那就需要映射端口：

```bash
-p 27017:27017
```

---

## 8. 为什么容器里不能写 localhost？

假设后端容器里写：

```text
mongodb://localhost:27017/app
```

在后端容器看来，`localhost` 指的是：

```text
后端容器自己
```

不是 MongoDB 容器，也不是宿主机。

所以它会在后端容器内部找 27017 端口，找不到就报错。

正确写法：

```text
mongodb://mongo:27017/app
```

这里的 `mongo` 是 MongoDB 容器名或 Compose 服务名。

---

## 9. 常见排查命令

查看网络：

```bash
docker network ls
```

查看网络详情：

```bash
docker network inspect app-net
```

查看容器属于哪个网络：

```bash
docker inspect api
```

进入容器：

```bash
docker exec -it api sh
```

在容器里测试服务名解析：

```bash
ping mongo
```

有些精简镜像没有 `ping`，可以用：

```bash
getent hosts mongo
```

或者临时启动一个网络测试容器：

```bash
docker run --rm -it --network app-net alpine sh
```

---

## 10. 第三篇小结

Docker 网络可以这样记：

```text
宿主机访问容器：localhost + -p 映射端口
容器访问容器：服务名/容器名 + 容器端口
容器里的 localhost：容器自己
```

常见命令：

```bash
# 查看网络
docker network ls

# 创建网络
docker network create app-net

# 创建指定子网的网络
docker network create --driver bridge --subnet 172.30.0.0/16 --gateway 172.30.0.1 app-net

# 查看网络详情
docker network inspect app-net

# 让容器加入网络
docker network connect app-net api
```

下一篇进入 Dockerfile：如何把自己的项目打成镜像。

---

## 参考资料

- Docker networking overview: https://docs.docker.com/engine/network/
- Bridge network driver: https://docs.docker.com/engine/network/drivers/bridge/
- docker network create: https://docs.docker.com/reference/cli/docker/network/create/
- Docker Compose networking: https://docs.docker.com/compose/how-tos/networking/
