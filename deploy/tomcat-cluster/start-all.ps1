<#
.SYNOPSIS
    一键启动 Tomcat 双节点 + Nginx 集群演示环境。
.DESCRIPTION
    1. 校验 JAVA_HOME（可用 -JavaHome 覆盖）；
    2. 依次启动 tomcat1(8080)、tomcat2(8081)；
    3. 启动 Nginx(80) 并验证轮询入口。
.PARAMETER JavaHome
    JDK 目录。不传时读取环境变量 JAVA_HOME，仍未设置则尝试常见安装路径。
.EXAMPLE
    .\start-all.ps1
.EXAMPLE
    .\start-all.ps1 -JavaHome "C:\Program Files\Java\jdk-17"
#>
param(
    [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------- 定位 JDK ----------
if (-not $JavaHome) {
    foreach ($candidate in @('C:\Program Files\Java\jdk-17', 'C:\Program Files\Java\jdk1.8.0_202')) {
        if (Test-Path $candidate) { $JavaHome = $candidate; break }
    }
}
if (-not $JavaHome -or -not (Test-Path $JavaHome)) {
    Write-Host '[ERROR] 未找到 JDK，请设置 JAVA_HOME 或使用 -JavaHome 指定' -ForegroundColor Red
    exit 1
}
$env:JAVA_HOME = $JavaHome
Write-Host "[INFO] JAVA_HOME = $JavaHome"

# ---------- 工具函数 ----------
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

function Wait-Port {
    param([int]$Port, [int]$TimeoutSeconds = 20)
    for ($i = 0; $i -lt ($TimeoutSeconds * 2); $i++) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ---------- 启动 Tomcat ----------
$nodes = @(
    @{ Name = 'tomcat1'; Port = 8080 },
    @{ Name = 'tomcat2'; Port = 8081 }
)

foreach ($node in $nodes) {
    if (Test-Port $node.Port) {
        Write-Host "[SKIP] $($node.Name) 已在监听 $($node.Port)" -ForegroundColor Yellow
        continue
    }
    $dir = Join-Path $base $node.Name
    $bat = Join-Path $dir 'bin\catalina.bat'
    if (-not (Test-Path $bat)) {
        Write-Host "[ERROR] 缺少 $bat" -ForegroundColor Red
        exit 1
    }
    Start-Process -FilePath $bat -ArgumentList 'run' -WorkingDirectory $dir -WindowStyle Minimized
    Write-Host "[START] $($node.Name)（窗口已最小化，日志见 $($node.Name)\logs）"
}

foreach ($node in $nodes) {
    if (Wait-Port $node.Port) {
        Write-Host "[OK] $($node.Name) 监听 $($node.Port)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] $($node.Name) 未在 20 秒内监听 $($node.Port)，请检查 $($node.Name)\logs" -ForegroundColor Yellow
    }
}

# ---------- 启动 Nginx ----------
$nginxDir = Join-Path $base 'nginx'
$nginxExe = Join-Path $nginxDir 'nginx.exe'
if (Test-Port 80) {
    if (Get-Process -Name nginx -ErrorAction SilentlyContinue) {
        Write-Host '[SKIP] Nginx 已在监听 80' -ForegroundColor Yellow
    } else {
        Write-Host '[WARN] 端口 80 被其他程序占用（如 Apache/IIS），Nginx 无法启动，请释放 80 后重试' -ForegroundColor Yellow
    }
} else {
    if (-not (Test-Path $nginxExe)) {
        Write-Host "[ERROR] 缺少 $nginxExe" -ForegroundColor Red
        exit 1
    }
    # Nginx Windows 包缺少 temp 目录时启动会失败，这里先补齐
    New-Item -ItemType Directory -Force -Path (Join-Path $nginxDir 'temp') | Out-Null
    Start-Process -FilePath $nginxExe -WorkingDirectory $nginxDir -WindowStyle Hidden
    if (Wait-Port 80 10) {
        Write-Host '[OK] Nginx 监听 80' -ForegroundColor Green
    } else {
        Write-Host '[WARN] Nginx 未能在 10 秒内监听 80，请检查 nginx\logs\error.log' -ForegroundColor Yellow
    }
}

# ---------- 输出入口 ----------
Write-Host ''
Write-Host '集群已启动：'
Write-Host '  轮询入口   http://localhost/'
Write-Host '  固定节点   http://localhost/n1/   http://localhost/n2/'
Write-Host '  直连节点   http://localhost:8080/   http://localhost:8081/'
