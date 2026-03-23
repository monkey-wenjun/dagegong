# Dagegong 服务器部署检查清单

## 更新内容

### ✅ 1. AI 自动回复守护进程（子进程模式）
- **独立运行**：AI 服务作为独立子进程，投递浏览器崩溃不影响 AI 服务
- **自动重启**：连续错误 5 次后自动重启浏览器
- **命令管理**：
  ```bash
  dagegong-cli ai-daemon --start   # 启动
  dagegong-cli ai-daemon --stop    # 停止
  dagegong-cli ai-daemon --status  # 查看状态
  ```

### ✅ 2. 飞书通知改为每日21点汇总
- **移除实时通知**：不再每5个投递发送通知
- **每日汇总**：21:00 自动发送当日投递 + AI 回复统计
- **关键通知保留**：投递达到限制时仍发送通知

### ✅ 3. 新增命令
- `dagegong-cli today` - 查看今日投递统计

---

## 服务器部署步骤

### 步骤 1: 更新代码
```bash
cd ~/dagegong
git pull
pnpm install
```

### 步骤 2: 更新服务器脚本
编辑 `~/run_dagegong.sh`：

```bash
#!/bin/bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

cd ~/dagegong/packages/dagegong-cli

HOUR=$(date +%H)
MINUTE=$(date +%M)
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"

# ===== 1. 启动 AI 守护进程（如果未运行）=====
start_ai_daemon() {
    local status=$(node bin/cli.mjs ai-daemon --status 2>/dev/null)
    if echo "$status" | grep -q "未运行"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动 AI 守护进程..."
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
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始投递..."
    node bin/cli.mjs run --headless
}

# 主逻辑
start_ai_daemon
send_daily_report
run_apply
```

### 步骤 3: 立即启动 AI 守护进程
```bash
cd ~/dagegong/packages/dagegong-cli
node bin/cli.mjs ai-daemon --start
```

### 步骤 4: 验证
```bash
# 检查守护进程状态
node bin/cli.mjs ai-daemon --status

# 查看日志
tail -f ~/.dagegong-cli/logs/ai-daemon.log

# 查看今日统计
node bin/cli.mjs today
```

---

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/ai-auto-reply-daemon.mjs` | 新增：AI 守护进程实现 |
| `src/daily-report.mjs` | 新增：每日汇总报告 |
| `src/job-runner.mjs` | 修改：移除频繁通知，投递完成不停止 AI |
| `bin/cli.mjs` | 新增：`ai-daemon` 和 `today` 命令 |

---

## 日志文件位置

- `~/.dagegong-cli/logs/ai-daemon.log` - AI 守护进程日志
- `~/.dagegong-cli/logs/ai-auto-reply.log` - AI 回复详细日志
- `~/.dagegong-cli/logs/cron.log` - 定时任务日志
- `~/.dagegong-cli/stats-YYYY-MM-DD.json` - 每日投递统计

---

## 注意事项

1. **AI 守护进程启动后长期运行**，即使投递浏览器崩溃也会自动恢复
2. **飞书通知改为每日21点统一发送**，不再频繁打扰
3. **首次部署后手动启动一次 AI 守护进程**，之后由脚本自动维护
