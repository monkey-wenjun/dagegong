# 查找系统中的 dagegong.exe
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  打个工 - 应用位置查找器" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 常见安装路径
$commonPaths = @(
    "C:\Program Files\打个工\dagegong.exe"
    "C:\Program Files (x86)\打个工\dagegong.exe"
    "$env:LOCALAPPDATA\打个工\dagegong.exe"
    "$env:APPDATA\打个工\dagegong.exe"
    "$env:USERPROFILE\AppData\Local\打个工\dagegong.exe"
    "$env:USERPROFILE\AppData\Roaming\打个工\dagegong.exe"
)

Write-Host "[1/3] 检查常见安装位置..." -ForegroundColor Yellow
$found = $false
foreach ($path in $commonPaths) {
    if (Test-Path $path) {
        Write-Host "  [✓] 找到: $path" -ForegroundColor Green
        $found = $true
        $foundPath = $path
    } else {
        Write-Host "  [✗] 未找到: $path" -ForegroundColor Gray
    }
}

if (-not $found) {
    Write-Host ""
    Write-Host "[2/3] 在 C:\ 全盘搜索（可能需要几分钟）..." -ForegroundColor Yellow
    $results = Get-ChildItem -Path C:\ -Filter "dagegong.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5
    
    if ($results) {
        Write-Host "  找到以下位置:" -ForegroundColor Green
        foreach ($result in $results) {
            Write-Host "    - $($result.FullName)" -ForegroundColor Green
            $foundPath = $result.FullName
        }
        $found = $true
    } else {
        Write-Host "  未找到 dagegong.exe" -ForegroundColor Red
    }
}

# 检查当前项目构建目录
Write-Host ""
Write-Host "[3/3] 检查项目构建目录..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $scriptDir "..\.."
$portablePath = Join-Path $projectRoot "packages\ui\dist\win-unpacked\dagegong.exe"

if (Test-Path $portablePath) {
    Write-Host "  [✓] 找到便携版: $portablePath" -ForegroundColor Green
    $portableFound = $true
} else {
    Write-Host "  [✗] 未找到便携版" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan

if ($found -or $portableFound) {
    Write-Host "启动选项:" -ForegroundColor Yellow
    Write-Host ""
    
    if ($found) {
        Write-Host "1. 启动已安装的版本" -ForegroundColor White
        Write-Host "   路径: $foundPath" -ForegroundColor Gray
        Write-Host ""
    }
    
    if ($portableFound) {
        Write-Host "2. 启动便携版（无需安装）" -ForegroundColor White
        Write-Host "   路径: $portablePath" -ForegroundColor Gray
        Write-Host ""
    }
    
    $choice = Read-Host "请选择 (1 或 2，直接回车取消)"
    
    if ($choice -eq "1" -and $found) {
        $exePath = $foundPath
    } elseif ($choice -eq "2" -and $portableFound) {
        $exePath = $portablePath
    } else {
        Write-Host "取消启动" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Host "启动应用: $exePath" -ForegroundColor Green
    Write-Host ""
    
    # 设置环境变量
    $env:DAGEGONG_ENABLE_LOG_TO_FILE = "1"
    $env:DAGEGONG_DISABLE_GPU = "1"
    $env:ELECTRON_ENABLE_LOGGING = "1"
    
    # 启动应用并捕获输出
    $process = Start-Process -FilePath $exePath -ArgumentList "--enable-logging", "--v=1", "--disable-gpu" -PassThru -NoNewWindow -Wait
    
    Write-Host ""
    Write-Host "应用已退出，退出代码: $($process.ExitCode)" -ForegroundColor Yellow
    
    # 检查日志
    $logPath = "$env:USERPROFILE\.dagegong\log\log.log"
    if (Test-Path $logPath) {
        Write-Host ""
        Write-Host "日志内容（最后20行）:" -ForegroundColor Cyan
        Write-Host "------------------------------------------" -ForegroundColor Gray
        Get-Content $logPath -Tail 20 | ForEach-Object { Write-Host $_ }
        Write-Host "------------------------------------------" -ForegroundColor Gray
    }
    
} else {
    Write-Host "未找到任何可用的 dagegong.exe" -ForegroundColor Red
    Write-Host ""
    Write-Host "请尝试以下操作:" -ForegroundColor Yellow
    Write-Host "1. 重新安装应用" -ForegroundColor White
    Write-Host "2. 或运行构建命令:" -ForegroundColor White
    Write-Host "   cd packages\ui" -ForegroundColor Gray
    Write-Host "   pnpm run build:win" -ForegroundColor Gray
}

Write-Host ""
Read-Host "按回车键退出"
