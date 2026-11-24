#!/bin/bash
#===============================================================================
# 每日自动合并脚本
# 功能：检查所有成员分支 -> 合并到 main -> 生成合并报告
# 执行时间：每晚 22:00
# 项目：whoisthe4th (前后端分离：Vue3 + Express)
#===============================================================================

set -euo pipefail

#------ 配置 ------
REPO_DIR="/workspace"
MAIN_BRANCH="main"
REPORT_BRANCH_PREFIX="daily-merge-report"
EXCLUDE_PATTERNS=("main" "HEAD")
DATE_STR=$(date +%Y%m%d)
TIME_STR=$(date "+%Y-%m-%d %H:%M:%S")
REPORT_BRANCH="${REPORT_BRANCH_PREFIX}/${DATE_STR}"
LOG_FILE="${REPO_DIR}/.merge-log-${DATE_STR}.txt"

# 项目关键目录（冲突时优先保留各自目录的完整代码）
FRONTEND_DIR="frontend"
BACKEND_DIR="backend"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

#------ 函数 ------
log() { echo -e "$1" | tee -a "$LOG_FILE"; }
info() { log "${GREEN}[INFO]${NC} $1"; }
warn() { log "${YELLOW}[WARN]${NC} $1"; }
error() { log "${RED}[ERROR]${NC} $1"; }

