---
title: Docker 命令速查表：镜像、容器、网络、数据卷、Compose、仓库发布
description: 适合学习 Docker 后反复查阅的命令清单，覆盖 docker run、Dockerfile、network、volume、compose、push/pull。
date: 2026-06-29
category: Docker
tags:
  - Docker
  - cheatsheet
  - docker compose
  - docker network
---

# Docker 命令速查表

这份速查表适合在学完 Docker 基础后反复查。

---

## 1. 镜像相关

```bash
# 查看本地镜像
docker images

# 拉取镜像
docker pull nginx:alpine

docker pull mongo:7

# 删除镜像
docker rmi nginx:alpine

# 构建镜像
docker build -t my-api:1.0 .

# 重新打 tag
docker tag my-api:1.0 username/my-api:1.0

# 保存镜像为 tar
docker save -o my-api-1.0.tar my-api:1.0

# 从 tar 加载镜像
docker load -i my-api-1.0.tar
```

---

## 2. 容器相关

```bash
# 启动容器
docker run nginx:alpine

# 后台启动
docker run -d nginx:alpine

# 指定名字
docker run -d --name my-nginx nginx:alpine

# 端口映射
docker run -d --name my-nginx -p 8080:80 nginx:alpine

# 设置环境变量
docker run -d --name api -e NODE_ENV=production my-api:1.0

# 挂载目录
docker run -d -v ./html:/usr/share/nginx/html nginx:alpine

# 挂载数据卷
docker run -d -v mongo-data:/data/db mongo:7

# 临时容器，退出自动删除
docker run --rm node:22-alpine node -v

# 交互式进入容器
docker run -it --rm node:22-alpine sh
```

---

## 3. 容器管理

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

# 强制删除容器
docker rm -f my-nginx

# 进入正在运行的容器
docker exec -it my-nginx sh

# 查看容器详细信息
docker inspect my-nginx
```

---

## 4. 网络相关

```bash
# 查看网络
docker network ls

# 创建 bridge 网络
docker network create app-net

# 创建指定子网的网络
docker network create \
  --driver bridge \
  --subnet 172.30.0.0/16 \
  --gateway 172.30.0.1 \
  app-net

# 查看网络详情
docker network inspect app-net

# 容器连接到网络
docker network connect app-net api

# 容器断开网络
docker network disconnect app-net api

# 删除网络
docker network rm app-net
```

---

## 5. 数据卷相关

```bash
# 查看数据卷
docker volume ls

# 创建数据卷
docker volume create mongo-data

# 查看数据卷详情
docker volume inspect mongo-data

# 删除数据卷
docker volume rm mongo-data

# 删除没有被使用的数据卷
docker volume prune
```

---

## 6. Compose 相关

```bash
# 启动服务
docker compose up -d

# 启动并重新构建
docker compose up -d --build

# 查看服务
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

# 重启某个服务
docker compose restart api

# 只构建不启动
docker compose build
```

---

## 7. Docker Hub / 镜像仓库

```bash
# 登录 Docker Hub
docker login

# 登录私有仓库
docker login registry.company.com

# 推送镜像到 Docker Hub
docker push username/my-api:1.0

# 推送镜像到私有仓库
docker push registry.company.com/team/my-api:1.0

# 拉取镜像
docker pull username/my-api:1.0
```

---

## 8. 常见排查

```bash
# 看容器为什么退出
docker logs 容器名

docker ps -a

# 看端口映射
docker ps

# 看环境变量是否传进去
docker exec -it api sh
printenv

# 看容器网络
docker inspect api

docker network inspect app-net

# 看磁盘占用
docker system df

# 清理不用的容器、网络、镜像缓存
docker system prune

# 谨慎：清理未使用的数据卷
docker system prune --volumes
```

---

## 9. 最常用组合

### Nginx

```bash
docker run -d --name nginx -p 8080:80 nginx:alpine
```

### MongoDB

```bash
docker volume create mongo-data

docker run -d \
  --name mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=123456 \
  -v mongo-data:/data/db \
  mongo:7
```

### Node 后端

```bash
docker build -t my-api:1.0 .

docker run -d \
  --name api \
  -p 3000:3000 \
  -e NODE_ENV=production \
  my-api:1.0
```

### 前后端 + MongoDB

```bash
docker compose up -d --build
```

---

## 10. 最后记忆口诀

```text
镜像：静态模板
容器：运行实例
Dockerfile：构建镜像说明书
Docker Hub：公共镜像仓库
Compose：多容器编排工具
Volume：数据持久化
Network：容器互通
-p：宿主机访问容器
-e：环境变量
-v：挂载目录或数据卷
```
