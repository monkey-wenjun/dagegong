# 安全说明

## 配置文件存储位置

所有包含敏感信息的配置文件都存储在用户目录下，**不会**被提交到 Git 仓库：

```
~/.dagegong-cli/                    # Linux/macOS
%USERPROFILE%\.dagegong-cli\        # Windows
```

### 敏感文件列表

| 文件 | 说明 | 安全等级 |
|------|------|----------|
| `config.json` | 主配置文件（含 Cookie） | 🔴 高 |
| `config/ai-auto-reply.json` | AI 自动回复配置（含 API Key） | 🔴 高 |
| `config/llm.json` | LLM 配置（含 API Key） | 🔴 高 |
| `cookies.json` | BOSS 直聘 Cookie | 🔴 高 |
| `ai-auto-replied-messages.json` | 已回复消息记录 | 🟡 中 |
| `stats-*.json` | 投递统计 | 🟢 低 |
| `logs/*.log` | 运行日志 | 🟢 低 |

## Git 忽略配置

项目 `.gitignore` 已配置忽略所有敏感文件：

```gitignore
# Config files with sensitive data (DO NOT COMMIT)
config.json
ai-auto-reply.json
boss.json
llm.json
boss-cookies.json
*.sqlite
.env*
```

## 安全建议

1. **不要**将 `~/.dagegong-cli/` 目录下的任何文件提交到 Git
2. **不要**在代码中硬编码 API Key 或 Cookie
3. **定期更换** API Key 和 Cookie
4. **注意**日志文件可能包含敏感信息，不要分享日志给他人

## 配置文件权限

CLI 不会修改文件权限，建议用户自行设置：

```bash
# Linux/macOS
chmod 600 ~/.dagegong-cli/config.json
chmod 600 ~/.dagegong-cli/config/ai-auto-reply.json
```

## 敏感信息泄露处理

如果意外提交了敏感信息：

1. 立即撤销提交：`git reset HEAD~1`
2. 修改敏感信息（更换 API Key、Cookie 等）
3. 强制推送到远程：`git push --force`（如果是私有仓库）
4. 如果是公开仓库，敏感信息可能已经泄露，**必须立即更换**所有 API Key 和密码
