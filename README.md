# Budget Travel · 杭州独立行外宾防坑生存手册

> 专为来华独立旅行的外宾设计的**互动式避坑生存指南** —— 包含移动支付配置、网络设置、正规交通接驳、常用口语，以及 AI 本地向导陪伴功能。

一句话总结：打开浏览器就能用，AI 会陪你边走边聊，告诉你"这一关该注意什么、怎么避坑"。

---

## 一、项目能做什么

打开页面后，外宾可以像聊天一样问 AI 各种本地问题：

- 📱 **支付配置**：怎么绑外卡 / 开通支付宝国际版 / 微信支付
- 🌐 **网络设置**：怎么买 eSIM / 换漫游卡 / 解决"无服务"
- 🚕 **正规交通**：打车防坑、机场正规出租、地铁如何购票
- 💬 **常用口语**：点餐、问路、就医、报警的万能句
- 🤖 **AI 向导**：根据你的行程随时问"下一步去哪"

所有内容都围绕"独立行 + 避坑"两个关键词，相关服务条款和免责声明请查看 `docs/AI-SAFETY.md`。

---

## 二、技术栈（看一眼就行）

- **前端**：React 19 + Vite 6 + Tailwind CSS 4
- **后端**：Node.js + Express（单文件 `server.ts`）
- **数据库**：MySQL 8.x（启动时自动建表）
- **AI**：通过 OpenAI 兼容协议调用 MiniMax 模型（`MINIMAX_*` 配置）
- **鉴权/安全**：JWT + bcryptjs + Helmet + Rate-Limit（生产模式强制启用）

---

## 三、运行环境要求

| 工具       | 版本             | 备注                                  |
| ---------- | ---------------- | ------------------------------------- |
| Node.js    | **>= 20.0.0**    | 安装 LTS 即可（自带 npm）             |
| MySQL      | **>= 8.0**       | 推荐 8.4                             |
| 操作系统   | Windows / macOS / Linux 均可 | 下面命令以 Windows 为例            |

> 不需要 Python / Docker / 其他数据库，跟着下面一步步来即可。

---

## 四、一步步跑起来（小白版）

### 第 1 步：安装 Node.js

到 <https://nodejs.org/zh-cn> 下载 LTS（长期支持版），一路 Next 安装就行。

验证是否装好：

```bash
node -v
npm -v
```

应该能看到两个版本号，例如 `v20.x.x` / `10.x.x`。

---

### 第 2 步：安装 MySQL 8（一次性）

#### Windows（推荐 winget 一键装）

**用管理员身份打开 PowerShell**，执行：

```powershell
winget install -e --id Oracle.MySQL --version 8.4.0
```

> 没装 winget？先到微软应用商店搜 "App Installer" 装一下。

安装过程中会弹窗让你设置 **root 密码**，强烈建议：

- 本地开发密码设成空（直接回车即可），方便配置
- 或者设置一个你能记住的密码，下面的配置里同步填上即可

装完之后，**MySQL 不会自动注册成 Windows 服务**，需要手动启动（每次重启电脑后都得手动跑一次）。

#### macOS

```bash
brew install mysql@8.4
brew services start mysql@8.4
```

#### Linux (Ubuntu)

```bash
sudo apt update
sudo apt install mysql-server-8.0
sudo systemctl start mysql
```

#### 验证 MySQL 是否可用

新开一个终端：

```bash
mysql -u root -p
```

> 本地密码为空的话直接回车。看到 `mysql>` 提示符说明 OK，输入 `exit;` 退出。

---

### 第 3 步：手动启动 MySQL（每次开机后都要做）

**Windows** —— 双击项目根目录下的：

```
手动启动mysql数据库.bat
```

或手动执行（路径可能略有差异）：

```powershell
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.4\my.ini" --standalone --console
```

启动成功的标志：终端会打印一堆日志，最后停住不再退出，**别关这个窗口**。

**macOS / Linux** —— 上面已经用 `services / systemctl` 起好了，不需要再起。

---

### 第 4 步：准备配置文件

进到项目目录 `budget_travel/`：

```bash
cd budget_travel
```

把示例配置复制成正式配置：

```bash
copy .env.example .env       # Windows
cp .env.example .env          # macOS / Linux
```

用任意编辑器（记事本 / VSCode）打开 `.env`，确认这几项：

```ini
# 必填：AI Key（没有的话 AI 聊天接口会返回 500，但页面其它部分还能用）
MINIMAX_API_KEY="你的KEY"
MINIMAX_BASE_URL="https://api.minimaxi.com/v1"
MINIMAX_MODEL="MiniMax-Text-01"

# 数据库（本地默认即可）
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD=""                # 本地密码是空就保持空字符串
DB_NAME="travel_guide"
```

> 💡 `MINIMAX_API_KEY` 在 <https://platform.minimaxi.com> 注册账号后申请，国内账号用 `https://api.minimaxi.com/v1`，国际账号用 `https://api.minimax.io/v1`。本地开发不填也能启动，只是聊天接口会报错。

