#!/bin/bash
# Dagegong Systemd 服务安装脚本
# 在服务器上以 sudo 权限执行

set -e

USER_NAME="${1:-wenjun}"
DAGEGONG_DIR="/home/$USER_NAME/dagegong-app"

echo "========================================"
echo "Dagegong Systemd 服务安装"
echo "========================================"
echo ""
echo "用户: $USER_NAME"
echo "目录: $DAGEGONG_DIR"
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "❌ 请使用 sudo 运行此脚本"
    echo "   sudo bash install-systemd-services.sh"
    exit 1
fi

# 检查用户是否存在
if ! id "$USER_NAME" &>/dev/null; then
    echo "❌ 用户 $USER_NAME 不存在"
    exit 1
fi

# 检查目录是否存在
if [ ! -d "$DAGEGONG_DIR" ]; then
    echo "❌ 目录 $DAGEGONG_DIR 不存在"
    exit 1
fi

echo "[1/5] 安装 AI 守护进程服务..."
cat > /etc/systemd/system/dagegong-ai-daemon.service << 'EOF'
[Unit]
Description=Dagegong AI Auto-Reply Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=wenjun
Group=wenjun
WorkingDirectory=/home/wenjun/dagegong-app/packages/dagegong-cli
Environment="NVM_DIR=/home/wenjun/.nvm"
Environment="NODE_VERSION=22"
Environment="DAGEGONG_RUNTIME_DIR=/home/wenjun/.dagegong-cli"
Environment="DAGEGONG_BROWSER_HEADLESS=1"
ExecStart=/bin/bash -c 'source $NVM_DIR/nvm.sh && nvm use $NODE_VERSION && exec node bin/cli.mjs ai-daemon --daemon'
Restart=always
RestartSec=10
StandardOutput=append:/home/wenjun/.dagegong-cli/logs/ai-daemon-systemd.log
StandardError=append:/home/wenjun/.dagegong-cli/logs/ai-daemon-systemd.log

[Install]
WantedBy=multi-user.target
EOF

echo "[2/5] 安装投递定时器服务..."
cat > /etc/systemd/system/dagegong-apply.timer << 'EOF'
[Unit]
Description=Dagegong Job Apply Timer

[Timer]
OnCalendar=*-*-* 07:00..21:00:00/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/dagegong-apply.service << 'EOF'
[Unit]
Description=Dagegong Job Apply Service

[Service]
Type=oneshot
User=wenjun
Group=wenjun
WorkingDirectory=/home/wenjun/dagegong-app/packages/dagegong-cli
Environment="NVM_DIR=/home/wenjun/.nvm"
Environment="NODE_VERSION=22"
Environment="DAGEGONG_BROWSER_HEADLESS=1"
ExecStart=/bin/bash -c 'source $NVM_DIR/nvm.sh && nvm use $NODE_VERSION && (pgrep -f "cli.mjs run" > /dev/null || node bin/cli.mjs run --headless)'
StandardOutput=append:/home/wenjun/.dagegong-cli/logs/apply-service.log
StandardError=append:/home/wenjun/.dagegong-cli/logs/apply-service.log
EOF

echo "[3/5] 重新加载 systemd..."
systemctl daemon-reload

echo "[4/5] 启用服务..."
systemctl enable dagegong-ai-daemon.service
systemctl enable dagegong-apply.timer

echo "[5/5] 启动服务..."
systemctl start dagegong-ai-daemon.service
systemctl start dagegong-apply.timer

echo ""
echo "========================================"
echo "安装完成！"
echo "========================================"
echo ""
echo "服务状态:"
systemctl status dagegong-ai-daemon.service --no-pager 2>/dev/null | head -5
echo ""
systemctl status dagegong-apply.timer --no-pager 2>/dev/null | head -5
echo ""
echo "管理命令:"
echo "  # AI 守护进程"
echo "  sudo systemctl start dagegong-ai-daemon    # 启动"
echo "  sudo systemctl stop dagegong-ai-daemon     # 停止"
echo "  sudo systemctl restart dagegong-ai-daemon  # 重启"
echo "  sudo systemctl status dagegong-ai-daemon   # 状态"
echo "  sudo journalctl -u dagegong-ai-daemon -f   # 查看日志"
echo ""
echo "  # 投递定时器"
echo "  sudo systemctl start dagegong-apply.timer  # 启动"
echo "  sudo systemctl stop dagegong-apply.timer   # 停止"
echo "  sudo systemctl list-timers dagegong-apply  # 查看定时器"
echo ""
echo "  # 手动触发投递"
echo "  sudo systemctl start dagegong-apply.service"
