@echo off
chcp 65001 >nul
echo ==========================================
echo  打个工 - 最终测试（已修复版本）
echo ==========================================
echo.

set "APP=C:\Users\hswei\dagegong\packages\ui\dist\win-unpacked\dagegong.exe"

if not exist "%APP%" (
    echo 错误: 找不到应用程序
    pause
    exit /b 1
)

echo 启动: %APP%
echo.

set DAGEGONG_DISABLE_GPU=1
set DAGEGONG_ENABLE_LOG_TO_FILE=1

"%APP%" 2>&1

echo.
echo 退出代码: %ERRORLEVEL%

if %ERRORLEVEL% equ 0 (
    echo ✓ 应用正常退出
) else (
    echo ✗ 应用异常退出
)

pause
