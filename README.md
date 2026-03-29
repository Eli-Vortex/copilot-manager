# Copilot Manager

GitHub Copilot API 多分组管理面板。通过 Web 界面管理多个 Copilot 账号，按分组分配并独立运行在不同端口上。

基于 [copilot-api](https://github.com/caozhiyuan/copilot-api) 核心代码，提供可视化管理层。

## 功能

- **仪表盘** — 分组总数、账号总数、运行实例一目了然
- **分组管理** — 创建分组，指定端口号，启动/停止/重启实例
- **账号管理** — 支持 GitHub Device Flow 登录或手动输入 Token，分配到不同分组
- **实例详情** — 查看运行中实例的账号状态、订阅计划、额度用量（Premium/Chat/Completions）、可用模型列表
- **日志查看** — 实时查看每个实例的运行日志
- **在线更新** — 网页端一键 git pull + 构建 + 自动重启

## 项目结构

```
copilot-manager/
├── core/                 # copilot-api 完整源码（内嵌）
│   ├── tsconfig.json
│   └── src/              # 65 个源文件，原封不动
├── server/               # 管理层后端
│   ├── main.ts           # Hono 服务入口
│   ├── db.ts             # SQLite 数据库
│   ├── routes.ts         # REST API
│   └── process-manager.ts
├── src/                  # React 前端
│   ├── App.tsx           # 布局 + 侧边栏 + 路由
│   ├── api.ts            # API 客户端
│   └── pages/            # Dashboard / Groups / Accounts / System
├── data/                 # 运行时数据（不进 git）
│   ├── manager.db        # SQLite 数据库
│   └── groups/           # 每个分组的 copilot-api 配置
└── dist/                 # 前端构建产物
```

## 环境要求

- [Bun](https://bun.sh) >= 1.0
- Git（用于在线更新功能）

## 本地开发

```bash
# 安装依赖
bun install

# 开发模式（前端热更新 + 后端自动重载）
bun run dev
# 前端: http://localhost:5173
# 后端: http://localhost:3000

# 仅构建前端
bun run build

# 生产模式运行
bun server/main.ts
# 访问: http://localhost:3000
```

## 服务器部署

### 1. 克隆代码

```bash
git clone <your-repo-url> /opt/copilot-manager
cd /opt/copilot-manager
bun install
bun run build
```

### 2. 注册 systemd 服务

```bash
cat > /etc/systemd/system/copilot-manager.service << 'EOF'
[Unit]
Description=Copilot Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/copilot-manager
ExecStart=/usr/local/bin/bun server/main.ts
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now copilot-manager
```

### 3. 访问面板

浏览器打开 `http://<server-ip>:3000`

## 使用流程

1. **添加账号** → 账号管理 → 添加账号 → 选择「GitHub 登录」或「手动输入 Token」
2. **创建分组** → 分组管理 → 创建分组 → 设定名称和端口号（如 4141）
3. **分配账号** → 账号管理 → 编辑账号 → 选择所属分组
4. **启动分组** → 分组管理 → 点击 ▶ 启动

启动后该分组的 copilot-api 实例独立运行在指定端口，支持 OpenAI / Anthropic 兼容 API。

## 在线更新

系统设置 → 点击「检查更新并部署」

自动执行：`git pull` → `bun install` → `bun run build` → 重启服务

数据不受影响：SQLite 数据库在 `data/` 目录下，已被 `.gitignore` 排除。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MANAGER_PORT` | `3000` | 管理面板端口 |
| `MANAGER_DATA_DIR` | `./data` | 数据存储目录 |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 仪表盘汇总 |
| GET/POST/PUT/DELETE | `/api/groups` | 分组 CRUD |
| POST | `/api/groups/:id/start\|stop\|restart` | 实例控制 |
| GET | `/api/groups/:id/copilot-status` | 运行中实例的账号状态 |
| GET | `/api/groups/:id/logs` | 实例日志 |
| GET/POST/PUT/DELETE | `/api/accounts` | 账号 CRUD |
| POST | `/api/auth/device-code` | GitHub Device Flow 开始 |
| POST | `/api/auth/poll` | 轮询授权结果 |
| GET | `/api/system/info` | Git 版本信息 |
| POST | `/api/system/update` | 在线更新 |
