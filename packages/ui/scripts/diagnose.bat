@echo off
chcp 65001 >nul
echo ==========================================
echo  打个工 - 诊断脚本
echo ==========================================
echo.

REM 设置调试环境变量
set DAGEGONG_ENABLE_LOG_TO_FILE=1
set DAGEGONG_DISABLE_GPU=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

REM 获取安装目录
set "INSTALL_DIR=C:\Program Files\打个工"

echo [1/5] 检查安装目录...
if not exist "%INSTALL_DIR%" (
    echo 错误: 安装目录不存在: %INSTALL_DIR%
    echo 请确认应用已正确安装
    pause
    exit /b 1
)
echo 安装目录: %INSTALL_DIR%
dir "%INSTALL_DIR%" /b
echo.

echo [2/5] 检查可执行文件...
if not exist "%INSTALL_DIR%\dagegong.exe" (
    echo 错误: 找不到 dagegong.exe
    pause
    exit /b 1
)
echo 可执行文件存在
echo.

echo [3/5] 检查资源文件...
if not exist "%INSTALL_DIR%\resources\app.asar" (
    echo 警告: 找不到 app.asar
) else (
    echo app.asar 存在
)
if not exist "%INSTALL_DIR%\resources\app.asar.unpacked" (
    echo 警告: 找不到 app.asar.unpacked
) else (
    echo app.asar.unpacked 存在
)
echo.

echo [4/5] 检查日志目录...
set "LOG_DIR=%USERPROFILE%\.dagegong\log"
if not exist "%LOG_DIR%" (
    echo 创建日志目录: %LOG_DIR%
    mkdir "%LOG_DIR%" 2>nul
)
echo 日志目录: %LOG_DIR%
echo.

echo [5/5] 启动应用并捕获错误...
echo 正在启动应用，请观察是否有错误信息...
echo.
cd /d "%INSTALL_DIR%"

REM 使用 cmd /k 来保持窗口打开
echo 启动命令: dagegong.exe --enable-logging --v=1
echo.
start cmd /k "dagegong.exe --enable-logging --v=1 2>&1"

echo.
echo 应用已在新窗口中启动。
echo 如果应用崩溃，请查看新窗口中的错误信息。
echo.
echo 等待 5 秒后检查日志文件...
timeout /t 5 /nobreak >nul

echo.
echo 日志文件内容（最近20行）:
echo ------------------------------------------
if exist "%LOG_DIR%\log.log" (
    type "%LOG_DIR%\log.log" | findstr /n "." | findstr "^[^:]*:[0-9]*:" | tail -20
) else (
    echo 日志文件不存在
)
echo ------------------------------------------
echo.
pause
