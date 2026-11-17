<#
.SYNOPSIS
    一键停止 Nginx + Tomcat 双节点集群演示环境。
.DESCRIPTION
    1. 停止 Nginx；
    2. 通过 shutdown.bat 优雅关闭 tomcat1 / tomcat2；
    3. 若端口仍被占用，则强制结束对应进程兜底。
.PARAMETER JavaHome
    JDK 目录。不传时读取环境变量 JAVA_HOME，仍未设置则尝试常见安装路径。
.EXAMPLE
    .\stop-all.ps1
#>
param(
    [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------- 定位 JDK（shutdown.bat 依赖 java） ----------
if (-not $JavaHome) {
    foreach ($candidate in @('C:\Program Files\Java\jdk-17', 'C:\Program Files\Java\jdk1.8.0_202')) {
        if (Test-Path $candidate) { $JavaHome = $candidate; break }
    }
}
if ($JavaHome -and (Test-Path $JavaHome)) {
    $env:JAVA_HOME = $JavaHome
} else {
    Write-Host '[WARN] 未找到 JDK，将跳过优雅关闭并直接按端口清理进程' -ForegroundColor Yellow
}

function Test-Port {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if ($task.Wait(500)) { return $client.Connected }
        return $false
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-PortClosed {
    param([int]$Port, [int]$TimeoutSeconds = 15)
    for ($i = 0; $i -lt ($TimeoutSeconds * 2); $i++) {
        if (-not (Test-Port $Port)) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ---------- 停止 Nginx ----------
$nginxDir = Join-Path $base 'nginx'
$nginxExe = Join-Path $nginxDir 'nginx.exe'
if ((Test-Port 80) -and (Test-Path $nginxExe)) {
    Start-Process -FilePath $nginxExe -ArgumentList '-s', 'stop' -WorkingDirectory $nginxDir -WindowStyle Hidden
    Start-Sleep -Seconds 1
}
$nginxProcs = Get-Process -Name nginx -ErrorAction SilentlyContinue
if ($nginxProcs) {
    $nginxProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host '[STOP] Nginx（已强制结束残留进程）' -ForegroundColor Green
} else {
    Write-Host '[INFO] Nginx 未在运行'
}

# ---------- 停止 Tomcat ----------
foreach ($name in @('tomcat1', 'tomcat2')) {
    $dir = Join-Path $base $name
    $bat = Join-Path $dir 'bin\shutdown.bat'
    if ((-not (Test-Port 8080)) -and (-not (Test-Port 8081))) {
        Write-Host '[INFO] Tomcat 节点未在运行'
        break
    }
    if (Test-Path $bat) {
        Start-Process -FilePath $bat -WorkingDirectory $dir -WindowStyle Hidden -Wait
        Write-Host "[STOP] $name 已发送停止指令"
    } else {
        Write-Host "[WARN] 缺少 $bat，跳过优雅关闭" -ForegroundColor Yellow
    }
}

foreach ($node in @(@{ Name = 'tomcat1'; Port = 8080 }, @{ Name = 'tomcat2'; Port = 8081 })) {
    if (Wait-PortClosed $node.Port 15) {
        Write-Host "[OK] $($node.Name) 已停止（端口 $($node.Port) 已释放）" -ForegroundColor Green
        continue
    }
    $connections = Get-NetTCPConnection -LocalPort $node.Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "[OK] $($node.Name) 已停止" -ForegroundColor Green
        continue
    }
    foreach ($conn in $connections) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "[KILL] $($node.Name) 端口 $($node.Port) 仍被占用，已结束 $($proc.ProcessName)（PID $($proc.Id)）" -ForegroundColor Yellow
        }
    }
}

Write-Host ''
Write-Host '集群已停止。'
