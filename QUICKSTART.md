# 🚀 Dagegong CLI 快速开始指南

## 本地运行

### 1. 安装依赖

```bash
cd dagegong
pnpm install
```

### 2. 配置 Cookie

```bash
# 创建配置目录
mkdir -p ~/.dagegong-cli

# 将浏览器导出的 Cookie 复制到配置目录
cp /path/to/cookies.json ~/.dagegong-cli/
```

**获取 Cookie 步骤：**
1. 用 Chrome 登录 https://www.zhipin.com
2. 安装 EditThisCookie 扩展
3. 导出 Cookie 为 JSON
4. 保存到 `~/.dagegong-cli/cookies.json`

### 3. 测试运行

```bash
# 测试帮助信息
node packages/dagegong-cli/bin/cli.mjs --help

# 测试投递 5 个职位（调试模式）
node packages/dagegong-cli/bin/cli.mjs apply "运维开发" --limit 5 --no-headless
```

## 服务器部署

### 方法一：使用 PowerShell 脚本（推荐）

```powershell
# 在 Windows PowerShell 中执行
./deploy/upload-and-deploy.ps1 -Server "192.168.1.29" -User "wenjun" -FeishuWebhook "你的飞书webhook"
```

### 方法二：手动部署

```bash
# 1. 本地打包
cd packages/dagegong-cli
tar -czf dagegong-cli.tar.gz bin src package.json

# 2. 上传到服务器
scp dagegong-cli.tar.gz wenjun@192.168.1.29:/home/wenjun/
scp deploy/install.sh wenjun@192.168.1.29:/home/wenjun/

# 3. 登录服务器执行安装
ssh wenjun@192.168.1.29
chmod +x install.sh
./install.sh

# 4. 上传 Cookie
scp ~/.dagegong-cli/cookies.json wenjun@192.168.1.29:~/.dagegong-cli/

# 5. 启动服务
sudo systemctl enable dagegong-scheduler
sudo systemctl start dagegong-scheduler
```

## 常用命令

```bash
# 快捷投递
node bin/cli.mjs apply "运维开发" --limit 100

# 带飞书通知的投递
node bin/cli.mjs apply "运维开发" --limit 100 --feishu "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx"

# 查看今日统计
node bin/cli.mjs stats --today

# 查看最近 7 天统计
node bin/cli.mjs stats --recent 7

# 启动定时任务
node bin/cli.mjs schedule --feishu "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx"
```

## 飞书命令触发（OpenClaw）

配置 OpenClaw 技能后，可在飞书发送：

- `帮我投递100封简历关于运维开发的`
- `投递50个前端开发职位`
- `查看今日投递情况`
- `今天投递了多少`

## 故障排查

### 问题：Cookie 无效
```bash
# 检查 Cookie 文件
ls -la ~/.dagegong-cli/cookies.json

# 重新导出 Cookie 并上传
```

### 问题：浏览器启动失败
```bash
# 服务器需要安装 Chrome/Chromium
sudo apt-get install chromium-browser

# 或设置 Puppeteer 使用系统 Chrome
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### 问题：服务启动失败
```bash
# 查看服务状态
sudo systemctl status dagegong-scheduler

# 查看日志
sudo journalctl -u dagegong-scheduler -f
```

## 文件位置速查

| 文件 | 本地路径 | 服务器路径 |
|-----|---------|-----------|
| Cookie | `~/.dagegong-cli/cookies.json` | `/home/wenjun/.dagegong-cli/cookies.json` |
| 配置 | `~/.dagegong-cli/config.json` | `/home/wenjun/.dagegong-cli/config.json` |
| 统计 | `~/.dagegong-cli/stats-*.json` | `/home/wenjun/.dagegong-cli/stats-*.json` |
| 应用 | `packages/dagegong-cli/` | `/home/wenjun/dagegong-cli/` |
