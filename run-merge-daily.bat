@echo off
REM ============================================================
REM 每日合并脚本 - 手动运行入口
REM 双击运行即可；也可以在 cmd 里执行
REM ============================================================
chcp 65001 > nul
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS1_FILE=%SCRIPT_DIR%merge-daily.ps1"

if not exist "%PS1_FILE%" (
    echo [ERROR] 找不到 merge-daily.ps1
    echo        请确认脚本与本 bat 在同一目录
    pause
    exit /b 1
)

echo ==================================================
echo  每日自动合并脚本 - 手动执行
echo  执行时间: %date% %time%
echo ==================================================
echo.

REM 先解锁 PowerShell 执行策略（当前用户即可，不需要管理员）
powershell.exe -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" 2>nul

REM 执行合并脚本
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo ==================================================
echo  脚本退出码: %EXIT_CODE%
echo  按任意键关闭...
echo ==================================================
pause >nul
endlocal
