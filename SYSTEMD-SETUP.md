# Dagegong Systemd 自动启动配置

## 快速安装

### 1. 上传安装脚本到服务器

```bash
# 在本地执行
scp scripts/install-systemd-services.sh wenjun@192.168.1.29:/tmp/
```

### 2. 登录服务器并执行安装

```bash
ssh wenjun@192.168.1.29

# 使用 sudo 执行安装
sudo bash /tmp/install-systemd-services.sh
```

---

## 手动安装（如果自动脚本失败）

### 第一步：创建 AI 守护进程服务

```bash
sudo tee /etc/systemd/system/dagegong-ai-daemon.service > /dev/null << 'EOF'
[Unit]
Description=Dagegong AI Auto-Reply Daemon
After=network-online.target

[Service]
Type=simple
User=wenjun
Group=wenjun
WorkingDirectory=/home/wenjun/dagegong-app/packages/dagegong-cli
Environment="NVM_DIR=/home/wenjun/.nvm"
Environment="NODE_VERSION=22"
ExecStart=/bin/bash -c 'source $NVM_DIR/nvm.sh && nvm use $NODE_VERSION && exec node src/ai-auto-reply-daemon.mjs --daemon'
Restart=always
RestartSec=10
StandardOutput=append:/home/wenjun/.dagegong-cli/logs/ai-daemon-systemd.log
StandardError=append:/home/wenjun/.dagegong-cli/logs/ai-daemon-systemd.log

[Install]
WantedBy=multi-user.target
EOF
```

### 第二步：创建投递定时器

```bash
# 创建定时器配置
sudo tee /etc/systemd/system/dagegong-apply.timer > /dev/null << 'EOF'
[Unit]
Description=Dagegong Job Apply Timer

[Timer]
OnCalendar=*-*-* 07:00..21:00:00/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

# 创建投递服务
sudo tee /etc/systemd/system/dagegong-apply.service > /dev/null << 'EOF'
[Unit]
Description=Dagegong Job Apply Service

[Service]
Type=oneshot
User=wenjun
Group=wenjun
WorkingDirectory=/home/wenjun/dagegong-app/packages/dagegong-cli
Environment="NVM_DIR=/home/wenjun/.nvm"
Environment="NODE_VERSION=22"
ExecStart=/bin/bash -c 'source $NVM_DIR/nvm.sh && nvm use $NODE_VERSION && (pgrep -f "cli.mjs run" > /dev/null || node bin/cli.mjs run --headless)'
StandardOutput=append:/home/wenjun/.dagegong-cli/logs/apply-service.log
StandardError=append:/home/wenjun/.dagegong-cli/logs/apply-service.log
EOF
```

### 第三步：启用并启动服务

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用开机自启
sudo systemctl enable dagegong-ai-daemon.service
sudo systemctl enable dagegong-apply.timer

# 立即启动
sudo systemctl start dagegong-ai-daemon.service
sudo systemctl start dagegong-apply.timer
```

---

## 管理命令

### AI 守护进程

```bash
# 查看状态
sudo systemctl status dagegong-ai-daemon

# 启动/停止/重启
sudo systemctl start dagegong-ai-daemon
sudo systemctl stop dagegong-ai-daemon
sudo systemctl restart dagegong-ai-daemon

# 查看日志
sudo journalctl -u dagegong-ai-daemon -f
tail -f ~/.dagegong-cli/logs/ai-daemon-systemd.log
```

### 投递服务

```bash
# 查看定时器状态
sudo systemctl status dagegong-apply.timer
sudo systemctl list-timers dagegong-apply

# 手动触发投递
sudo systemctl start dagegong-apply.service

# 查看投递日志
tail -f ~/.dagegong-cli/logs/apply-service.log
```

---

## 自启动配置说明

### 已配置的自启动服务

| 服务名 | 说明 | 运行时间 |
|--------|------|----------|
| `dagegong-ai-daemon` | AI 自动回复守护进程 | 开机自动启动，持续运行 |
| `dagegong-apply.timer` | 投递定时器 | 7:00-21:00 每5分钟检查 |
| `dagegong-apply.service` | 投递服务 | 由定时器触发 |

### 定时规则

- **AI 守护进程**: 系统启动时自动启动，运行一直运行
- **投递任务**: 每天 7:00-21:00，每5分钟检查一次
  - 如果已有投递进程在运行，则跳过
  - 如果未运行且在时间窗内，则启动投递

---

## 排查问题

### 检查服务状态

```bash
# 所有 Dagegong 服务
sudo systemctl list-units | grep dagegong

# 详细状态
sudo systemctl status dagegong-ai-daemon
sudo systemctl status dagegong-apply.timer
```

### 查看日志

```bash
# 系统日志
sudo journalctl -u dagegong-ai-daemon --since "1 hour ago"
sudo journalctl -u dagegong-apply.service --since "1 hour ago"

# 应用日志
tail -f ~/.dagegong-cli/logs/ai-daemon-systemd.log
tail -f ~/.dagegong-cli/logs/apply-service.log
tail -f ~/.dagegong-cli/logs/ai-auto-reply.log
```

### 重新安装

```bash
# 停止服务
sudo systemctl stop dagegong-ai-daemon
sudo systemctl stop dagegong-apply.timer

# 禁用开机自启
sudo systemctl disable dagegong-ai-daemon
sudo systemctl disable dagegong-apply.timer

# 重新执行安装脚本
sudo bash /tmp/install-systemd-services.sh
```
