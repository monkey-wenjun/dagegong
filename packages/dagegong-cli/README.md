# 🔥 Dagegong CLI

纯命令行版 BOSS 直聘自动投递工具，**复用 UI 配置和核心逻辑**。

## ✨ 特性

- 🔄 **复用 UI 配置** - 直接读取 UI 生成的配置文件（含 API 密钥）
- 🔧 **复用核心逻辑** - 使用 `geek-auto-start-chat-with-boss` 的完整投递逻辑
- 🤖 **AI 打招呼** - 集成 DeepSeek API 自动生成打招呼消息
- 📱 **飞书通知** - 投递进度实时推送到飞书
- 🧪 **API 测试** - 一键测试 AI API 连接
- 🚀 **纯命令行运行** - 无需 GUI，适合服务器部署

## 📁 配置文件

CLI 将 UI 的多个配置文件合并为单个 JSON：

```
~/.dagegong-cli/config.json
```

配置包含：
- **Cookie** - BOSS 直聘登录状态
- **AI API** - DeepSeek/Dify API 密钥
- **职位筛选** - 关键词、城市、薪资、公司黑名单
- **通知** - 飞书 Webhook

## 🚀 使用

### 1. 初始化配置（从 UI 迁移）

```bash
node bin/cli.mjs init
```

### 2. 检查配置

```bash
# 检查配置是否完整
node bin/cli.mjs config --check
```

### 3. 测试 AI API

```bash
node bin/cli.mjs test-ai
```

### 4. 测试飞书通知

```bash
node bin/cli.mjs test-feishu
```

### 5. 生成打招呼消息

```bash
node bin/cli.mjs generate-greeting "运维开发工程师" "阿里巴巴"
```

### 6. 运行投递

```bash
# 干运行（不实际投递）
node bin/cli.mjs run --dry-run

# 实际投递
node bin/cli.mjs run

# 限制投递数量
node bin/cli.mjs run --limit 50

# 显示浏览器界面（调试用）
node bin/cli.mjs run --no-headless

# 指定飞书 webhook
node bin/cli.mjs run --feishu "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx"
```

### 7. 查看统计

```bash
# 今日统计
node bin/cli.mjs stats --today

# 最近 7 天
node bin/cli.mjs stats --recent 7
```

## 🎮 OpenClaw 集成

配置 OpenClaw 技能后，可在飞书发送命令：

```
帮我投递100封简历
运行自动投递
查看今日投递统计
测试 AI 连接
生成打招呼消息
```

## ⚠️ 注意事项

1. **先运行 UI 应用** - 确保 UI 配置已生成
2. **Cookie 会过期** - 过期后需要重新运行 UI 应用登录
3. **配置变更后** - 需要重新运行 `dagegong-cli init` 更新配置

## 📄 License

ISC