---

### 第 5 步：安装依赖

```bash
npm install
```

第一次会下载几百 MB 的包，等 1-3 分钟。

---

### 第 6 步：初始化数据库表（只需要跑一次）

```bash
npm run db:init
```

看到 `[init_db] schema ready` 就 OK 了。它会在 MySQL 里创建 `travel_guide` 这个库，并建好所需的全部表（`users`、`itineraries`、`stops`、`scams`、`hot_notes`、`note_images`、`note_videos`、`payment_config`、`payment_transactions` 等）。

> 没看到这条日志，而是 `failed: ...`？99% 是 MySQL 没起，或者 `.env` 里 `DB_*` 写错了，先回第 3 步检查。

---

### 第 7 步：启动项目

```bash
npm run dev
```

看到类似下面的输出就算成功：

```
[timestamp] [server] listening on http://localhost:3000
```

用浏览器打开 <http://localhost:3000> 即可。

> 想停服务：在终端按 `Ctrl + C`。

---

## 五、一键启动脚本（Windows 用户）

嫌每次敲命令麻烦？项目自带两个批处理：

- **首次启动**：先双击 `手动启动mysql数据库.bat`，等窗口停住
- **再双击** `运行服务.bat`，浏览器自动打开 <http://localhost:3000>

---

## 六、生产构建（可选，跑得更快）

```bash
npm run build      # 打包前端 + 编译 server.ts → dist/
npm run start      # 用生产模式运行 dist/server.cjs
```

部署到服务器时，记得把 `.env` 里的 `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` 改成对应环境（比如阿里云 RDS 的连接信息）。

---

## 七、常见报错速查

| 现象                                                | 原因 / 解决                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE` 端口 3000 被占                          | 上次进程没退干净。`netstat -ano \| findstr :3000` → `taskkill /PID <PID> /F`                              |
| 应用一启动就退，`connect ECONNREFUSED 127.0.0.1:3306` | MySQL 没起来，回到第 3 步手动启动                                                                          |
| `/api/health` 返回 `aiConfigured: false`            | `.env` 里 `MINIMAX_API_KEY` 没填或没生效，改完务必重启 `npm run dev`                                     |
| `npm run db:init` 报 access denied                  | `.env` 里的 `DB_USER`/`DB_PASSWORD` 跟 MySQL 实际账号对不上                                               |
| 浏览器打开 3000 是空白                              | 看终端报错，多半是 `node_modules` 没装好，删掉重新 `npm install`                                          |

更多排错细节看 [`RUNNING.md`](./RUNNING.md)。

---

## 八、目录结构速览

```
budget_travel/
├── server.ts              # Express 后端入口（含 AI/支付/聊天路由）
├── db.ts                  # 数据库连接 + 建表 SQL
├── vite.config.ts         # 前端构建配置
├── index.html             # SPA 入口
├── src/                   # React 前端
│   ├── App.tsx
│   ├── components/
│   ├── safety/            # 输入/输出安全护栏（AI-SAFETY.md）
│   └── __tests__/
├── scripts/
│   ├── init_db.ts         # 一次性建表脚本
│   ├── import_scenarios.ts
│   ├── import_xhs_notes.ts
│   └── probe_xhs_media.ts
├── docs/
│   ├── AI-SAFETY.md       # AI 安全护栏说明
│   └── MIGRATION-scenes-tag.md
├── 手动启动mysql数据库.bat
├── 运行服务.bat
└── .env / .env.example    # 环境变量（自己复制 .env.example 改）
```

---

## 九、给开发者的快捷命令

| 命令                      | 作用                                |
| ------------------------- | ----------------------------------- |
| `npm run dev`             | 开发模式启动（前后端一起）          |
| `npm run db:init`         | 一次性创建所有数据表                |
| `npm run build`           | 生产构建                            |
| `npm run start`           | 跑生产构建产物                      |
| `npm run lint`            | TypeScript 类型检查（不产出文件）   |
| `npm test`                | 跑一次单元测试（Vitest）             |
| `npm run test:watch`      | 监听模式跑测试                      |
| `npm run test:coverage`   | 生成覆盖率报告                      |
| `npm run import:seed`     | 导入种子场景数据                    |
| `npm run import:scenarios`| 从 JSON 批量导入避坑场景数据        |

---

## 十、安全与免责声明

- 本应用面向外国来华游客，所有内容仅作信息参考，**不构成法律 / 医疗 / 金融建议**。
- 支付 / 充值 / 换汇等操作请以官方 App 与银行指引为准。
- AI 输出已经过输入/输出安全护栏（[`docs/AI-SAFETY.md`](./docs/AI-SAFETY.md)）拦截，但仍请自行核实关键信息。
- 生产部署务必设置 `JWT_SECRET` 为高熵随机字符串（`openssl rand -base64 48`），并把 `DB_PASSWORD` 设成强密码。

---

## 十一、License & 致谢

仅作学习与项目演示使用，版权归原作者所有。
