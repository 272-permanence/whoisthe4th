@echo off
REM ============================================================
REM 一键安装 Windows 计划任务：每晚 22:00 执行合并脚本
REM 双击运行即可（需要管理员权限或当前用户足够权限）
REM ============================================================
chcp 65001 > nul
setlocal

set "TASK_NAME=DailyRepoMerge"
set "SCRIPT_DIR=%~dp0"
set "BAT_FILE=%SCRIPT_DIR%run-merge-daily.bat"
set "PS1_FILE=%SCRIPT_DIR%merge-daily.ps1"

echo ==================================================
echo  安装 Windows 计划任务: %TASK_NAME%
echo  执行时间: 每天 22:00 (晚上10点)
echo  脚本路径: %BAT_FILE%
echo ==================================================
echo.

REM 检查文件是否存在
if not exist "%PS1_FILE%" (
    echo [ERROR] 找不到 merge-daily.ps1
    pause
    exit /b 1
)

REM 先解锁 PowerShell 执行策略
powershell.exe -NoProfile -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force" 2>nul

REM 删除旧任务（如果存在）
schtasks /Delete /TN "%TASK_NAME%" /F 2>nul

REM 创建计划任务（每晚 22:00 运行，只运行一次就算任务没结束也不会并发）
schtasks /Create ^
    /TN "%TASK_NAME%" ^
    /TR "\"%BAT_FILE%\"" ^
    /SC DAILY ^
    /ST 22:00 ^
    /RL LIMITED ^
    /F

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==================================================
    echo  ✅ 计划任务安装成功!
    echo.
    echo  任务名: %TASK_NAME%
    echo  触发:   每天 22:00
    echo  运行:   %BAT_FILE%
    echo.
    echo  管理方式:
    echo    - 查看状态: schtasks /Query /TN "%TASK_NAME%"
    echo    - 手动运行: schtasks /Run   /TN "%TASK_NAME%"
    echo    - 禁用任务: schtasks /Change /TN "%TASK_NAME%" /DISABLE
    echo    - 启用任务: schtasks /Change /TN "%TASK_NAME%" /ENABLE
    echo    - 删除任务: schtasks /Delete /TN "%TASK_NAME%" /F
    echo.
    echo  也可以打开 "任务计划程序" (taskschd.msc) 查看
    echo ==================================================
) else (
    echo.
    echo [ERROR] 创建失败，请用管理员身份运行本文件
)

echo.
pause
endlocal
