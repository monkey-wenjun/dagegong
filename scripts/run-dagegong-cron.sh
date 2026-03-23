#!/bin/bash
# Dagegong 定时任务脚本 - 仅投递和每日报告
# AI 守护进程由 systemd 管理

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

cd ~/dagegong-app/packages/dagegong-cli

HOUR=$(date +%H)
MINUTE=$(date +%M)
FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"  # 请替换为实际的 webhook

# ===== 每日21:00发送汇总报告 =====
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

# ===== 投递任务（7:00-21:00）=====
run_apply() {
    # 只在 7:00-21:00 运行投递
    if [ "$HOUR" -lt 7 ] || [ "$HOUR" -ge 21 ]; then
        return 0
    fi
    
    # 检查是否已有投递进程在运行
    if pgrep -f "cli.mjs run" > /dev/null; then
        return 0
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始投递..."
    node bin/cli.mjs run --headless
}

# 主逻辑
send_daily_report
run_apply
