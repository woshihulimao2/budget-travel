# 本地运行手册

## 前置条件

- Node.js（已装）
- MySQL（本机已通过 winget 装了 MySQL 8.4，非 Windows 服务，需手动启动）
- `.env` 文件已配置好 `MINIMAX_API_KEY` 和 `DB_*` 连接信息

## 日常开发

**1. 启动 MySQL**（新开一个终端，保持运行）

```bash
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.4\my.ini" --standalone --console
```

> 因为没有用管理员权限注册为 Windows 服务，所以**每次重启电脑后都要手动执行这条命令**，否则应用连不上数据库会直接报错退出。

**2. 启动应用**（再开一个终端，进项目目录）

```bash
cd "D:\AI_project\旅游专题\code_project"
npm run dev
```

**3. 访问** `http://localhost:3000`

## 生产构建

```bash
npm run build   # 打包前端 + 编译 server.ts -> dist/
npm run start   # 以生产模式运行 dist/server.cjs
```

生产模式（`NODE_ENV=production`）会跳过 Vite 中间件，直接从 `dist/` 提供静态文件；同样需要先确保对应环境（本机或阿里云 ECS）的 MySQL 已启动、`.env` 里连接信息正确。

## 环境变量（`.env`）

| 变量 | 说明 |
|---|---|
| `MINIMAX_API_KEY` | MiniMax API key（在 platform.minimaxi.com 申请），驱动 AI 聊天/定制行程功能，不填这两个接口会返回 500 |
| `MINIMAX_BASE_URL` | MiniMax 接口地址，国内账号用 `https://api.minimaxi.com/v1`，国际账号用 `https://api.minimax.io/v1` |
| `MINIMAX_MODEL` | 使用的模型，默认 `MiniMax-Text-01` |
| `DB_HOST` | MySQL 地址，本地是 `127.0.0.1`，部署到阿里云换成 RDS 内网地址 |
| `DB_PORT` | MySQL 端口，默认 `3306` |
| `DB_USER` | MySQL 用户名，本地是 `root` |
| `DB_PASSWORD` | MySQL 密码，本地为空（仅限本地开发，生产环境必须设置强密码） |
| `DB_NAME` | 数据库名，`travel_guide` |

> 注意：`server.ts` 里 `dotenv.config()` 默认只读取 `.env` 文件，不会自动读 `.env.local`。改配置认准 `.env`。

## 常见问题排查

**端口被占用（`EADDRINUSE`）**

上一次的 Node 进程可能没退干净，查一下是谁占着端口再杀掉：

```bash
netstat -ano | findstr :3000
taskkill /PID <上面查到的PID> /F
```

MySQL 默认端口是 `3306`，排查方式同理。

**`aiConfigured: false`（访问 `/api/health` 看到）**

说明 `.env` 里 `MINIMAX_API_KEY` 没填或没生效，改完记得重启 `npm run dev`。

**连接 MySQL 报错直接退出**

先确认 MySQL 进程是否在跑（见上面"日常开发"第 1 步），再检查 `.env` 里 `DB_*` 是否正确。

## 部署到阿里云

不用改代码，把 `.env` 里的 `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` 换成 RDS 实例的连接信息，并在 RDS 白名单里放行 ECS 的内网 IP。应用启动时会自动建表（`payment_config`、`payment_transactions`），无需手动建库结构。
