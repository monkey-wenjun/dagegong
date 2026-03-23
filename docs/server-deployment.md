# Dagegong 服务器部署指南

## 架构变更

### 1. AI 自动回复守护进程（独立运行）
- **独立进程**：AI 服务作为独立子进程运行，与投递流程分离
- **自动恢复**：连续错误 5 次后自动重启浏览器
- **持久运行**：投递完成后 AI 服务继续运行

### 2. 飞书通知变更
- **移除实时通知**：不再每5个投递发送通知
- **每日21点汇总**：统一发送每日投递和 AI 回复统计

---

## 服务器更新步骤

### 1. 更新代码

```bash
cd ~/dagegong
git pull
pnpm install
```

### 2. 更新服务器脚本

替换 `~/run_dagegong.sh` 为以下内容：

```bash
#!/bin/bash
# Dagegong 自动投递服务器脚本

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

cd ~/dagegong/packages/dagegong-cli

HOUR=$(date +%H)
MINUTE=$(date +%M)
FEISHU_WEBHOOK="你的飞书Webhook"

# ===== 1. 启动 AI 守护进程（如果未运行）=====
start_ai_daemon() {
    local status=$(node bin/cli.mjs ai-daemon --status 2>/dev/null)
    if echo "$status" | grep -q "未运行"; then
        echo "[$(date)] 启动 AI 守护进程..."
        node bin/cli.mjs ai-daemon --start
    fi
}

# ===== 2. 每日21:00发送汇总报告 =====
send_daily_report() {
    if [ "$HOUR" -eq 21 ] && [ "$MINUTE" -lt 10 ]; then
        node -e "
            import('./src/daily-report.mjs').then(m => {
                m.sendDailyReport('$FEISHU_WEBHOOK').then(r => {
                    console.log('[DailyReport]', r.sent ? '已发送' : '跳过');
                });
            });
        "
    fi
}

# ===== 3. 投递任务（7:00-21:00）=====
run_apply() {
    if [ "$HOUR" -lt 7 ] || [ "$HOUR" -ge 21 ]; then
        return 0
    fi
    
    if pgrep -f "cli.mjs run" > /dev/null; then
        return 0
    fi
    
    echo "[$(date)] 开始投递..."
    node bin/cli.mjs run --headless
}

# 主逻辑
start_ai_daemon
send_daily_report
run_apply
```

### 3. 设置定时任务

```bash
# 编辑 crontab
crontab -e

# 添加（每5分钟检查一次）
*/5 * * * * /bin/bash ~/run_dagegong.sh >> ~/.dagegong-cli/logs/cron.log 2>&1
```

### 4. 启动 AI 守护进程

```bash
cd ~/dagegong/packages/dagegong-cli
node bin/cli.mjs ai-daemon --start
```

### 5. 验证部署

```bash
# 检查 AI 守护进程状态
node bin/cli.mjs ai-daemon --status

# 查看日志
tail -f ~/.dagegong-cli/logs/ai-daemon.log
tail -f ~/.dagegong-cli/logs/cron.log
```

---

## CLI 命令参考

### AI 守护进程管理

```bash
# 启动守护进程
dagegong-cli ai-daemon --start

# 停止守护进程
dagegong-cli ai-daemon --stop

# 查看状态
dagegong-cli ai-daemon --status
```

### 手动发送日报

```bash
# 在 CLI 目录下运行
node -e "import('./src/daily-report.mjs').then(m => m.sendDailyReport('你的Webhook', {force: true}))"
```

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `~/.dagegong-cli/ai-daemon.pid` | AI 守护进程 PID 文件 |
| `~/.dagegong-cli/logs/ai-daemon.log` | AI 守护进程日志 |
| `~/.dagegong-cli/logs/cron.log` | 定时任务日志 |
| `~/.dagegong-cli/.daily-report-sent` | 今日报告已发送标记 |
| `~/.dagegong-cli/stats-YYYY-MM-DD.json` | 每日投递统计 |

---

## 故障排查

### AI 守护进程无法启动

```bash
# 检查配置
node bin/cli.mjs ai-reply

# 查看详细日志
cat ~/.dagegong-cli/logs/ai-daemon.log
```

### 日报未发送

```bash
# 手动触发测试
node -e "import('./src/daily-report.mjs').then(m => m.sendDailyReport('webhook', {force: true}))"
```

### 投递任务卡死

```bash
# 查看进程
pgrep -f "cli.mjs"

# 强制结束
pkill -f "cli.mjs run"
```
