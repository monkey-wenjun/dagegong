#!/bin/bash
# Dagegong 服务器部署脚本

set -e

SERVER_HOST="${1:-192.168.1.29}"
SERVER_USER="${2:-$USER}"
REMOTE_DIR="~/dagegong"

echo "========================================"
echo "Dagegong 服务器部署"
echo "服务器: $SERVER_USER@$SERVER_HOST"
echo "========================================"

# 1. 推送代码到服务器
echo "[1/5] 推送代码到服务器..."
ssh $SERVER_USER@$SERVER_HOST "cd $REMOTE_DIR && git pull"

# 2. 安装依赖
echo "[2/5] 安装依赖..."
ssh $SERVER_USER@$SERVER_HOST "cd $REMOTE_DIR && pnpm install"

# 3. 检查 AI 配置
echo "[3/5] 检查 AI 配置..."
ssh $SERVER_USER@$SERVER_HOST "cat ~/.dagegong-cli/config/ai-auto-reply.json 2>/dev/null || echo '警告: AI 配置不存在'"

# 4. 启动 AI 守护进程
echo "[4/5] 启动 AI 守护进程..."
ssh $SERVER_USER@$SERVER_HOST "cd $REMOTE_DIR/packages/dagegong-cli && node bin/cli.mjs ai-daemon --status"
ssh $SERVER_USER@$SERVER_HOST "cd $REMOTE_DIR/packages/dagegong-cli && node bin/cli.mjs ai-daemon --start" || echo "守护进程可能已在运行"

# 5. 验证部署
echo "[5/5] 验证部署..."
ssh $SERVER_USER@$SERVER_HOST "cd $REMOTE_DIR/packages/dagegong-cli && node bin/cli.mjs ai-daemon --status"
ssh $SERVER_USER@$SERVER_HOST "cd $REMOTE_DIR/packages/dagegong-cli && node bin/cli.mjs today"

echo ""
echo "========================================"
echo "部署完成！"
echo "========================================"
echo ""
echo "查看日志:"
echo "  AI守护: ssh $SERVER_USER@$SERVER_HOST 'tail -f ~/.dagegong-cli/logs/ai-daemon.log'"
echo "  投递:   ssh $SERVER_USER@$SERVER_HOST 'tail -f ~/.dagegong-cli/logs/\$(date +%Y-%m-%d).log'"
echo ""
echo "管理命令:"
echo "  启动AI:  node bin/cli.mjs ai-daemon --start"
echo "  停止AI:  node bin/cli.mjs ai-daemon --stop"
echo "  状态:    node bin/cli.mjs ai-daemon --status"
echo "  统计:    node bin/cli.mjs today"
