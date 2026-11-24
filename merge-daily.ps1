#===============================================================================
# 每日自动合并脚本 (Windows PowerShell 版)
# 功能：每晚自动将所有成员分支合并到 main，生成合并报告
# 执行时间：Windows 任务计划程序，每晚 22:00
# 项目：whoisthe4th - 景区导览 AI 数字人 (Vue3 + Express)
# 团队：4人分工 (A/B/C/D)，文件归属明确
#
# 使用：
#   - 在 Windows 任务计划程序或命令行执行：
#     powershell.exe -ExecutionPolicy Bypass -File "C:\Users\28238\Desktop\whoisthe4th\merge-daily.ps1"
#   - 或用同级的 run-merge-daily.bat 一键执行
#
# 认证：使用 Windows 本地 Git Credential Manager，无需 GITHUB_TOKEN 环境变量
#===============================================================================

#--------- 配置 ---------
$RepoDir     = "C:\Users\28238\Desktop\whoisthe4th"
$MainBranch  = "main"
$ReportBranchPrefix = "daily-merge-report"

$DateStr     = Get-Date -Format "yyyyMMdd"
$TimeStr     = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$ReportBranch = "$ReportBranchPrefix/$DateStr"
$LogFile     = Join-Path $RepoDir ".merge-log-$DateStr.txt"

#--------- 颜色输出函数 ---------
function Write-Banner($text) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}
function Write-Info($msg)  { Write-Host "[INFO ] $msg" -ForegroundColor Green  | Tee-Object -FilePath $LogFile -Append }
function Write-Warn($msg)  { Write-Host "[WARN ] $msg" -ForegroundColor Yellow | Tee-Object -FilePath $LogFile -Append }
function Write-Error2($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red   | Tee-Object -FilePath $LogFile -Append }
function Write-Member($owner, $msg) { Write-Host "  [$owner] $msg" -ForegroundColor Magenta | Tee-Object -FilePath $LogFile -Append }
function Write-Step($n, $total, $title) { Write-Info "[Step $n/$total] $title" }
function Write-Log($text)  { Write-Host "$text" | Tee-Object -FilePath $LogFile -Append }

#--------- 四人分工表（用于智能冲突判断）---------
# 每个成员的专属文件前缀 → 冲突时优先保留该成员版本
$MemberA = @(
    "backend/src/analytics/",
    "backend/src/routes/chat.ts",
    "backend/src/routes/asrTts.ts",
    "backend/src/routes/tts.ts",
    "backend/src/controllers/asrTtsController.ts",
    "backend/src/services/asrService.ts",
    "backend/src/services/ttsService.ts",
    "backend/src/services/mockSpeechSynthesizer.ts",
    "backend/src/services/audioConverter.ts",
    "frontend/src/views/QaPanel.vue",
    "frontend/src/views/InteractionView.vue",
    "frontend/src/views/Dashboard.vue",
    "frontend/src/views/PoiList.vue",
    "frontend/src/views/Navigate.vue"
)

$MemberB = @(
    "backend/src/routes/navigation.ts",
    "backend/src/middleware/operationLog.ts",
    "backend/src/middleware/rateLimit.ts",
    "backend/src/utils/mask.ts"
)

$MemberC = @(
    "backend/src/routes/kb.ts",
    "backend/src/routes/auth.ts",
    "backend/src/routes/unifiedAuth.ts",
    "backend/src/routes/ssoPlatform.ts",
    "backend/src/routes/content.ts",
    "backend/src/routes/adminContent.ts",
    "backend/src/routes/product.ts",
    "backend/src/routes/upload.ts",
    "backend/src/routes/user.ts",
    "backend/src/middleware/auth.ts",
    "backend/src/auth/",
    "backend/src/services/authService.ts",
    "backend/src/services/authDb.ts",
    "backend/src/services/captchaService.ts",
    "backend/src/services/kb",
    "backend/src/services/ssoPlatform.ts",
    "frontend/src/styles/tokens.css",
    "frontend/src/views/Login.vue",
    "frontend/src/views/admin/AdminLayout.vue",
    "frontend/src/views/admin/AdminDashboard.vue",
    "frontend/src/views/admin/ContentAdmin.vue",
    "frontend/src/views/admin/ProductAdmin.vue",
    "frontend/src/views/admin/KnowledgeBaseAdmin.vue",
    "frontend/src/views/admin/UserAdmin.vue",
    "frontend/src/composables/"
)

