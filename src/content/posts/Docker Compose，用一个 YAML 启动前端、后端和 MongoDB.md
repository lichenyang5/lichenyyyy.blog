---
title: Docker 学习笔记（五）：Docker Compose，用一个 YAML 启动前端、后端和 MongoDB
description: 从多个 docker run 的痛点出发，理解 services、networks、volumes、environment、depends_on 和一键启动多容器项目。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - Docker Compose
  - MongoDB
  - fullstack
  - deployment
---

# Docker 学习笔记（五）：Docker Compose，用一个 YAML 启动前端、后端和 MongoDB

前面我们已经可以用 `docker run` 启动单个容器。

但真实项目通常不是一个容器。

比如一个全栈项目至少有：

```text
前端 web
后端 api
数据库 mongo
```

如果全部用 `docker run`，命令会变成这样：

```bash
docker network create app-net

docker volume create mongo-data

docker run -d --name mongo --network app-net \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=123456 \
  -v mongo-data:/data/db \
  mongo:7

docker run -d --name api --network app-net \
  -p 3000:3000 \
  -e MONGO_URL="mongodb://root:123456@mongo:27017/app?authSource=admin" \
  my-api:1.0

docker run -d --name web --network app-net \
  -p 8080:80 \
  my-web:1.0
```

能用，但不适合长期维护。

Docker Compose 就是为了解决这个问题。

---

## 1. Compose 解决什么问题？

Compose 的核心价值是：

> 用一个 YAML 文件描述多个服务、网络、数据卷和环境变量，然后一条命令启动它们。

也就是把一堆命令变成：

```bash
docker compose up -d
```

停止：

```bash
docker compose down
```

这对前后端 + 数据库项目非常有用。

---

## 2. 最小 docker-compose.yml

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "8080:80"
```

启动：

```bash
docker compose up -d
```

查看：

```bash
docker compose ps
```

停止：

```bash
docker compose down
```

---

## 3. services：定义服务

Compose 文件里的核心是 `services`。

```yaml
services:
  web:
    image: nginx:alpine
```

这里的 `web` 是服务名。

服务名非常重要，因为同一个 Compose 网络里，服务可以通过服务名互相访问。

比如后端访问 MongoDB：

```text
mongodb://mongo:27017/app
```

这里的 `mongo` 就是 Compose 服务名。

---

## 4. 前端 + 后端 + MongoDB 示例

假设目录：

```text
my-fullstack-app/
  web/
    Dockerfile
  api/
    Dockerfile
  docker-compose.yml
```

`docker-compose.yml`：

```yaml
services:
  mongo:
    image: mongo:7
    container_name: app-mongo
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: 123456
    volumes:
      - mongo-data:/data/db
    networks:
      - app-net

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: app-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      MONGO_URL: mongodb://root:123456@mongo:27017/app?authSource=admin
    depends_on:
      - mongo
    networks:
      - app-net

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: app-web
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - api
    networks:
      - app-net

volumes:
  mongo-data:

networks:
  app-net:
    driver: bridge
```

启动：

```bash
docker compose up -d --build
```

这条命令会：

1. 构建 `api` 镜像；
2. 构建 `web` 镜像；
3. 拉取 `mongo:7`；
4. 创建 `mongo-data` 数据卷；
5. 创建 `app-net` 网络；
6. 启动三个服务。

---

## 5. image 和 build 的区别

Compose 里常见两种写法：

### 5.1 使用已有镜像

```yaml
mongo:
  image: mongo:7
```

表示直接使用远程或本地已有镜像。

### 5.2 根据 Dockerfile 构建镜像

```yaml
api:
  build:
    context: ./api
    dockerfile: Dockerfile
```

表示进入 `./api` 目录，根据 Dockerfile 构建镜像。

简单说：

| 字段 | 作用 |
|---|---|
| `image` | 直接使用已有镜像 |
| `build` | 根据 Dockerfile 构建镜像 |

---

## 6. environment：配置环境变量

Compose 里可以这样写：

```yaml
environment:
  NODE_ENV: production
  PORT: 3000
```

也可以用列表：

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
```

如果涉及密码，不建议直接提交到 GitHub。

可以使用 `.env`：

```env
MONGO_ROOT_USERNAME=root
MONGO_ROOT_PASSWORD=123456
```

然后 Compose：

```yaml
environment:
  MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
  MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
```

注意：`.env` 不要提交到公开仓库。

---

## 7. volumes：数据持久化

```yaml
volumes:
  - mongo-data:/data/db
```

表示把 Docker 管理的 `mongo-data` 数据卷挂载到 MongoDB 容器的 `/data/db`。

底部还要声明：

```yaml
volumes:
  mongo-data:
```

这样即使容器删除，数据库数据也不会跟着丢。

---

## 8. networks：服务互通

```yaml
networks:
  app-net:
    driver: bridge
```

服务加入网络：

```yaml
networks:
  - app-net
```

同一个网络里的服务可以通过服务名访问。

```text
api -> mongo:27017
web -> api:3000
```

不过浏览器访问前端时，还是走宿主机映射端口：

```text
http://localhost:8080
```

---

## 9. 指定 Compose 子网

如果想给 Compose 网络指定子网，可以这样写：

```yaml
networks:
  app-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/16
          gateway: 172.30.0.1
```

完整示例：

```yaml
services:
  mongo:
    image: mongo:7
    networks:
      - app-net

networks:
  app-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.30.0.0/16
          gateway: 172.30.0.1
```

一般学习阶段不需要手动指定，除非遇到网络冲突。

---

## 10. depends_on：控制启动顺序

```yaml
depends_on:
  - mongo
```

表示 `api` 服务会在 `mongo` 服务之后启动。

但要注意：

> depends_on 不等于等待数据库完全准备好。

它只是控制容器启动顺序，不保证 MongoDB 已经可以接受连接。

生产项目里，后端最好自己有重试连接机制，或者使用 healthcheck。

---

## 11. 常用 Compose 命令

```bash
# 启动全部服务
docker compose up -d

# 启动并重新构建
docker compose up -d --build

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs

# 持续查看某个服务日志
docker compose logs -f api

# 停止并删除容器、网络
docker compose down

# 停止并删除容器、网络、数据卷
docker compose down -v

# 进入某个服务容器
docker compose exec api sh

# 只重启 api
docker compose restart api
```

---

## 12. 第五篇小结

Compose 的核心可以这样记：

```text
services：有哪些容器
build/image：镜像从哪里来
ports：宿主机怎么访问容器
environment：容器运行需要哪些配置
volumes：哪些数据要持久化
networks：容器之间怎么通信
```

如果 `docker run` 是手动挡，那么 Docker Compose 就是自动挡。

单容器学习时，用 `docker run` 很好；多容器项目，一定要尽快切到 Compose。

下一篇讲最后一步：如何把自己构建好的镜像推送到 Docker Hub 或公司镜像仓库。

---

## 参考资料

- Docker Compose: https://docs.docker.com/compose/
- Compose file reference: https://docs.docker.com/reference/compose-file/
- Compose networking: https://docs.docker.com/compose/how-tos/networking/
- Compose volumes: https://docs.docker.com/reference/compose-file/volumes/
