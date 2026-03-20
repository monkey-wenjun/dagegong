@echo off
cd /d "C:\Users\hswei\dagegong\packages\ui\dist\win-unpacked"
set DAGEGONG_DISABLE_GPU=1
dagegong.exe 2>&1
pause