$MemberD = @(
    "backend/src/routes/lostFound.ts",
    "backend/src/routes/home.ts",
    "backend/src/routes/guide.ts",
    "backend/src/routes/poi.ts",
    "backend/src/routes/logs.ts",
    "backend/src/routes/cs.ts",
    "backend/src/middleware/traceId.ts",
    "backend/src/services/logService.ts",
    "backend/src/services/logQueue.ts",
    "backend/src/services/errorLogger.ts",
    "backend/src/ws/",
    "backend/src/lostFound/",
    "frontend/src/router/",
    "frontend/src/stores/",
    "frontend/src/views/mobile/",
    "frontend/src/views/admin/LogCenter.vue",
    "frontend/src/views/admin/CsWorkbench.vue",
    "frontend/src/common/",
    "frontend/src/utils/"
)

# 禁止自动合并的文件（冲突时必须标记人工处理）
$ForbiddenAutoMerge = @(
    @{ Pattern = "package-lock.json";   Reason = "D 专属维护，禁止他人随意提交" },
    @{ Pattern = "backend/package-lock.json";  Reason = "同上" },
    @{ Pattern = "frontend/package-lock.json"; Reason = "同上" },
    @{ Pattern = "backend/sql/";        Reason = "历史脚本禁止修改，DDL 必须新增文件" },
    @{ Pattern = "vite.config.ts";       Reason = "禁止提交到远程，临时联调用" },
    @{ Pattern = ".env";                 Reason = "含密钥，禁止提交" },
    @{ Pattern = ".env.local";          Reason = "禁止提交" }
)

# 共享/公共文件（多人可能同时修改，冲突时保留两边 → 人工 review）
$SharedFiles = @(
    @{ Pattern = "backend/src/app.ts";    Reason = "Express 入口，所有人都可能添加路由" },
    @{ Pattern = "backend/src/config.ts";  Reason = "环境变量配置" },
    @{ Pattern = "backend/src/common/";    Reason = "通用模块共享" },
    @{ Pattern = "backend/package.json";   Reason = "依赖可能多人添加" },
    @{ Pattern = "frontend/src/main.ts";   Reason = "前端入口" },
    @{ Pattern = "frontend/src/App.vue";   Reason = "根组件" },
    @{ Pattern = "frontend/package.json";  Reason = "前端依赖" }
)

