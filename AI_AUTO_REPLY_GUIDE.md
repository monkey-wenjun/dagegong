# CLI 版本 AI 自动回复功能指南

## 功能概述

CLI 版本的 AI 自动回复功能可以：
1. 轮询检测 BOSS 直聘的新消息
2. 调用 Dify API 自动生成回复
3. 自动发送回复给招聘方

## 配置步骤

### 1. 确保已登录 BOSS 直聘

AI 自动回复功能需要有效的 BOSS 直聘 Cookie。在运行前，请确保已通过 CLI 登录：

```bash
dagegong-cli start --cookie "你的cookie字符串"
```

或使用 Cookie 文件：

```bash
dagegong-cli start --cookie-file cookies.json
```

### 2. 配置 Dify API

设置 Dify API URL 和密钥：

```bash
# 设置 Dify API
dagegong-cli ai-reply --url http://your-dify-server/v1/chat-messages --key your-api-key

# 启用 AI 自动回复
dagegong-cli ai-reply --enable
```

### 3. 查看配置

```bash
# 查看当前 AI 自动回复配置
dagegong-cli ai-reply --status
```

### 4. 启动自动回复

在运行主程序时，AI 自动回复会自动启动：

```bash
dagegong-cli start
```

启动后，你会看到类似输出：
```
🤖 AI 自动回复服务已启动
[AiAutoReply] 检查间隔: 120 秒
[AiAutoReply] API: http://192.168.1.29/v1/chat-messages
```

## 配置文件说明

AI 自动回复的配置存储在 `~/.dagegong-cli/config/ai-auto-reply.json`：

```json
{
  "enabled": true,
  "apiUrl": "http://192.168.1.29/v1/chat-messages",
  "apiKey": "your-api-key",
  "checkInterval": 120000,
  "enableSummary": false,
  "summaryPrompt": "..."
}
```

## 工作原理

1. **轮询检测**：每 2 分钟（可配置）检查一次好友列表
2. **新消息识别**：检测有未读消息或最后一条消息来自对方的对话
3. **AI 回复生成**：调用 Dify API 生成回复内容
4. **自动发送**：通过 BOSS 直聘 API 发送回复

## API 端点

CLI 版本使用以下 BOSS 直聘 API 端点：

- **好友列表**（自动尝试多个端点）：
  - `/wapi/zprelation/friend/geekFilterByLabel?labelId=0`
  - `/wapi/zprelation/friend/getGeekFriendList`
  - `/wapi/zprelation/friend/list?scene=1`

- **聊天记录**：
  - `/wapi/zpchat/geek/historyMsg`

- **发送消息**：
  - `/wapi/zpchat/geek/sendMsg`

## 日志输出

运行时会输出详细的调试信息：

```
[AiAutoReply] ====== 开始检查未读消息 ======
[AiAutoReply] [DEBUG] ========== 开始获取好友列表 ==========
[AiAutoReply] [DEBUG] ✅ API /wapi/zprelation/friend/geekFilterByLabel 成功，获取到 15 个好友
[AiAutoReply] 找到 3 个需要回复的对话
[AiAutoReply] 处理对话: 张经理 @ XX科技
[AiAutoReply] Dify 回复: 您好，我对这个职位很感兴趣...
[AiAutoReply] ✓ 回复成功: 您好...
[AiAutoReply] ====== 检查完成，成功回复 1 个 ======
```

## 注意事项

1. **Cookie 有效期**：BOSS 直聘 Cookie 会过期，需要定期重新登录
2. **频率限制**：不要过于频繁地检查，避免触发反爬机制
3. **Dify 配置**：确保 Dify 工作流已正确配置，能够处理求职对话场景
4. **手动干预**：AI 自动回复后，建议定期查看对话，必要时人工介入

## 故障排查

### 问题：API 返回 "登录状态已失效"

**解决**：重新运行登录命令获取新的 Cookie

### 问题：Dify API 调用失败

**解决**：
1. 检查 API URL 和密钥是否正确
2. 确保 Dify 服务器可访问
3. 查看 Dify 服务端日志

### 问题：找不到好友列表

**解决**：
1. 确保已登录 BOSS 直聘
2. 检查网络连接
3. 查看是否有验证码拦截

## 与 UI 版本的区别

| 特性 | CLI 版本 | UI 版本 |
|------|----------|---------|
| 运行方式 | 命令行 | 图形界面 |
| 数据存储 | 直接调用 API | 本地 SQLite 数据库 |
| 实时性 | 实时 API 调用 | 数据库轮询 |
| 配置方式 | 命令行参数 | 界面配置 |
| 适用场景 | 服务器部署 | 本地使用 |

## 安全提示

- Cookie 文件包含敏感信息，不要分享给他人
- API 密钥应妥善保管
- 建议在私有网络中部署 Dify 服务
