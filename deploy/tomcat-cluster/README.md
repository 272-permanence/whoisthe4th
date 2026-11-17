# Tomcat 集群部署环境

Nginx 反向代理 + 双 Tomcat 节点轮询负载均衡。前端生产构建产物部署到两个节点的 `webapps/ROOT`，`/api` 由 Nginx 反向代理到 Node 后端（8000）。

## 目录结构

```
tomcat-cluster/
├── tomcat1/          Tomcat 9.0.123 节点 1（HTTP 8080，jvmRoute=tomcat1）
├── tomcat2/          Tomcat 9.0.123 节点 2（HTTP 8081，jvmRoute=tomcat2）
├── nginx/            Nginx 1.29.8 统一入口（HTTP 80，upstream 轮询两个节点）
└── webapp/           部署模板（WEB-INF/web.xml，404 回退 index.html）
```

## 端口占用

| 端口 | 用途 |
| --- | --- |
| 80 | Nginx 统一入口（轮询 8080 / 8081） |
| 8080 | Tomcat 节点 1 |
| 8081 | Tomcat 节点 2 |
| 8005 | Tomcat 节点 1 shutdown 端口 |
| 8006 | Tomcat 节点 2 shutdown 端口 |

若以上端口被占用，需同步修改 `tomcat2/conf/server.xml` 与 `nginx/conf/nginx.conf` 中的端口号。

## 前提

- JDK 17（`set JAVA_HOME` 指向本机 JDK 目录，例如 `C:\Program Files\Java\jdk-17`）
- Windows PowerShell
- 后端已在 `http://localhost:8000` 运行

## 部署前端到集群

```powershell
$root = "<仓库根目录>"
$base = "$root\deploy\tomcat-cluster"

Push-Location "$root\frontend"
npm run build
Pop-Location

foreach ($n in 1,2) {
  $webroot = "$base\tomcat$n\webapps\ROOT"
  Get-ChildItem $webroot -Force | Remove-Item -Recurse -Force
  Copy-Item "dist\*" $webroot -Recurse -Force
  Copy-Item "$base\webapp\*" $webroot -Recurse -Force
  Set-Content "$webroot\node-id.txt" "Tomcat Node $n" -Encoding ASCII
}
```

- 两个节点各持有一份完整前端资源，Nginx 轮询分发。
- Nginx 对 `/assets/` 不做回退，静态资源缺失会返回 404；其余未命中的前端路由回退到 `index.html`，支持 `/pois` 等路径直接刷新。
- 前端使用同源 API（`frontend/.env.production` 中 `VITE_API_BASE_URL=` 留空），跨域会导致接口失败。
- 每次前端改动后重新 `npm run build` 并重复上述复制步骤。

## 启动

在仓库根目录执行（把 `<仓库根目录>` 换成你本机的实际路径）：

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$base = "<仓库根目录>\deploy\tomcat-cluster"

# 两个 Tomcat 节点（各开一个终端窗口保持运行）
& "$base\tomcat1\bin\catalina.bat" run
& "$base\tomcat2\bin\catalina.bat" run

# Nginx
Start-Process "$base\nginx\nginx.exe" -WorkingDirectory "$base\nginx"
```

## 一键启停（推荐）

```powershell
# 启动：默认读取环境变量 JAVA_HOME
.\start-all.ps1

# 指定 JDK 目录启动
.\start-all.ps1 -JavaHome "C:\Program Files\Java\jdk-17"

# 停止（先停 Nginx，再优雅关闭两个 Tomcat，必要时按端口兜底清理）
.\stop-all.ps1
```

若提示“禁止运行脚本”，改用：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
powershell -ExecutionPolicy Bypass -File .\stop-all.ps1
```

## 验证

```powershell
# 连续访问 6 次，输出 Tomcat Node 1 / Tomcat Node 2 交替即为轮询生效
1..6 | ForEach-Object { curl.exe -s http://localhost/node-id.txt }

# 经 Nginx 访问后端接口
curl.exe -s http://localhost/api/v1/home
```

- `http://localhost/` → 景区导览前端（Nginx 轮询到两个节点）
- `http://localhost/pois`、`/navigate` → 前端路由，可直接刷新
- `http://localhost/api/v1/home` → Nginx 转发到 Node 后端
- `http://localhost/n1/`、`/n2/` → 固定走节点 1 / 节点 2
- `http://localhost:8080/`、`http://localhost:8081/` → 直连各节点

## 停止

```powershell
& "$base\tomcat1\bin\shutdown.bat"
& "$base\tomcat2\bin\shutdown.bat"
Start-Process "$base\nginx\nginx.exe" -ArgumentList "-s","stop" -WorkingDirectory "$base\nginx"
```