#--------- 判断文件归属 ---------
function Get-FileOwner($file, $branchName = "") {
    $lowerFile = $file.ToLower()

    # 1. 检查禁止自动合的文件
    foreach ($entry in $ForbiddenAutoMerge) {
        $pat = $entry.Pattern.ToLower()
        if ($lowerFile -like "*$pat*" -or $lowerFile.StartsWith($pat)) {
            return "FORBIDDEN|$($entry.Reason)"
        }
    }

    # 2. 检查共享文件
    foreach ($entry in $SharedFiles) {
        $pat = $entry.Pattern.ToLower()
        if ($lowerFile -like "*$pat*" -or $lowerFile.StartsWith($pat)) {
            return "SHARED|$($entry.Reason)"
        }
    }

    # 3. 按四人分工表检查成员专属文件
    $ownerFiles = @(
        @{ Owner = "A"; Files = $MemberA },
        @{ Owner = "B"; Files = $MemberB },
        @{ Owner = "C"; Files = $MemberC },
        @{ Owner = "D"; Files = $MemberD }
    )

    foreach ($group in $ownerFiles) {
        foreach ($owned in $group.Files) {
            $ownedLower = $owned.ToLower()
            if ($lowerFile -like "*$ownedLower*" -or $lowerFile.StartsWith($ownedLower)) {
                return "OWNED_$($group.Owner)"
            }
        }
    }

    # 4. 根据分支名推断成员
    if ($branchName) {
        $lowerBranch = $branchName.ToLower()
        if ($lowerBranch -match "member[-_ ]?a|成员a|语音|analytics|chat|asr|tts") { return "OWNED_A" }
        if ($lowerBranch -match "member[-_ ]?b|成员b|nav|navigation|middleware") { return "OWNED_B" }
        if ($lowerBranch -match "member[-_ ]?c|成员c|kb|auth|rbac|sso|admin|design") { return "OWNED_C" }
        if ($lowerBranch -match "member[-_ ]?d|成员d|mobile|customer|cs|trace|audit|home") { return "OWNED_D" }
    }

    # 5. 按目录/文件名模糊推断
    if ($file -match "backend/src/services/") {
        switch -Regex ($file) {
            "asrService|ttsService|mockSpeech|audioConverter" { return "OWNED_A" }
            "authService|authDb|captchaService|kb|ssoPlatform" { return "OWNED_C" }
            "logService|logQueue|errorLogger" { return "OWNED_D" }
            default { return "SHARED|service 共享" }
        }
    }
    if ($file -match "backend/src/routes/") {
        switch -Regex ($file) {
            "chat|asr|tts|analytics" { return "OWNED_A" }
            "navigation" { return "OWNED_B" }
            "auth|kb|content|product|user|upload|sso|adminContent|unifiedAuth" { return "OWNED_C" }
            "lostFound|home|guide|poi|logs|cs" { return "OWNED_D" }
            default { return "SHARED|route 共享" }
        }
    }
    if ($file -match "frontend/src/api/") {
        switch -Regex ($file) {
            "analytics|chat|asr|tts" { return "OWNED_A" }
            "navigation" { return "OWNED_B" }
            "kb|auth|product|user|upload|content" { return "OWNED_C" }
            "logs|lost|poi|home|cs|routes|guide" { return "OWNED_D" }
            default { return "SHARED|api 共享" }
        }
    }

    # 6. 完全未知
    return "SHARED|未归类文件，需人工判断"
}

#--------- 清理 ---------
function Cleanup {
    Set-Location $RepoDir
    git merge --abort 2>$null
}

#--------- 开始执行 ---------
Set-Location $RepoDir

# 清空日志
"" | Out-File -FilePath $LogFile -Encoding UTF8

Write-Banner "每日自动合并任务 - $TimeStr"
Write-Log "项目：景区导览 AI 数字人 (4人分工协作)"

#--------- Step 1: Git 配置 ---------
Write-Step 1 6 "配置 Git 环境"

$userName = git config user.name 2>$null
if (-not $userName) {
    git config user.name  "Merge Bot"
    git config user.email "merge-bot@users.noreply.github.com"
    Write-Info "已配置 Git user.name = Merge Bot"
} else {
    Write-Info "Git user.name 已设置: $userName"
}

# 检查 Git Credential Manager
$credHelper = git config credential.helper 2>$null
Write-Info "Git 凭据助手: $credHelper"

#--------- Step 2: fetch 所有远程分支 ---------
Write-Step 2 6 "拉取远程所有分支"
git fetch --all --prune 2>&1 | Tee-Object -FilePath $LogFile -Append

#--------- Step 3: 切换并更新 main ---------
Write-Step 3 6 "切换并更新 $MainBranch"
git checkout $MainBranch 2>&1 | Tee-Object -FilePath $LogFile -Append
git pull origin $MainBranch 2>&1 | Tee-Object -FilePath $LogFile -Append

