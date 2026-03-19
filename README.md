# 🔥 打个工 - 打工人求职神器

> **BOSS 炸弹** - 自动开聊 BOSS，助力每位打工人求职！

<p align="center">
  <img src="screenshot.png" alt="打个工截图" width="800">
</p>

[![Build Status](https://github.com/monkey-wenjun/dagegong/workflows/Build%20Electron%20App/badge.svg)](https://github.com/monkey-wenjun/dagegong/actions)
[![Version](https://img.shields.io/badge/version-0.17.1-blue.svg)](https://github.com/monkey-wenjun/dagegong/releases)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)

## ✨ 功能特性

### 🎯 自动开聊
按照你设置的求职偏好，自动在 BOSS 直聘上与匹配的招聘者打招呼：

- **智能匹配** - 根据公司名称、职位类型、职位描述自动筛选目标职位
- **活跃度检测** - 自动跳过长期不活跃的 BOSS，提高回复率
- **自动筛选** - 不匹配的职位自动标记为不合适，减少无效推荐
- **异常处理** - 自动切换筛选条件获取更多职位，用完开聊次数后智能暂停

### 💬 已读不回自动复聊
BOSS 已读不回？自动提醒功能帮你把握机会：

- **智能检测** - 自动查找已读不回的聊天
- **定时跟进** - 支持设置跟进时限和间隔
- **AI 回复** - 集成大语言模型，根据简历和聊天上下文生成个性化跟进内容
- **多种提醒** - 支持发送表情和自定义消息

### 📊 数据管理
- **职位库** - 管理所有浏览过的职位信息
- **公司库** - 记录和筛选目标公司
- **BOSS 库** - 管理沟通过的招聘者
- **运行日志** - 查看详细的操作记录

### ⚙️ 高级配置
- **任务管理** - 创建和管理多个求职任务
- **LLM 配置** - 配置 AI 回复服务
- **Cookie 助手** - 便捷登录 BOSS 直聘
- **浏览器助手** - 智能浏览器辅助工具

## 🚀 快速开始

### 下载安装

访问 [Releases](https://github.com/monkey-wenjun/dagegong/releases) 页面下载最新版本：

- **Windows**: `geekgeekrun-ui_x.x.x_x64_setup.exe`
- **macOS**: `geekgeekrun-ui_x.x.x.dmg`
- **Linux**: `geekgeekrun-ui_x.x.x.AppImage`

### 开发环境

```bash
# 克隆项目
git clone git@github.com:monkey-wenjun/dagegong.git
cd dagegong

# 安装依赖
pnpm install

# 启动开发模式
cd packages/ui
pnpm run dev

# 构建应用
pnpm run build:win    # Windows
pnpm run build:mac    # macOS
pnpm run build:linux  # Linux
```

## 🏗️ 项目结构

```
dagegong/
├── packages/
│   ├── ui/                              # Electron 桌面应用
│   ├── geek-auto-start-chat-with-boss/  # 核心自动聊天逻辑
│   ├── run-core-of-geek-auto-start-chat-with-boss/  # 守护进程
│   ├── sqlite-plugin/                   # SQLite 数据库插件
│   ├── pm/                              # 进程管理
│   ├── utils/                           # 公共工具库
│   ├── dingtalk-plugin/                 # 钉钉通知插件
│   └── launch-bosszhipin-login-page-with-preload-extension/  # 登录扩展
├── .github/workflows/                   # CI/CD 工作流
└── README.md
```

## 🛠️ 技术栈

- **框架**: Electron + Vue 3 + TypeScript
- **构建**: Vite + electron-vite
- **UI 组件**: Element Plus + UnoCSS
- **状态管理**: Pinia
- **自动化**: Puppeteer
- **构建工具**: electron-builder
- **包管理**: pnpm workspace

## 📝 使用指南

### 1. 配置 Cookie
首次使用需要登录 BOSS 直聘：
1. 打开应用，点击左侧"Cookie 助手"
2. 按照指引登录 BOSS 直聘账号
3. 复制 Cookie 到应用中

### 2. 设置求职偏好
1. 进入"自动开聊"页面
2. 配置期望职位、城市、薪资等筛选条件
3. 设置职位关键词匹配规则

### 3. 启动自动开聊
1. 点击"准备运行"检查配置
2. 确认无误后点击"开始运行"
3. 程序将自动打开浏览器并开始匹配职位

### 4. 配置已读不回提醒（可选）
1. 进入"已读不回自动复聊"页面
2. 配置跟进时限和间隔
3. 选择发送内容类型（表情/AI 生成）
4. 启动功能即可

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📄 许可证

[ISC](LICENSE) © geekgeekrun

## 👨‍💻 作者

- **阿文** - [hi@awen.me](mailto:hi@awen.me)
- 博客: [https://www.awen.me](https://www.awen.me)

---

<p align="center">
  ⭐ 如果这个项目帮到了你，请给个 Star！
</p>
