#!/bin/bash

# Dagegong CLI 服务器部署脚本
# 复用 geek-auto-start-chat-with-boss 核心逻辑

set -e

echo "=========================================="
echo "🔥 Dagegong CLI 服务器部署脚本"
echo "=========================================="

# 配置
INSTALL_DIR="/home/wenjun/dagegong-cli"
SERVICE_NAME="dagegong-scheduler"
NODE_VERSION="20"

# 检查是否为 root 用户
if [ "$EUID" -eq 0 ]; then 
   echo "❌ 请不要以 root 用户运行此脚本"
   exit 1
fi

echo ""
echo "📋 安装信息:"
echo "  安装目录: $INSTALL_DIR"
echo "  服务名称: $SERVICE_NAME"
echo ""

# 1. 安装依赖
echo "📦 步骤 1/6: 安装系统依赖..."
sudo apt-get update
sudo apt-get install -y \
    curl \
    wget \
    git \
    vim \
    ca-certificates \
    gnupg \
    libnss3 \
    libatk-bridge2.0-0 \
    libxss1 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    libappindicator3-1 \
    libxshmfence1 \
    chromium-browser 2>/dev/null || sudo apt-get install -y chromium

# 2. 安装/更新 Node.js
echo "📦 步骤 2/6: 安装 Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "  Node.js 已安装: $(node --version)"
fi

# 3. 安装 pnpm
echo "📦 步骤 3/6: 安装 pnpm..."
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
else
    echo "  pnpm 已安装: $(pnpm --version)"
fi

# 4. 创建目录结构
echo "📦 步骤 4/6: 创建目录结构..."
mkdir -p "$INSTALL_DIR"

# 5. 解压部署包
echo "📦 步骤 5/6: 部署应用文件..."
if [ -f "dagegong-cli.tar.gz" ]; then
    tar -xzf dagegong-cli.tar.gz -C "$INSTALL_DIR" --strip-components=1
    echo "  ✓ 应用文件已解压到 $INSTALL_DIR"
else
    echo "  ⚠️ 未找到部署包 dagegong-cli.tar.gz，跳过解压"
fi

# 6. 安装 Node 依赖
echo "📦 步骤 6/6: 安装 Node 依赖..."
cd "$INSTALL_DIR"

# 创建 package.json 如果缺失
if [ ! -f "package.json" ]; then
    cat > package.json << 'EOF'
{
  "name": "@dagegong/dagegong-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "dagegong-cli": "./bin/cli.mjs"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.1",
    "node-cron": "^3.0.3",
    "tapable": "^2.2.1",
    "puppeteer": "24.19.0",
    "puppeteer-extra": "3.3.6",
    "puppeteer-extra-plugin-stealth": "2.11.2",
    "puppeteer-extra-plugin-anonymize-ua": "2.4.6"
  }
}
EOF
fi

# 安装依赖
npm install

echo "  ✓ 依赖安装完成"

# 7. 创建启动脚本
cat > "$INSTALL_DIR/run.sh" << 'EOF'
#!/bin/bash
cd /home/wenjun/dagegong-cli
node bin/cli.mjs run "$@"
EOF
chmod +x "$INSTALL_DIR/run.sh"

# 8. 创建 systemd 服务
echo "⚙️  创建系统服务..."

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=Dagegong CLI Scheduler
After=network.target

[Service]
Type=simple
User=wenjun
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PUPPETEER_CACHE_DIR=/home/wenjun/.cache/puppeteer
Environment=PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ExecStart=/usr/bin/node $INSTALL_DIR/bin/cli.mjs run
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "📋 重要提示:"
echo ""
echo "本 CLI 工具复用 UI 应用的配置文件，需要:"
echo "  ~/.dagegong/config/boss.json"
echo "  ~/.dagegong/config/common-job-condition-config.json"
echo "  ~/.dagegong/config/llm.json"
echo "  ~/.dagegong/config/daily-stats-notification.json"
echo "  ~/.dagegong/storage/boss-cookies.json"
echo ""
echo "请确保在部署前已从本地复制这些配置文件到服务器！"
echo ""
echo "📋 后续步骤:"
echo ""
echo "1. 从本地复制 UI 配置到服务器（在本地执行）:"
echo "   scp -r ~/.dagegong/config wenjun@192.168.1.29:~/.dagegong/"
echo "   scp -r ~/.dagegong/storage wenjun@192.168.1.29:~/.dagegong/"
echo ""
echo "2. 在服务器上初始化配置:"
echo "   ssh wenjun@192.168.1.29 'cd ~/dagegong-cli && node bin/cli.mjs init'"
echo ""
echo "3. 测试运行:"
echo "   ssh wenjun@192.168.1.29 'cd ~/dagegong-cli && node bin/cli.mjs run --limit 5'"
echo ""
echo "4. 启动定时任务服务:"
echo "   sudo systemctl enable $SERVICE_NAME"
echo "   sudo systemctl start $SERVICE_NAME"
echo ""
echo "5. 查看服务状态:"
echo "   sudo systemctl status $SERVICE_NAME"
echo "   sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "📁 应用目录: $INSTALL_DIR"
echo ""