#--------- Step 4: 收集待合并分支 ---------
Write-Step 4 6 "收集待合并成员分支"

$allRemoteBranches = (git branch -r 2>$null) | ForEach-Object {
    $_.Trim() -replace '^origin/', '' -replace '^\*/', ''
} | Where-Object { $_ -and $_ -ne 'HEAD -> origin/main' }

$mergeCandidates = @()
$skippedInfo     = @()

foreach ($branch in $allRemoteBranches) {
    if ($branch -eq $MainBranch) { continue }
    if ($branch -like "${ReportBranchPrefix}/*") { continue }
    if ($branch -like "trae/*") {
        Write-Info "  跳过临时分支: $branch"
        continue
    }
    # 检查是否已完全合并
    git merge-base --is-ancestor "origin/$branch" $MainBranch 2>$null
    if ($LASTEXITCODE -eq 0) {
        $skippedInfo += "$branch (所有提交已在 main 中)"
        continue
    }
    $mergeCandidates += $branch
}

Write-Info "待合并分支 ($($mergeCandidates.Count)): $($mergeCandidates -join ', ')"
if ($skippedInfo.Count -gt 0) {
    Write-Info "已同步跳过 ($($skippedInfo.Count)): $($skippedInfo -join ', ')"
}

#--------- Step 5: 逐个合并 ---------
Write-Step 5 6 "开始逐个合并"

$mergedOk          = @()
$mergedAutoConflict = @()
$mergedManualNeeded = @()

foreach ($branch in $mergeCandidates) {
    Write-Log ""
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Member "MERGE" $branch
    Write-Log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    git merge --no-ff "origin/$branch" -m "auto-merge: $branch" 2>&1 | Tee-Object -FilePath $LogFile -Append
    $mergeExit = $LASTEXITCODE

    if ($mergeExit -eq 0) {
        Write-Info "  ✅ 无冲突合并成功"
        $mergedOk += $branch
        continue
    }

    # 有冲突
    $conflictedFiles = @(git diff --name-only --diff-filter=U 2>$null)
    if ($conflictedFiles.Count -eq 0) {
        # git 输出说有冲突但没列出文件，尝试另一种方式
        $conflictedFiles = @(git diff --name-only 2>$null) | Where-Object { $_ -match '^(U|AA|DD|AU|UA|DU|UD)' }
    }

    Write-Warn "  ⚠️ 发现 $($conflictedFiles.Count) 个冲突文件"

    $allAutoResolvable = $true
    $resolvedList = @()
    $manualList   = @()

    foreach ($file in $conflictedFiles) {
        if (-not (Test-Path $file)) {
            Write-Warn "  文件不存在: $file"
            continue
        }

        $ownerInfo = Get-FileOwner $file $branch
        $parts     = $ownerInfo.Split('|')
        $status    = $parts[0]
        $detail    = if ($parts.Count -gt 1) { $parts[1] } else { "" }

        Write-Log "  冲突: $file → $status ($detail)"

        switch ($status) {
            "FORBIDDEN" {
                Write-Error2 "    ❌ 禁止自动合! $detail"
                $allAutoResolvable = $false
                $manualList += "$file : $detail"
            }
            "SHARED" {
                Write-Warn "    🛠 共享文件 → 保留两边，标记人工 review"
                $allAutoResolvable = $false
                $manualList += "$file : 共享文件需人工合并两边"
                $resolvedList += "$file → 保留两边冲突标记"
            }
            "OWNED_A" {
                Write-Member "A" "保留 A 版本 (theirs = $branch)"
                git checkout --theirs $file 2>&1 | Out-Null
                git add $file 2>&1 | Out-Null
                $resolvedList += "$file → 保留 A"
            }
            "OWNED_B" {
                Write-Member "B" "保留 B 版本 (theirs = $branch)"
                git checkout --theirs $file 2>&1 | Out-Null
                git add $file 2>&1 | Out-Null
                $resolvedList += "$file → 保留 B"
            }
            "OWNED_C" {
                Write-Member "C" "保留 C 版本 (theirs = $branch)"
                git checkout --theirs $file 2>&1 | Out-Null
                git add $file 2>&1 | Out-Null
                $resolvedList += "$file → 保留 C"
            }
            "OWNED_D" {
                Write-Member "D" "保留 D 版本 (theirs = $branch)"
                git checkout --theirs $file 2>&1 | Out-Null
                git add $file 2>&1 | Out-Null
                $resolvedList += "$file → 保留 D"
            }
            default {
                Write-Warn "    🛠 未知归属 → 保留两边"
                $allAutoResolvable = $false
                $manualList += "$file : 未知归属"
            }
        }
    }

    # 再次检查是否还有未解决的冲突
    $remaining = git diff --name-only --diff-filter=U 2>$null
    if ($remaining) {
        Write-Log "  还有未解决的冲突标记：$remaining"
        $allAutoResolvable = $false
    }

    if ($allAutoResolvable -and -not $remaining) {
        Write-Info "  ✅ 冲突已全部按分工规则自动解决，提交中..."
        $commitMsg = @"
auto-merge: $branch (冲突已按分工自动解决)

按四人分工自动处理的冲突文件：
$($resolvedList | ForEach-Object { "    - $_" } | Out-String)
"@
        git commit -m $commitMsg 2>&1 | Tee-Object -FilePath $LogFile -Append
        if ($LASTEXITCODE -ne 0) {
            git commit --allow-empty -m $commitMsg 2>&1 | Tee-Object -FilePath $LogFile -Append
        }
        $mergedAutoConflict += $branch
    } else {
        Write-Error2 "  ❌ 存在需人工处理的冲突，中止此分支合并"
        git merge --abort 2>$null
        $mergedManualNeeded += $branch
        Write-Log "  需人工处理："
        foreach ($m in $manualList) { Write-Log "    ❌ $m" }
    }

    Write-Log ""
}

