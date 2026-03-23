#!/bin/bash
# 安装 Dagegong AI 守护进程 systemd 服务
# 在服务器上手动执行

echo "安装 Dagegong AI 守护进程 systemd 服务..."

# 复制服务文件
sudo cp /tmp/dagegong-ai-daemon.service /etc/systemd/system/

# 重新加载 systemd
sudo systemctl daemon-reload

# 启用服务（开机启动）
sudo systemctl enable dagegong-ai-daemon.service

# 启动服务
sudo systemctl start dagegong-ai-daemon.service

# 查看状态
echo ""
echo "服务状态:"
sudo systemctl status dagegong-ai-daemon.service --no-pager

echo ""
echo "安装完成！"
echo ""
echo "管理命令:"
echo "  启动: sudo systemctl start dagegong-ai-daemon"
echo "  停止: sudo systemctl stop dagegong-ai-daemon"
echo "  重启: sudo systemctl restart dagegong-ai-daemon"
echo "  状态: sudo systemctl status dagegong-ai-daemon"
echo "  日志: sudo journalctl -u dagegong-ai-daemon -f"
