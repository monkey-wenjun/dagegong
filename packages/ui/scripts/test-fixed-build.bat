@echo off
chcp 65001 >nul
echo ==========================================
echo  打个工 - 修复版测试
echo ==========================================
echo.

cd /d "%~dp0\..\dist\win-unpacked"

echo 启动路径: %CD%\dagegong.exe
echo.

set DAGEGONG_DISABLE_GPU=1
set DAGEGONG_ENABLE_LOG_TO_FILE=1

echo 正在启动...（请等待窗口出现）
echo.

dagegong.exe 2>&1

echo.
echo 应用已退出，代码: %ERRORLEVEL%
echo.

set "LOG=%USERPROFILE%\.dagegong\log\log.log"
if exist "%LOG%" (
    echo 日志最后10行:
    echo ------------------------------------------
    type "%LOG%" 2^>nul | findstr /n "^" | findstr /r "^.*:.*" | tail -10
    echo ------------------------------------------
)

echo.
pause
