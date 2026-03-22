#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Dagegong CLI 远程部署脚本
    
.DESCRIPTION
    将 Dagegong CLI 打包并上传到远程服务器部署
    
.PARAMETER Server
    服务器地址，默认 192.168.1.29
    
.PARAMETER User
    SSH 用户名，默认 wenjun
    
.PARAMETER Port
    SSH 端口，默认 22
    
.PARAMETER FeishuWebhook
    飞书 Webhook URL（可选）
#>

param(
    [string]$Server = "192.168.1.29",
    [string]$User = "wenjun",
    [int]$Port = 22,
    [string]$FeishuWebhook = ""
)

$ErrorActionPreference = "Stop"

$DeployDir = "deploy"
$PackageName = "dagegong-cli.tar.gz"
$RemotePath = "/home/wenjun"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🔥 Dagegong CLI 远程部署脚本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 部署信息:" -ForegroundColor Yellow
Write-Host "  服务器: $Server`:$Port"
Write-Host "  用户: $User"
Write-Host "  远程路径: $RemotePath"
if ($FeishuWebhook) {
    Write-Host "  飞书通知: 已配置"
} else {
    Write-Host "  飞书通知: 未配置"
}
Write-Host ""

# 1. 检查 SSH 连接
Write-Host "🔍 检查 SSH 连接..." -ForegroundColor Yellow
try {
    $sshTest = ssh -o ConnectTimeout=5 -p $Port "${User}@${Server}" "echo 'SSH OK'" 2>&1
    if ($sshTest -notmatch "SSH OK") {
        throw "SSH 连接失败"
    }
    Write-Host "  ✓ SSH 连接正常" -ForegroundColor Green
} catch {
    Write-Host "  ❌ SSH 连接失败，请检查:" -ForegroundColor Red
    Write-Host "     - 服务器地址和端口是否正确"
    Write-Host "     - SSH 密钥是否已配置"
    Write-Host "     - 网络连接是否正常"
    exit 1
}

# 2. 打包应用
Write-Host ""
Write-Host "📦 步骤 1/4: 打包应用..." -ForegroundColor Yellow

# 创建临时打包目录
$TempDir = "deploy-temp-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# 复制必要文件
Copy-Item -Path "packages/dagegong-cli/bin" -Destination "$TempDir/bin" -Recurse -Force
Copy-Item -Path "packages/dagegong-cli/src" -Destination "$TempDir/src" -Recurse -Force
Copy-Item -Path "packages/dagegong-cli/package.json" -Destination "$TempDir/package.json" -Force

# 复制 workspace 依赖
Copy-Item -Path "packages/utils" -Destination "$TempDir/packages/utils" -Recurse -Force

# 修改 package.json 移除 workspace 依赖
$pkg = Get-Content "$TempDir/package.json" | ConvertFrom-Json
$pkg.dependencies.PSObject.Properties.Remove("@dagegong/utils")
$pkg.dependencies | Add-Member -NotePropertyName "openai" -NotePropertyValue "^4.91.1"
$pkg | ConvertTo-Json -Depth 10 | Set-Content "$TempDir/package.json"

# 创建 tar.gz 包
if (Test-Path "$DeployDir/$PackageName") {
    Remove-Item "$DeployDir/$PackageName" -Force
}

# 使用 tar 命令打包 (Windows 10 1803+ 内置 tar)
Push-Location $TempDir
tar -czf "../$DeployDir/$PackageName" .
Pop-Location

# 清理临时目录
Remove-Item -Recurse -Force $TempDir

if (Test-Path "$DeployDir/$PackageName") {
    $size = (Get-Item "$DeployDir/$PackageName").Length / 1MB
    Write-Host "  ✓ 打包完成: $PackageName ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ❌ 打包失败" -ForegroundColor Red
    exit 1
}

# 3. 上传文件
Write-Host ""
Write-Host "📤 步骤 2/4: 上传文件到服务器..." -ForegroundColor Yellow

# 上传部署包
scp -P $Port "$DeployDir/$PackageName" "${User}@${Server}:${RemotePath}/"
Write-Host "  ✓ 部署包已上传" -ForegroundColor Green

# 上传安装脚本
scp -P $Port "$DeployDir/install.sh" "${User}@${Server}:${RemotePath}/"
Write-Host "  ✓ 安装脚本已上传" -ForegroundColor Green

# 4. 执行远程安装
Write-Host ""
Write-Host "🔧 步骤 3/4: 执行远程安装..." -ForegroundColor Yellow

$envVars = ""
if ($FeishuWebhook) {
    $envVars = "export FEISHU_WEBHOOK='$FeishuWebhook' && "
}

$remoteCommand = @"
cd $RemotePath && 
chmod +x install.sh && 
$envVars ./install.sh 2>&1
"@

ssh -p $Port "${User}@${Server}" $remoteCommand

# 5. 验证安装
Write-Host ""
Write-Host "✅ 步骤 4/4: 验证安装..." -ForegroundColor Yellow

$verifyCommand = @"
if [ -f "$RemotePath/dagegong-cli/bin/cli.mjs" ]; then
    echo "INSTALL_SUCCESS"
    cd $RemotePath/dagegong-cli && node bin/cli.mjs --version
else
    echo "INSTALL_FAILED"
fi
"@

$verifyResult = ssh -p $Port "${User}@${Server}" $verifyCommand

if ($verifyResult -match "INSTALL_SUCCESS") {
    Write-Host "  ✓ 安装验证通过" -ForegroundColor Green
} else {
    Write-Host "  ⚠️ 安装可能未完全成功，请检查服务器日志" -ForegroundColor Yellow
}

# 清理本地部署包
Remove-Item "$DeployDir/$PackageName" -Force

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🎉 部署完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 后续步骤:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 上传 Cookie 文件到服务器:" -ForegroundColor White
Write-Host "   scp -P $Port ~/.dagegong-cli/cookies.json ${User}@${Server}:~/.dagegong-cli/" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 登录服务器启动服务:" -ForegroundColor White
Write-Host "   ssh -p $Port ${User}@${Server}" -ForegroundColor Gray
Write-Host "   sudo systemctl enable dagegong-scheduler" -ForegroundColor Gray
Write-Host "   sudo systemctl start dagegong-scheduler" -ForegroundColor Gray
Write-Host ""
Write-Host "3. 查看服务状态:" -ForegroundColor White
Write-Host "   sudo systemctl status dagegong-scheduler" -ForegroundColor Gray
Write-Host "   sudo journalctl -u dagegong-scheduler -f" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 手动运行投递任务:" -ForegroundColor White
Write-Host "   ssh -p $Port ${User}@${Server} 'cd ~/dagegong-cli && node bin/cli.mjs apply \"运维开发\" --limit 100'" -ForegroundColor Gray
Write-Host ""
