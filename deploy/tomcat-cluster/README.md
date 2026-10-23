# Tomcat 集群演示环境

Nginx 反向代理 + 双 Tomcat 节点轮询负载均衡的最小可运行集群，用于课程演示。
集群内运行的只是演示页（`webapps/ROOT/index.html`），真实业务代码在 Node.js 后端（`backend/`），不要混淆。

## 目录结构

```
tomcat-cluster/
├── tomcat1/          Tomcat 9.0.123 节点 1（HTTP 8080，jvmRoute=tomcat1）
├── tomcat2/          Tomcat 9.0.123 节点 2（HTTP 8081，jvmRoute=tomcat2）
└── nginx/            Nginx 1.29.8 统一入口（HTTP 80，upstream 轮询两个节点）
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

## 验证

```powershell
# 连续访问 5 次，节点 1 / 节点 2 交替出现即为轮询生效
1..5 | ForEach-Object { (Invoke-WebRequest "http://localhost/" -UseBasicParsing).Content }
```

- `http://localhost/` → 轮询到节点 1 或节点 2
- `http://localhost/n1/` → 固定走节点 1
- `http://localhost/n2/` → 固定走节点 2
- `http://localhost:8080/`、`http://localhost:8081/` → 直连各节点

## 停止

```powershell
& "$base\tomcat1\bin\shutdown.bat"
& "$base\tomcat2\bin\shutdown.bat"
Start-Process "$base\nginx\nginx.exe" -ArgumentList "-s","stop" -WorkingDirectory "$base\nginx"
```
