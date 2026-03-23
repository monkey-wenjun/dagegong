#!/bin/bash
# Dagegong 自动投递服务器脚本
# 包含：投递任务、AI守护进程管理、每日21点汇总报告

# 配置
NODE_VERSION="22"
DAGEGONG_DIR="$HOME/dagegong"
CLI_DIR="$DAGEGONG_DIR/packages/dagegong-cli"
LOG_DIR="$HOME/.dagegong-cli/logs"
CONFIG_DIR="$HOME/.dagegong-cli/config"

# 飞书 Webhook（从配置文件读取）
FEISHU_WEBHOOK=$(cat $CONFIG_DIR/daily-stats-webhook.url 2>/dev/null || echo "")

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 使用 Node 22
nvm use $NODE_VERSION 2>/dev/null || nvm install $NODE_VERSION

cd $CLI_DIR

# 获取当前小时
HOUR=$(date +%H)
MINUTE=$(date +%M)

# ============================================
# 1. 检查并启动 AI 守护进程（如果未运行）
# ============================================
start_ai_daemon_if_needed() {
    local status=$(node bin/cli.mjs ai-daemon --status 2>/dev/null)
    if echo "$status" | grep -q "未运行"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] AI 守护进程未运行，正在启动..."
        node bin/cli.mjs ai-daemon --start > /dev/null 2>&1
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] AI 守护进程已启动"
    fi
}

# ============================================
# 2. 每日 21:00 发送汇总报告
# ============================================
send_daily_report() {
    if [ "$HOUR" -eq 21 ] && [ "$MINUTE" -lt 5 ]; then
        # 检查今天是否已发送
        local today=$(date +%Y-%m-%d)
        local lock_file="$HOME/.dagegong-cli/.daily-report-sent"
        
        if [ -f "$lock_file" ] && [ "$(cat $lock_file)" = "$today" ]; then
            return 0  # 已发送
        fi
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 发送每日汇总报告..."
        node -e "
            import('./src/daily-report.mjs').then(m => m.sendDailyReport('$FEISHU_WEBHOOK'))
        " 2>/dev/null
    fi
}

# ============================================
# 3. 投递任务（7:00-21:00）
# ============================================
run_apply_job() {
    # 只在 7:00-21:00 运行投递
    if [ "$HOUR" -lt 7 ] || [ "$HOUR" -ge 21 ]; then
        return 0
    fi
    
    # 检查是否已有投递进程在运行
    if pgrep -f "cli.mjs run" > /dev/null; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 投递进程已在运行，跳过"
        return 0
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始投递任务..."
    
    # 运行投递（限制数量会自动从配置读取）
    node bin/cli.mjs run --headless 2>&1 | tee -a "$LOG_DIR/cron-run-$(date +%Y%m%d).log"
    
    local exit_code=$?
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 投递任务结束，退出码: $exit_code"
    
    return $exit_code
}

# ============================================
# 主逻辑
# ============================================

# 确保目录存在
mkdir -p $LOG_DIR

# 启动 AI 守护进程（如果配置启用）
start_ai_daemon_if_needed

# 发送每日报告（如果是21点）
send_daily_report

# 运行投递任务
run_apply_job

exit 0