#--------- Step 6: 推送 main ---------
Write-Step 6 6 "推送 main 分支"

$pushNeeded = ($mergedOk.Count -gt 0) -or ($mergedAutoConflict.Count -gt 0)

if ($pushNeeded) {
    Write-Info "推送 $MainBranch 到远程..."
    git push origin $MainBranch 2>&1 | Tee-Object -FilePath $LogFile -Append
    if ($LASTEXITCODE -eq 0) {
        Write-Info "  ✅ main 推送成功"
    } else {
        Write-Error2 "  ❌ main 推送失败！请检查 Git 凭据是否过期"
    }
} else {
    Write-Info "  无需推送 (无合并发生)"
}

#--------- 生成合并报告分支 ---------
Write-Info "生成合并报告分支: $ReportBranch"

git checkout -b $ReportBranch 2>&1 | Tee-Object -FilePath $LogFile -Append

$totalSuccess   = $mergedOk.Count + $mergedAutoConflict.Count
$totalFailed    = $mergedManualNeeded.Count
$totalSkipped   = $skippedInfo.Count
$totalCandidates = $mergeCandidates.Count

# 构造 Markdown 报告
$reportContent = @"
# 📝 每日合并报告 - $(Get-Date -Format "yyyy-MM-dd")

**执行时间**: $TimeStr
**主分支**: $MainBranch
**报告分支**: ``$ReportBranch``
**待合并分支总数**: $totalCandidates

---

## 📊 合并摘要

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 成功（无冲突） | $($mergedOk.Count) | 直接合并 |
| 🛠 成功（自动解决冲突） | $($mergedAutoConflict.Count) | 按四人分工表解决 |
| ⏭ 跳过（已同步） | $totalSkipped | main 已包含所有提交 |
| ❌ 需人工处理 | $totalFailed | 禁止自动合的文件 |

---

