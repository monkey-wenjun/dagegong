# 快速测试脚本
$appPath = "C:\Users\hswei\dagegong\packages\ui\dist\win-unpacked\dagegong.exe"

if (-not (Test-Path $appPath)) {
    Write-Host "错误: 找不到 $appPath" -ForegroundColor Red
    exit 1
}

Write-Host "启动应用: $appPath" -ForegroundColor Green

# 设置环境变量
$env:DAGEGONG_ENABLE_LOG_TO_FILE = "1"
$env:DAGEGONG_DISABLE_GPU = "1"
$env:ELECTRON_ENABLE_LOGGING = "1"

# 启动应用
& $appPath --enable-logging --v=1 --disable-gpu

Write-Host "`n应用已退出，退出代码: $LASTEXITCODE" -ForegroundColor Yellow

# 显示日志
$logPath = "$env:USERPROFILE\.dagegong\log\log.log"
if (Test-Path $logPath) {
    Write-Host "`n日志内容（最后30行）:" -ForegroundColor Cyan
    Get-Content $logPath -Tail 30
}

Read-Host "`n按回车键退出"