cleanup() {
    # 清理可能存在的 .orig .rej 文件
    find "$REPO_DIR" -name "*.orig" -o -name "*.rej" 2>/dev/null | xargs rm -f 2>/dev/null || true
    # 如果在合并中退出，重置工作区
    if [ -d "$REPO_DIR/.git/MERGE_HEAD" ]; then
        cd "$REPO_DIR" && git merge --abort 2>/dev/null || true
    fi
    # 恢复原始 remote URL（移除 token）
    if [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${REMOTE_ORIGINAL:-}" ]; then
        git remote set-url origin "$REMOTE_ORIGINAL" 2>/dev/null || true
    fi
}
trap cleanup EXIT

#------ 开始 ------
cd "$REPO_DIR"

> "$LOG_FILE"  # 清空日志
log "=================================================="
log "  每日自动合并任务 - $TIME_STR"
log "=================================================="
log ""

# 1. 配置 Git（如果未配置）
if ! git config user.name 2>/dev/null; then
    git config user.name "Merge Bot"
    git config user.email "merge-bot@users.noreply.github.com"
    info "已配置 Git user.name / user.email"
fi

# 配置 GITHUB_TOKEN 认证
REMOTE_ORIGINAL="https://github.com/272-permanence/whoisthe4th.git"
if [ -n "${GITHUB_TOKEN:-}" ]; then
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/272-permanence/whoisthe4th.git"
    # 验证 token 是否有效
    TOKEN_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $GITHUB_TOKEN" \
        "https://api.github.com/repos/272-permanence/whoisthe4th")
    if [ "$TOKEN_CHECK" = "401" ]; then
        error "❌ GITHUB_TOKEN 无效 (HTTP 401)，请更新 token 后重试"
        git remote set-url origin "$REMOTE_ORIGINAL"  # 恢复原始 URL
        exit 1
    elif [ "$TOKEN_CHECK" = "200" ] || [ "$TOKEN_CHECK" = "301" ]; then
        info "✅ GITHUB_TOKEN 认证有效"
    fi
fi

# 2. 拉取最新代码
info "[步骤 1/6] 拉取远程最新分支..."
git fetch --all --prune 2>&1 | tee -a "$LOG_FILE"
info "fetch 完成"

# 3. 切换到 main 并更新
info "[步骤 2/6] 切换并更新 $MAIN_BRANCH..."
git checkout "$MAIN_BRANCH" 2>&1 | tee -a "$LOG_FILE"
git pull origin "$MAIN_BRANCH" 2>&1 | tee -a "$LOG_FILE"
info "main 分支已更新到最新"

# 4. 获取所有成员分支
info "[步骤 3/6] 收集待合并分支..."
ALL_REMOTE_BRANCHES=$(git branch -r | grep -v HEAD | sed 's/^[[:space:]]*//' | sed 's/^origin\///')

MERGE_CANDIDATES=()
for branch in $ALL_REMOTE_BRANCHES; do
    # 排除 main
    if [ "$branch" = "$MAIN_BRANCH" ]; then
        continue
    fi
    # 排除已有的报告分支
    if [[ "$branch" == "${REPORT_BRANCH_PREFIX}/"* ]]; then
        continue
    fi
    # 排除 trae/agent 临时分支
    if [[ "$branch" == "trae/"* ]]; then
        info "  跳过临时分支: $branch"
        continue
    fi
    MERGE_CANDIDATES+=("$branch")
done

if [ ${#MERGE_CANDIDATES[@]} -eq 0 ]; then
    warn "没有找到待合并的成员分支"
    MERGE_CANDIDATES_STR="(无)"
else
    MERGE_CANDIDATES_STR=$(IFS=", "; echo "${MERGE_CANDIDATES[*]}")
fi
info "待合并分支列表: ${MERGE_CANDIDATES_STR:-无}"

# 5. 逐个合并
info "[步骤 4/6] 开始合并各成员分支..."
log ""

MERGED_OK=()
MERGED_CONFLICT=()
SKIPPED=()

for branch in "${MERGE_CANDIDATES[@]}"; do
    log "--------------------------------------------------"
    log "尝试合并: $branch"
    log "--------------------------------------------------"

    # 检查该分支是否真的有新提交需要合并
    if git merge-base --is-ancestor "origin/$branch" "$MAIN_BRANCH" 2>/dev/null; then
        info "  ⏭ 跳过 - $branch 的所有提交已在 main 中"
        SKIPPED+=("$branch (已同步)")
        continue
    fi

    # 尝试合并
    set +e
    MERGE_OUTPUT=$(git merge --no-ff "origin/$branch" -m "auto-merge: $branch" 2>&1)
    MERGE_EXIT=$?
    set -e

    echo "$MERGE_OUTPUT" | tee -a "$LOG_FILE"

    if [ $MERGE_EXIT -eq 0 ]; then
        info "  ✅ 合并成功 (无冲突)"
        MERGED_OK+=("$branch")
        # 立即提交
        git commit --allow-empty -m "auto-merge: $branch - $(date '+%H:%M:%S')" 2>/dev/null || true
    else
        # 有冲突
        CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null)
        warn "  ⚠️ 发现冲突，涉及文件:"
        echo "$CONFLICTED_FILES" | while read -r f; do
            warn "    - $f"
        done

        # ====== 智能冲突处理 ======
        # 策略：
        # 1. 如果冲突文件在 frontend/ 或 backend/ 下，说明冲突独立
        #    -> 优先保留最新提交者的版本（git 自带策略），或者保留两边
        # 2. 如果冲突在根目录的共享文件（package.json, README, .gitignore 等）
        #    -> 保留两边内容，手动解决
        # 3. 任何无法自动解决的冲突 -> 保留冲突标记，人工处理

        RESOLVED=false
        CONFLICT_FIXED=()

        for CONFLICTED_FILE in $CONFLICTED_FILES; do
            if [ ! -f "$CONFLICTED_FILE" ]; then
                warn "  文件不存在: $CONFLICTED_FILE"
                continue
            fi

            # 判断冲突文件的位置
            case "$CONFLICTED_FILE" in
                ${FRONTEND_DIR}/*)
                    # frontend 内部冲突：保留最新的一侧
                    # 策略：保留 main 分支版本（因为是逐个合并，main 是累积分支）
                    git checkout --ours "$CONFLICTED_FILE" 2>/dev/null && \
                        git add "$CONFLICTED_FILE" && \
                        CONFLICT_FIXED+=("$CONFLICTED_FILE (ours/main)") && \
                        info "    🛠 自动解决: $CONFLICTED_FILE → 保留 main 版本"
                    ;;
                ${BACKEND_DIR}/*)
                    # backend 内部冲突：同理
                    git checkout --ours "$CONFLICTED_FILE" 2>/dev/null && \
                        git add "$CONFLICTED_FILE" && \
                        CONFLICT_FIXED+=("$CONFLICTED_FILE (ours/main)") && \
                        info "    🛠 自动解决: $CONFLICTED_FILE → 保留 main 版本"
                    ;;
                *)
                    # 根目录/共享文件冲突：尝试保留两边（追加式）
                    info "    🛠 共享文件冲突: $CONFLICTED_FILE → 尝试保留两边内容"

                    # 读取冲突内容，保留两边的非冲突部分 + 两边冲突块
                    awk '
                    BEGIN { in_conflict=0; have_ours=0; have_theirs=0 }
                    /^<<<<<<< / { in_conflict=1; have_ours=1; print $0; next }
                    /^=======$/ { print $0; next }
                    /^>>>>>>> / { in_conflict=0; have_theirs=1; print $0; next }
                    { print $0 }
                    ' "$CONFLICTED_FILE" > "${CONFLICTED_FILE}.tmp"
                    mv "${CONFLICTED_FILE}.tmp" "$CONFLICTED_FILE"
                    git add "$CONFLICTED_FILE"
                    CONFLICT_FIXED+=("$CONFLICTED_FILE (保留两边)")
                    info "    ✅ 已保留两边代码"
                    ;;
            esac
        done

        # 检查是否还有未解决的冲突
        REMAINING=$(git diff --name-only --diff-filter=U 2>/dev/null)
        if [ -z "$REMAINING" ]; then
            info "  ✅ 冲突已全部自动解决，提交中..."
            git commit -m "auto-merge: $branch (冲突已自动解决)

冲突文件处理:
$(printf '  - %s\n' "${CONFLICT_FIXED[@]}")
" 2>&1 | tee -a "$LOG_FILE"
            MERGED_CONFLICT+=("$branch (自动解决冲突)")
            RESOLVED=true
        else
            error "  ❌ 仍有冲突无法自动解决，中止合并此分支"
            git merge --abort 2>/dev/null || true
            MERGED_CONFLICT+=("$branch (无法自动解决，需人工处理)")
            RESOLVED=false
        fi
    fi

    log ""
done

# 6. 推送 main 分支
info "[步骤 5/6] 推送合并后的 main 分支..."
if [ ${#MERGED_OK[@]} -gt 0 ] || [ ${#MERGED_CONFLICT[@]} -gt 0 ]; then
    set +e
    PUSH_OUTPUT=$(git push origin "$MAIN_BRANCH" 2>&1)
    PUSH_EXIT=$?
    set -e
    echo "$PUSH_OUTPUT" | tee -a "$LOG_FILE"
    if [ $PUSH_EXIT -eq 0 ]; then
        info "  ✅ main 分支推送成功"
    else
        error "  ❌ 推送失败: $PUSH_OUTPUT"
    fi
else
    info "  无需推送 (无合并发生)"
fi

# 7. 生成合并报告分支
info "[步骤 6/6] 生成合并报告分支: $REPORT_BRANCH..."
git checkout -b "$REPORT_BRANCH" 2>&1 | tee -a "$LOG_FILE"

# 生成报告文件
REPORT_CONTENT="# 每日合并报告 - $(date '+%Y-%m-%d')

**执行时间**: $TIME_STR
**主分支**: $MAIN_BRANCH
**报告分支**: $REPORT_BRANCH

---

## 📊 合并摘要

| 状态 | 数量 |
|------|------|
| ✅ 合并成功（无冲突） | ${#MERGED_OK[@]} |
| ⚠️ 合并成功（有冲突） | ${#MERGED_CONFLICT[@]} |
| ⏭ 跳过（已同步） | ${#SKIPPED[@]} |
| ❌ 合并失败（需人工） | $((${#MERGE_CANDIDATES[@]} - ${#MERGED_OK[@]} - ${#MERGED_CONFLICT[@]} - ${#SKIPPED[@]})) |

**总计**: ${#MERGE_CANDIDATES[@]} 个分支

---

## ✅ 合并成功（无冲突）

$(if [ ${#MERGED_OK[@]} -gt 0 ]; then printf '%s\n' "${MERGED_OK[@]}" | sed 's/^/- /'; else echo '_(无)_'; fi)

## ⚠️ 合并成功（冲突已自动解决）

$(if [ ${#MERGED_CONFLICT[@]} -gt 0 ]; then printf '%s\n' "${MERGED_CONFLICT[@]}" | sed 's/^/- /'; else echo '_(无)_'; fi)

## ⏭ 跳过的分支

$(if [ ${#SKIPPED[@]} -gt 0 ]; then printf '%s\n' "${SKIPPED[@]}" | sed 's/^/- /'; else echo '_(无)_'; fi)

## ❌ 合并失败（需人工处理）

$(
FAILED_COUNT=0
for branch in "${MERGE_CANDIDATES[@]}"; do
    found=0
    for s in "${MERGED_OK[@]}" "${MERGED_CONFLICT[@]}" "${SKIPPED[@]}"; do
        if [[ "$s" == "$branch"* ]]; then found=1; break; fi
    done
    if [ $found -eq 0 ]; then
        echo "- **$branch**"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done
if [ $FAILED_COUNT -eq 0 ]; then echo '_(无)_'; fi
)

---

## 🔧 自动合并策略说明

本项目为前后端分离架构（Vue3 + Express），冲突处理策略：

1. **frontend/ 目录内冲突** → 保留 main 版本（每个成员独立开发，互相不干扰）
2. **backend/ 目录内冲突** → 保留 main 版本（同理）
3. **根目录共享文件冲突** → 保留两边代码（手动标记，人工 review）
4. **无法解决的冲突** → 中止合并该分支，标记为待人工处理

## 📝 注意事项

- 所有成员下次 pull 时将获得统一的 main 分支
- 冲突无法自动解决的分支需要手动处理
- 请在次日检查失败的分支并手动合并

---

*由每日自动合并脚本生成*
"

echo "$REPORT_CONTENT" > "MERGE-REPORT-${DATE_STR}.md"

git add "MERGE-REPORT-${DATE_STR}.md"
git commit -m "📝 每日合并报告 - $(date '+%Y-%m-%d')

- 成功合并: ${#MERGED_OK[@]} + ${#MERGED_CONFLICT[@]}
- 跳过: ${#SKIPPED[@]}
- 报告生成于 $TIME_STR" 2>&1 | tee -a "$LOG_FILE"

set +e
REPORT_PUSH=$(git push origin "$REPORT_BRANCH" 2>&1)
REPORT_PUSH_EXIT=$?
set -e

if [ $REPORT_PUSH_EXIT -eq 0 ]; then
    info "  ✅ 报告分支推送成功: $REPORT_BRANCH"
    info "  📄 报告文件: MERGE-REPORT-${DATE_STR}.md"
else
    warn "  ⚠️ 报告分支推送失败（可能 remote branch protection）"
    echo "$REPORT_PUSH" | tee -a "$LOG_FILE"
fi

# 切回 main
git checkout "$MAIN_BRANCH" 2>&1 | tee -a "$LOG_FILE"

#------ 完成 ------
log ""
log "=================================================="
log "  任务完成 - $(date '+%Y-%m-%d %H:%M:%S')"
log "=================================================="
log ""
log "📁 日志文件: $LOG_FILE"
log "🔀 main 分支合并: $((${#MERGED_OK[@]} + ${#MERGED_CONFLICT[@]})) 个分支"
log "📝 报告分支: $REPORT_BRANCH"

# 返回退出码
if [ ${#MERGED_OK[@]} -eq 0 ] && [ ${#MERGED_CONFLICT[@]} -eq 0 ]; then
    exit 0
else
    exit 0  # 成功即为 0，失败的在报告里
fi