## ✅ 合并成功（无冲突）

$(if ($mergedOk.Count -gt 0) { ($mergedOk | ForEach-Object { "- $_" }) -join "`n" } else { "_（无）_" })

## 🛠 合并成功（冲突已按分工自动解决）

$(if ($mergedAutoConflict.Count -gt 0) { ($mergedAutoConflict | ForEach-Object { "- $_" }) -join "`n" } else { "_（无）_" })

## ⏭ 跳过的分支

$(if ($skippedInfo.Count -gt 0) { ($skippedInfo | ForEach-Object { "- $_" }) -join "`n" } else { "_（无）_" })

## ❌ 需人工处理的分支

$(if ($mergedManualNeeded.Count -gt 0) { ($mergedManualNeeded | ForEach-Object { "- **$_**" }) -join "`n" } else { "_（无）_" })

---

## 🤖 自动合并策略

本项目为 **4 人分工明确** 的前后端分离架构，冲突处理遵循以下规则：

| 成员 | 领域 | 冲突策略 |
|------|------|----------|
| **A** | 语音交互 + 数据分析 + 大屏 | analytics/、chat、asr/tts、Dashboard 等 → 保留 A |
| **B** | 导航代理 + 中间件 + 日志 | navigation、operationLog/rateLimit、mask → 保留 B |
| **C** | 知识库 + 鉴权 + RBAC + SSO | kb、auth/rbac、tokens.css → 保留 C |
| **D** | 移动端 + 日志审计 + 客服聊天 + 基建 | mobile/、logs、ws/、router/、stores/ → 保留 D |

### 禁止自动合的文件（必须人工处理）

| 文件 | 原因 |
|------|------|
| ``package-lock.json`` | D 专属维护 |
| ``backend/sql/`` | 历史脚本禁止修改 |
| ``.env`` / ``.env.*`` | 含密钥 |
| ``vite.config.ts`` | 临时联调用 |
| 共享文件（app.ts / config.ts / common / main.ts） | 多人同时可能修改 |

---

## 📌 明天早上别忘了

1. **所有人 pull main** → ``git pull origin main``
2. 检查需人工处理的分支，按分工手动合并
3. 如果推送失败，检查 Windows 凭据管理器的 GitHub Token 是否过期

---

*由每日自动合并脚本生成 · $TimeStr*
"@

$reportFile = "MERGE-REPORT-$DateStr.md"
$reportContent | Out-File -FilePath $reportFile -Encoding UTF8

git add $reportFile
$reportCommitMsg = @"
📝 每日合并报告 - $(Get-Date -Format "yyyy-MM-dd")

✅ 成功: $totalSuccess
🛠 自动解决冲突: $($mergedAutoConflict.Count)
⏭ 跳过: $totalSkipped
❌ 需人工: $totalFailed
📅 生成于 $TimeStr
"@
git commit -m $reportCommitMsg 2>&1 | Tee-Object -FilePath $LogFile -Append

Write-Info "推送报告分支到远程..."
git push origin $ReportBranch 2>&1 | Tee-Object -FilePath $LogFile -Append
if ($LASTEXITCODE -eq 0) {
    Write-Info "  ✅ 报告分支推送成功: $ReportBranch"
} else {
    Write-Warn "  ⚠️ 报告分支推送失败"
}

git checkout $MainBranch 2>&1 | Tee-Object -FilePath $LogFile -Append

#--------- 完成 ---------
Write-Banner "✅ 任务完成 - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log ""
Write-Info "📁 日志: $LogFile"
Write-Info "🔀 main 合并: $totalSuccess 个分支 (无冲突: $($mergedOk.Count), 自动解冲突: $($mergedAutoConflict.Count))"
Write-Info "❌ 需人工: $($mergedManualNeeded.Count) 个分支"
Write-Info "📝 报告分支: $ReportBranch"
Write-Info "📄 报告文件: $reportFile"
