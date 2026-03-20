@echo off
chcp 65001 >nul
echo ==========================================
echo  打个工 - 新构建测试（绝对路径）
echo ==========================================
echo.

REM 使用绝对路径，确保运行的是新构建的版本
set "APP_PATH=C:\Users\hswei\dagegong\packages\ui\dist\win-unpacked\dagegong.exe"

echo 应用程序路径: %APP_PATH%
echo.

if not exist "%APP_PATH%" (
    echo 错误: 找不到应用程序！
    echo 请确认已运行 pnpm run build:win
    pause
    exit /b 1
)

echo [OK] 应用程序存在
echo.

REM 设置调试环境变量
set DAGEGONG_DISABLE_GPU=1
set DAGEGONG_ENABLE_LOG_TO_FILE=1
set ELECTRON_ENABLE_LOGGING=1

echo 启动应用...
echo 如果窗口正常显示，说明修复成功！
echo.
echo ------------------------------------------

"%APP_PATH%" --enable-logging --v=1 2>&1

echo.
echo ------------------------------------------
echo 应用已退出，退出代码: %ERRORLEVEL%
echo.

REM 检查日志
set "LOG_PATH=%USERPROFILE%\.dagegong\log\log.log"
if exist "%LOG_PATH%" (
    echo.
    echo 日志内容（最后20行）:
    echo ------------------------------------------
    type "%LOG_PATH%" 2^>nul | more +1 | findstr /n "^" | findstr /r "^.*:.*" | tail -20
    echo ------------------------------------------
) else (
    echo 日志文件未生成
)

echo.
pause
