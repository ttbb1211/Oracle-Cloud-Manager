# Docker 部署说明

本文档对应当前版本的 **Oracle Cloud Manager（Oracle 专用私有管理面板）**。

当前版本已围绕 Oracle Cloud 做过收口，支持：
- Oracle 账户管理
- 多区号识别与批量生成账户
- 实例管理
- 引导卷管理
- 连通性测试

不再面向 AWS / DNS / 多云通用场景。

---

## 一、环境要求

请先确保宿主机已安装：
- Docker
- Docker Compose（或 Docker Desktop / Docker Compose Plugin）

当前默认监听端口：
- `3001`

> 当前 `docker-compose.yml` 中已改成仅监听本机：`127.0.0.1:3001:3001`

---

## 二、当前容器行为

当前 Compose 配置核心如下：

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: oracle-app
    ports:
      - "127.0.0.1:3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
    volumes:
      - ./backend/data:/app/backend/data
    restart: unless-stopped
```

这意味着：
- 前端静态文件会在镜像构建时一起打包
- Node 后端负责提供 API 与静态前端
- 运行数据会落到宿主机的 `./backend/data`
- 服务默认只允许本机访问，再通过反向代理对外开放

---

## 三、推荐部署方式

在项目根目录执行：

```bash
docker compose up -d --build
```

启动完成后，本机访问：

```text
http://127.0.0.1:3001
```

> 不建议直接将 `3001` 暴露到公网。

---

## 四、推荐对外访问方式

当前项目更适合这样部署：

1. Docker 容器只监听本机 `127.0.0.1:3001`
2. 用 Nginx / 宝塔反向代理到该地址
3. 在反代层开启：
   - HTTPS
   - Basic Auth / 宝塔密码访问
   - （可选）IP 白名单 / Cloudflare Access

推荐原因：
- 这个面板本质上仍然是高权限 Oracle 管理后台
- 访问保护应至少放在反代层做第一道门
- 不建议直接开放 `IP:3001`

---

## 五、首次启动后建议做的事

启动成功后，建议按以下顺序使用：

1. 打开面板
2. 进入账户管理
3. 粘贴 OCI Config 与私钥
4. 点击 **识别多区号**
5. 勾选需要管理的区号
6. 批量生成多条 Oracle 账户
7. 对生成的账户执行 **连通性测试**
8. 再进入云实例页做日常操作

这样可以更好地发挥当前版本“同一套凭据、多 region 拆账户管理”的设计。

---

## 六、常用命令

### 1）启动或更新

```bash
docker compose up -d --build
```

### 2）停止服务

```bash
docker compose down
```

### 3）查看容器状态

```bash
docker compose ps
```

### 4）查看日志

```bash
docker compose logs -f app
```

### 5）重启服务

```bash
docker compose restart
```

---

## 七、数据持久化

本项目当前运行数据默认存放在：

宿主机：

```text
./backend/data
```

容器内：

```text
/app/backend/data
```

主要包括：
- Oracle 账户信息
- 系统设置
- 任务数据
- 其它 lowdb 运行数据

只要不删除宿主机上的 `backend/data`，即使容器删除后重新创建，数据仍然保留。

---

## 八、直接使用 Docker 命令（可选）

如果你不想用 Compose，也可以直接用 Docker。

### 构建镜像

```bash
docker build -t oracle-app .
```

### Linux / macOS 运行

```bash
docker run -d \
  --name oracle-app \
  -p 127.0.0.1:3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -v $(pwd)/backend/data:/app/backend/data \
  oracle-app
```

### Windows PowerShell 运行

```powershell
docker run -d `
  --name oracle-app `
  -p 127.0.0.1:3001:3001 `
  -e NODE_ENV=production `
  -e PORT=3001 `
  -v ${PWD}/backend/data:/app/backend/data `
  oracle-app
```

---

## 九、更新部署

代码更新后，推荐直接执行：

```bash
docker compose up -d --build
```

通常不必先 `down` 再 `up`。

如果你确实需要完整重建，也可以：

```bash
docker compose down
docker compose up -d --build
```

---

## 十、故障排查

如果页面打不开，优先检查：

### 1）容器是否启动

```bash
docker compose ps
```

### 2）日志是否报错

```bash
docker compose logs -f app
```

### 3）健康接口是否正常

```bash
curl http://127.0.0.1:3001/api/health
```

正常情况下应返回类似：

```json
{"status":"ok","time":"2026-03-24T02:40:48.066Z"}
```

### 4）端口是否被占用

检查宿主机的 `3001` 端口是否已被其他程序使用。

### 5）数据目录权限是否正常

确认 `backend/data` 可读写。

### 6）页面能打开但账户异常

优先检查：
- OCI Config 是否正确
- 私钥是否正确
- fingerprint 是否匹配
- region 是否正确
- 再通过 **连通性测试** 验证当前账户链路

---

## 十一、安全提醒

当前版本虽然已经比原版更收敛，但本质上仍然属于：

**高权限 Oracle 管理后台**

至少建议做到：
- 只部署在自己的服务器上
- 使用自己的反向代理
- 开启 HTTPS
- 启用访问密码保护
- 不直接开放 `IP:3001`

如果后续需要更高安全性，再考虑：
- 项目内建登录系统
- 反代层白名单
- 更强的访问控制方案

---

## 十二、当前版本说明

当前版本已经同步到：
- Oracle 专用定位
- 多区号识别与批量生成账户
- 页面去重与 HOME 优先显示逻辑
- 本机监听 + 反代保护部署思路

如果后续继续改 UI / 账户逻辑 / 部署方式，建议同步更新：
- `README.md`
- `DEPLOY_DOCKER.md`
- 本地 note / 归档文档
