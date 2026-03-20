# Python + FastAPI + Playwright 重构方案

## 📋 项目架构

```
dagegong-python/
├── backend/                          # FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI 入口
│   │   ├── config.py                 # 配置管理
│   │   ├── api/                      # API 路由
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── auth.py           # 登录相关
│   │   │   │   ├── jobs.py           # 职位相关
│   │   │   │   ├── chat.py           # 聊天相关
│   │   │   │   ├── boss.py           # BOSS相关
│   │   │   │   ├── settings.py       # 设置相关
│   │   │   │   └── logs.py           # 日志相关
│   │   ├── core/                     # 核心业务逻辑
│   │   │   ├── __init__.py
│   │   │   ├── browser.py            # Playwright 浏览器管理
│   │   │   ├── boss_automation.py    # BOSS 自动化流程
│   │   │   ├── job_filter.py         # 职位过滤逻辑
│   │   │   ├── greeting_generator.py # 打招呼消息生成
│   │   │   └── chat_manager.py       # 聊天管理
│   │   ├── models/                   # SQLAlchemy 数据模型
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── user.py
│   │   │   ├── job.py
│   │   │   ├── boss.py
│   │   │   ├── company.py
│   │   │   ├── chat_log.py
│   │   │   └── mark_log.py
│   │   ├── schemas/                  # Pydantic 模型
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── job.py
│   │   │   └── chat.py
│   │   ├── services/                 # 业务服务层
│   │   │   ├── __init__.py
│   │   │   ├── llm_service.py        # LLM 服务
│   │   │   ├── cookie_service.py     # Cookie 管理
│   │   │   └── notification_service.py # 通知服务
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── decorators.py
│   │       └── helpers.py
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/                         # Web 前端 (React/Vue)
│   ├── src/
│   │   ├── api/                      # API 客户端
│   │   ├── components/
│   │   ├── views/
│   │   ├── stores/
│   │   └── App.tsx
│   └── package.json
├── playwright_worker/                # Playwright 独立工作进程
│   ├── worker.py
│   └── tasks/
└── docker-compose.yml
```

## 🎯 技术栈

| 组件 | 技术 |
|------|------|
| 后端框架 | FastAPI |
| 浏览器自动化 | Playwright (Python) |
| 数据库 | SQLite (开发) / PostgreSQL (生产) |
| ORM | SQLAlchemy 2.0 + Alembic |
| 任务队列 | Celery + Redis |
| 前端 | React + Ant Design / Vue 3 + Element Plus |
| AI 集成 | OpenClaw / LangChain |

## 📦 依赖列表

```txt
# Core
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
python-multipart>=0.0.6
pydantic>=2.5.0
pydantic-settings>=2.1.0

# Playwright
playwright>=1.40.0

# Database
sqlalchemy>=2.0.23
alembic>=1.12.0
aiosqlite>=0.19.0

# Task Queue (可选)
celery>=5.3.0
redis>=5.0.0

# AI Integration
openai>=1.0.0
langchain>=0.0.350

# Utils
httpx>=0.25.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.0
python-json-logger>=2.0.0
schedule>=1.2.0
```

## 🔌 核心 API 设计

### 1. 浏览器控制 API
```python
# POST /api/v1/browser/launch
# 启动浏览器
{
    "headless": true,
    "proxy": null
}

# POST /api/v1/browser/close
# 关闭浏览器

# GET /api/v1/browser/status
# 获取浏览器状态
```

### 2. BOSS 自动化 API
```python
# POST /api/v1/boss/login
# 使用 cookie 登录
{
    "cookies": [...]
}

# POST /api/v1/boss/auto-chat/start
# 开始自动聊天任务
{
    "config": {
        "expect_job_types": ["Python", "Go"],
        "expect_cities": ["北京", "上海"],
        "salary_range": [20, 40],
        "greeting_mode": "ai_generated",  # default/custom/ai_generated
        "max_daily_chats": 100
    }
}

# POST /api/v1/boss/auto-chat/stop
# 停止自动聊天任务

# GET /api/v1/boss/auto-chat/status
# 获取任务状态
```

### 3. 数据管理 API
```python
# GET /api/v1/jobs
# 获取职位列表

# GET /api/v1/bosses
# 获取 BOSS 列表

# GET /api/v1/chat-logs
# 获取聊天记录

# GET /api/v1/mark-logs
# 获取标记记录
```

## 🔄 与原项目的功能映射

| 原功能 (Electron/Puppeteer) | 新实现 (FastAPI/Playwright) |
|----------------------------|----------------------------|
| `geek-auto-start-chat-with-boss/index.mjs` | `app/core/boss_automation.py` |
| `sqlite-plugin/` | `app/models/` + SQLAlchemy |
| `ui/` (Electron) | `frontend/` (React/Vue) |
| `pm/daemon.js` | Celery Worker / APScheduler |
| Cookie 管理 | `app/services/cookie_service.py` |
| LLM 调用 | `app/services/llm_service.py` |

## 🚀 后续 OpenClaw 集成方案

OpenClaw 是一个 AI 代理框架，可以用来：

1. **智能任务调度**: 让 AI 决定何时启动/停止任务
2. **自动简历优化**: 根据职位 JD 优化打招呼消息
3. **智能回复**: 自动回复 BOSS 消息
4. **数据分析**: 分析求职数据，给出建议

集成方式：
- 创建 `app/openclaw/` 模块
- 实现自定义 Tools: BrowserTool, DatabaseTool, NotificationTool
- 使用 LangChain / OpenClaw 编排工作流

## 📊 迁移步骤

1. **Phase 1**: 搭建 FastAPI 基础框架 + SQLAlchemy 模型
2. **Phase 2**: 实现 Playwright 浏览器自动化
3. **Phase 3**: 迁移核心业务逻辑
4. **Phase 4**: 开发新前端界面
5. **Phase 5**: 集成 OpenClaw
6. **Phase 6**: 测试与优化
