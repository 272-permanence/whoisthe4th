#!/bin/bash
#===============================================================================
# 每日自动合并脚本 - 景区导览 AI 数字人项目
# 功能：每晚自动将所有成员分支合并到 main，生成合并报告
# 执行时间：每晚 22:00
# 项目：whoisthe4th (Vue3 + Express 前后端分离)
# 团队：4人分工 (A/B/C/D)，文件归属明确
#
# 智能合并策略：
#   - 根据四人分工表判断文件归属
#   - 冲突时优先保留该文件负责人的版本
#   - 禁止自动合的文件（middleware/sql/package-lock）→ 标记人工处理
#===============================================================================

set -euo pipefail

#------ 配置 ------
REPO_DIR="/workspace"
MAIN_BRANCH="main"
REPORT_BRANCH_PREFIX="daily-merge-report"
DATE_STR=$(date +%Y%m%d)
TIME_STR=$(date "+%Y-%m-%d %H:%M:%S")
REPORT_BRANCH="${REPORT_BRANCH_PREFIX}/${DATE_STR}"
LOG_FILE="${REPO_DIR}/.merge-log-${DATE_STR}.txt"

REMOTE_ORIGINAL="https://github.com/272-permanence/whoisthe4th.git"

# 颜色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()   { echo -e "$1" | tee -a "$LOG_FILE"; }
info()  { log "${GREEN}[INFO]${NC} $1"; }
warn()  { log "${YELLOW}[WARN]${NC} $1"; }
error() { log "${RED}[ERROR]${NC} $1"; }
member() { log "${BLUE}[$1]${NC} $2"; }

#------ 四人分工表（用于智能冲突判断）------
# 每个成员专属文件列表，冲突时优先保留该成员版本
declare -A MEMBER_A_FILES MEMBER_B_FILES MEMBER_C_FILES MEMBER_D_FILES
MEMBER_A_FILES=(
    "backend/src/analytics/"
    "backend/src/routes/chat.ts"
    "backend/src/routes/asrTts.ts"
    "backend/src/routes/tts.ts"
    "backend/src/controllers/asrTtsController.ts"
    "backend/src/services/asrService.ts"
    "backend/src/services/ttsService.ts"
    "backend/src/services/mockSpeechSynthesizer.ts"
    "backend/src/services/audioConverter.ts"
    "frontend/src/views/QaPanel.vue"
    "frontend/src/views/InteractionView.vue"
    "frontend/src/views/Dashboard.vue"
    "frontend/src/views/PoiList.vue"
    "frontend/src/views/Navigate.vue"
)
MEMBER_B_FILES=(
    "backend/src/routes/navigation.ts"
    "backend/src/middleware/operationLog.ts"
    "backend/src/middleware/rateLimit.ts"
    "backend/src/utils/mask.ts"
)
MEMBER_C_FILES=(
    "backend/src/routes/kb.ts"
    "backend/src/routes/auth.ts"
    "backend/src/routes/unifiedAuth.ts"
    "backend/src/routes/ssoPlatform.ts"
    "backend/src/routes/content.ts"
    "backend/src/routes/adminContent.ts"
    "backend/src/routes/product.ts"
    "backend/src/routes/upload.ts"
    "backend/src/routes/user.ts"
    "backend/src/middleware/auth.ts"
    "backend/src/auth/"
    "backend/src/services/authService.ts"
    "backend/src/services/authDb.ts"
    "backend/src/services/captchaService.ts"
    "backend/src/services/kb"
    "backend/src/services/ssoPlatform.ts"
    "frontend/src/styles/tokens.css"
    "frontend/src/views/Login.vue"
    "frontend/src/views/admin/AdminLayout.vue"
    "frontend/src/views/admin/AdminDashboard.vue"
    "frontend/src/views/admin/ContentAdmin.vue"
    "frontend/src/views/admin/ProductAdmin.vue"
    "frontend/src/views/admin/KnowledgeBaseAdmin.vue"
    "frontend/src/views/admin/UserAdmin.vue"
    "frontend/src/composables/"
)
MEMBER_D_FILES=(
    "backend/src/routes/lostFound.ts"
    "backend/src/routes/home.ts"
    "backend/src/routes/guide.ts"
    "backend/src/routes/poi.ts"
    "backend/src/routes/logs.ts"
    "backend/src/routes/cs.ts"
    "backend/src/middleware/traceId.ts"
    "backend/src/services/logService.ts"
    "backend/src/services/logQueue.ts"
    "backend/src/services/errorLogger.ts"
    "backend/src/ws/"
    "backend/src/lostFound/"
    "frontend/src/router/"
    "frontend/src/stores/"
    "frontend/src/views/mobile/"
    "frontend/src/views/admin/LogCenter.vue"
    "frontend/src/views/admin/CsWorkbench.vue"
    "frontend/src/common/"
    "frontend/src/utils/"
)

# 禁止自动合并的文件（冲突时必须标记人工处理）
declare -A FORBIDDEN_AUTO_MERGE
FORBIDDEN_AUTO_MERGE=(
    ["package-lock.json"]="D 专属维护，禁止他人随意提交"
    ["backend/package-lock.json"]="同上"
    ["frontend/package-lock.json"]="同上"
    ["backend/sql/"]="历史脚本禁止修改，DDL 必须新增文件"
    ["vite.config.ts"]="禁止提交到远程，临时联调用"
    ["frontend/.env"]="禁止提交 .env 文件"
    ["frontend/.env.development"]="禁止提交"
    ["backend/.env"]="禁止提交"
    [".env"]="禁止提交"
)

# 共享/公共文件（多人可能同时修改，冲突时保留两边代码，人工 review）
declare -A SHARED_FILES
SHARED_FILES=(
    ["backend/src/app.ts"]="Express 入口，所有人都可能添加路由"
    ["backend/src/config.ts"]="环境变量配置"
    ["backend/src/common/"]="通用模块（logger/redis/sse）"
    ["backend/package.json"]="依赖可能多人添加"
    ["frontend/src/main.ts"]="前端入口"
    ["frontend/src/App.vue"]="根组件"
    ["frontend/package.json"]="前端依赖"
)

# 其他中间件归 C 所有
declare -A MIDDLEWARE_BELONGS_TO
MIDDLEWARE_BELONGS_TO=(
    ["backend/src/middleware/auth.ts"]="C"
    ["backend/src/middleware/operationLog.ts"]="B"
    ["backend/src/middleware/rateLimit.ts"]="B"
    ["backend/src/middleware/traceId.ts"]="D"
)

# 其他根目录配置文件归 D（项目基建）
declare -A PROJECT_FOUNDATION_BY_D
PROJECT_FOUNDATION_BY_D=(
    ["README.md"]="D"
    [".gitignore"]="D"
    [".gitattributes"]="D"
    ["backend/.eslintrc.cjs"]="D"
    ["backend/tsconfig.json"]="D"
    ["frontend/tsconfig.json"]="D"
    ["frontend/tsconfig.app.json"]="D"
    ["frontend/tsconfig.node.json"]="D"
    ["frontend/vite.config.ts"]="B"
)

#------ 判断文件归属的函数 ------
get_file_owner() {
    local file="$1"
    local branch_name="${2:-}"

    # 1. 优先检查禁止自动合的文件
    for pattern in "${!FORBIDDEN_AUTO_MERGE[@]}"; do
        if [[ "$file" == *"$pattern"* ]] || [[ "$file" == "$pattern"* ]]; then
            echo "FORBIDDEN|${FORBIDDEN_AUTO_MERGE[$pattern]}"
            return 0
        fi
    done

    # 2. 检查是否共享文件
    for pattern in "${!SHARED_FILES[@]}"; do
        if [[ "$file" == *"$pattern"* ]] || [[ "$file" == "$pattern"* ]]; then
            echo "SHARED|${SHARED_FILES[$pattern]}"
            return 0
        fi
    done

    # 3. 精确匹配 middleware
    if [ -n "${MIDDLEWARE_BELONGS_TO[$file]:-}" ]; then
        echo "OWNED_${MIDDLEWARE_BELONGS_TO[$file]}"
        return 0
    fi

    # 4. 精确匹配项目基建
    if [ -n "${PROJECT_FOUNDATION_BY_D[$file]:-}" ]; then
        echo "OWNED_${PROJECT_FOUNDATION_BY_D[$file]}"
        return 0
    fi

    # 5. 按前缀匹配四人分工
    for owner in A B C D; do
        local arr_name="MEMBER_${owner}_FILES"
        # 使用 eval 读取数组
        eval "local files=(\"\${${arr_name}[@]}\")"
        for owned in "${files[@]}"; do
            if [[ "$file" == *"$owned"* ]] || [[ "$file" == "$owned"* ]]; then
                echo "OWNED_${owner}"
                return 0
            fi
        done
    done

    # 6. 根据分支名推断（如果分支名含成员标识）
    local lower_branch=$(echo "$branch_name" | tr '[:upper:]' '[:lower:]')
    case "$lower_branch" in
        *"member-a"*|*"membera"*|*"成员a"*|*"语音"*|*"analytics"*|*"chat"*|*"asr"*|*"tts"*) echo "OWNED_A"; return 0 ;;
        *"member-b"*|*"memberb"*|*"成员b"*|*"nav"*|*"navigation"*|*"middleware"*|*"log"*) echo "OWNED_B"; return 0 ;;
        *"member-c"*|*"memberc"*|*"成员c"*|*"kb"*|*"auth"*|*"rbac"*|*"sso"*|*"admin"*|*"token"*|*"design"*) echo "OWNED_C"; return 0 ;;
        *"member-d"*|*"memberd"*|*"成员d"*|*"mobile"*|*"cs"*|*"trace"*|*"audit"*|*"home"*|*"route"*) echo "OWNED_D"; return 0 ;;
    esac

    # 7. 默认：根据目录分配
    if [[ "$file" == backend/src/services/* ]]; then
        # services 按文件名模糊分配
        case "$file" in
            *asrService*|*ttsService*|*mockSpeech*|*audioConverter*) echo "OWNED_A" ;;
            *authService*|*authDb*|*captchaService*|*kb*|*ssoPlatform*) echo "OWNED_C" ;;
            *logService*|*logQueue*|*errorLogger*) echo "OWNED_D" ;;
            *) echo "SHARED|service 共享" ;;
        esac
    elif [[ "$file" == frontend/src/api/* ]]; then
        # api 文件按后端路由名分配
        case "$file" in
            *analytics*|*chat*|*asr*|*tts*) echo "OWNED_A" ;;
            *navigation*) echo "OWNED_B" ;;
            *kb*|*auth*|*product*|*user*|*upload*|*content*) echo "OWNED_C" ;;
            *logs*|*lost*|*poi*|*home*|*cs*|*routes*|*guide*) echo "OWNED_D" ;;
            *) echo "SHARED|api 共享" ;;
        esac
    elif [[ "$file" == frontend/src/components/* ]]; then
        echo "SHARED|组件共享"
    elif [[ "$file" == backend/src/routes/* ]]; then
        case "$file" in
            *chat*|*asr*|*tts*|*analytics*) echo "OWNED_A" ;;
            *navigation*) echo "OWNED_B" ;;
            *auth*|*kb*|*content*|*product*|*upload*|*user*|*sso*|*adminContent*|*unifiedAuth*) echo "OWNED_C" ;;
            *lostFound*|*home*|*guide*|*poi*|*logs*|*cs*) echo "OWNED_D" ;;
            *) echo "SHARED|route 共享" ;;
        esac
    else
        # 完全未知文件 → 标记为共享
        echo "SHARED|新文件/未归类"
    fi
}

#------ 清理 ------
cleanup() {
    find "$REPO_DIR" -name "*.orig" -o -name "*.rej" 2>/dev/null | xargs rm -f 2>/dev/null || true
    [ -d "$REPO_DIR/.git/MERGE_HEAD" ] && { cd "$REPO_DIR" && git merge --abort 2>/dev/null || true; }
    [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${REMOTE_ORIGINAL:-}" ] && \
        git remote set-url origin "$REMOTE_ORIGINAL" 2>/dev/null || true
}
trap cleanup EXIT

#===========================================================================
#                                 开始执行
#===========================================================================

cd "$REPO_DIR" && > "$LOG_FILE"

log "=================================================="
log "  每日自动合并任务 - $TIME_STR"
log "  项目：景区导览 AI 数字人 (4人分工协作)"
log "=================================================="
log ""

#------ Step 1: 配置 Git ------
if ! git config user.name 2>/dev/null; then
    git config user.name "Merge Bot"
    git config user.email "merge-bot@users.noreply.github.com"
    info "已配置 Git user.name = Merge Bot"
fi

if [ -n "${GITHUB_TOKEN:-}" ]; then
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/272-permanence/whoisthe4th.git"
fi

#------ Step 2: fetch 所有远程分支 ------
info "[Step 1/6] 拉取远程所有分支..."
git fetch --all --prune 2>&1 | tee -a "$LOG_FILE"

#------ Step 3: 切换到 main 并拉最新 ------
info "[Step 2/6] 切换并更新 $MAIN_BRANCH..."
git checkout "$MAIN_BRANCH" 2>&1 | tee -a "$LOG_FILE"
git pull origin "$MAIN_BRANCH" 2>&1 | tee -a "$LOG_FILE"

#------ Step 4: 收集待合并分支 ------
info "[Step 3/6] 收集待合并成员分支..."
ALL_REMOTE_BRANCHES=$(git branch -r | grep -v HEAD | sed 's/^[[:space:]]*//' | sed 's/^origin\///')

MERGE_CANDIDATES=()
SKIPPED_INFO=()
for branch in $ALL_REMOTE_BRANCHES; do
    case "$branch" in
        "$MAIN_BRANCH")
            continue ;;
        "${REPORT_BRANCH_PREFIX}/"*)
            continue ;;  # 排除历史报告分支
        trae/*)
            info "  跳过临时分支: $branch"
            continue ;;
    esac
    # 排除已经完全合并到 main 的分支
    if git merge-base --is-ancestor "origin/$branch" "$MAIN_BRANCH" 2>/dev/null; then
        SKIPPED_INFO+=("$branch (所有提交已在 main 中)")
        continue
    fi
    MERGE_CANDIDATES+=("$branch")
done

info "待合并分支 (${#MERGE_CANDIDATES[@]}): ${MERGE_CANDIDATES[*]:-无}"
[ ${#SKIPPED_INFO[@]} -gt 0 ] && info "已同步跳过 (${#SKIPPED_INFO[@]}): ${SKIPPED_INFO[*]}"

#------ Step 5: 逐个合并 ------
info "[Step 4/6] 开始逐个合并..."
log ""

MERGED_OK=()
MERGED_AUTO_CONFLICT=()
MERGED_MANUAL_NEEDED=()

for branch in "${MERGE_CANDIDATES[@]}"; do
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    member "MERGE" "$branch"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    set +e
    MERGE_OUTPUT=$(git merge --no-ff "origin/$branch" -m "auto-merge: $branch" 2>&1)
    MERGE_EXIT=$?
    set -e
    echo "$MERGE_OUTPUT" | tee -a "$LOG_FILE"

    if [ $MERGE_EXIT -eq 0 ]; then
        info "  ✅ 无冲突合并成功"
        MERGED_OK+=("$branch")
        continue
    fi

    # ========== 有冲突 → 智能解决 ==========
    CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null)
    CONFLICT_FILE_COUNT=$(echo "$CONFLICTED_FILES" | grep -c . || true)
    warn "  ⚠️ 发现 ${CONFLICT_FILE_COUNT} 个冲突文件"

    ALL_AUTO_RESOLVABLE=true
    RESOLVED_LIST=()
    MANUAL_LIST=()

    while IFS= read -r file; do
        [ -z "$file" ] && continue
        [ ! -f "$file" ] && { warn "  文件不存在: $file"; continue; }

        owner_info=$(get_file_owner "$file" "$branch")
        status=$(echo "$owner_info" | cut -d'|' -f1)
        detail=$(echo "$owner_info" | cut -d'|' -f2-)

        log "  冲突: $file → $status (${detail})"

        case "$status" in
            FORBIDDEN)
                error "    ❌ 禁止自动合! $detail"
                ALL_AUTO_RESOLVABLE=false
                MANUAL_LIST+=("$file: $detail")
                ;;

            SHARED)
                # 共享文件 → 保留两边代码（冲突标记不消除，人工 review）
                warn "    🛠 共享文件 → 保留两边，标记人工 review"
                ALL_AUTO_RESOLVABLE=false
                MANUAL_LIST+=("$file: 共享文件需人工合并两边内容")
                # 尝试最小化合并：保留冲突标记
                RESOLVED_LIST+=("$file → 保留两边冲突标记")
                ;;

            OWNED_A)
                member "A" "保留 A 版本 (theirs = $branch)"
                git checkout --theirs "$file" && git add "$file"
                RESOLVED_LIST+=("$file → 保留 A 的代码 ($branch)")
                ;;

            OWNED_B)
                member "B" "保留 B 版本 (theirs = $branch)"
                git checkout --theirs "$file" && git add "$file"
                RESOLVED_LIST+=("$file → 保留 B 的代码 ($branch)")
                ;;

            OWNED_C)
                member "C" "保留 C 版本 (theirs = $branch)"
                git checkout --theirs "$file" && git add "$file"
                RESOLVED_LIST+=("$file → 保留 C 的代码 ($branch)")
                ;;

            OWNED_D)
                member "D" "保留 D 版本 (theirs = $branch)"
                git checkout --theirs "$file" && git add "$file"
                RESOLVED_LIST+=("$file → 保留 D 的代码 ($branch)")
                ;;

            *)
                # 未知归属 → 保守策略：保留两边
                warn "    🛠 未知归属 → 保留两边"
                ALL_AUTO_RESOLVABLE=false
                MANUAL_LIST+=("$file: 未知归属，需人工合并")
                ;;
        esac
    done <<< "$CONFLICTED_FILES"

    # 检查是否还有未解决的
    REMAINING=$(git diff --name-only --diff-filter=U 2>/dev/null) || true
    if [ -n "$REMAINING" ]; then
        log "  还有未解决的冲突标记：$REMAINING"
        ALL_AUTO_RESOLVABLE=false
    fi

    if [ "$ALL_AUTO_RESOLVABLE" = true ] && [ -z "$REMAINING" ]; then
        info "  ✅ 冲突已全部按分工规则自动解决，提交中..."
        COMMIT_MSG="auto-merge: $branch (冲突已按分工自动解决)

按四人分工自动处理的冲突文件：
$(printf '    - %s\n' "${RESOLVED_LIST[@]}")
"
        git commit -m "$COMMIT_MSG" 2>&1 | tee -a "$LOG_FILE" || git commit --allow-empty -m "$COMMIT_MSG" 2>&1 | tee -a "$LOG_FILE"
        MERGED_AUTO_CONFLICT+=("$branch")
    else
        error "  ❌ 存在需人工处理的冲突，中止此分支合并"
        git merge --abort 2>/dev/null || true
        MERGED_MANUAL_NEEDED+=("$branch")
        log "  需人工处理的文件："
        printf '    ❌ %s\n' "${MANUAL_LIST[@]}" | tee -a "$LOG_FILE"
    fi

    log ""
done

#------ Step 6: 推送 main ------
info "[Step 5/6] 推送 main 分支..."
PUSH_NEEDED=false
if [ ${#MERGED_OK[@]} -gt 0 ] || [ ${#MERGED_AUTO_CONFLICT[@]} -gt 0 ]; then
    PUSH_NEEDED=true
fi

if [ "$PUSH_NEEDED" = true ]; then
    set +e
    PUSH_OUTPUT=$(git push origin "$MAIN_BRANCH" 2>&1)
    PUSH_EXIT=$?
    set -e
    echo "$PUSH_OUTPUT" | tee -a "$LOG_FILE"
    [ $PUSH_EXIT -eq 0 ] && info "  ✅ main 推送成功" || error "  ❌ main 推送失败: $PUSH_OUTPUT"
else
    info "  无需推送 (无合并发生)"
fi

#------ Step 7: 生成合并报告分支 ------
info "[Step 6/6] 生成合并报告分支..."
git checkout -b "$REPORT_BRANCH" 2>&1 | tee -a "$LOG_FILE"

# 构造报告内容
TOTAL_SUCCESS=$(( ${#MERGED_OK[@]} + ${#MERGED_AUTO_CONFLICT[@]} ))
TOTAL_FAILED=${#MERGED_MANUAL_NEEDED[@]}
TOTAL_SKIPPED=${#SKIPPED_INFO[@]}
TOTAL_CANDIDATES=${#MERGE_CANDIDATES[@]}

cat > "MERGE-REPORT-${DATE_STR}.md" << EOF
# 📝 每日合并报告 - $(date '+%Y-%m-%d')

**执行时间**: $TIME_STR
**主分支**: $MAIN_BRANCH → [origin/$MAIN_BRANCH](https://github.com/272-permanence/whoisthe4th/tree/main)
**报告分支**: \`$REPORT_BRANCH\`
**待合并分支总数**: $TOTAL_CANDIDATES

---

## 📊 合并摘要

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 成功（无冲突） | ${#MERGED_OK[@]} | 直接合并 |
| 🛠 成功（自动解决冲突） | ${#MERGED_AUTO_CONFLICT[@]} | 按四人分工表解决 |
| ⏭ 跳过（已同步） | $TOTAL_SKIPPED | main 已包含所有提交 |
| ❌ 需人工处理 | $TOTAL_FAILED | 禁止自动合的文件 |

---

## ✅ 合并成功（无冲突）

$(if [ ${#MERGED_OK[@]} -gt 0 ]; then printf '%s\n' "${MERGED_OK[@]}" | sed 's/^/- /'; else echo '_（无）_'; fi)

## 🛠 合并成功（冲突已按分工自动解决）

$(if [ ${#MERGED_AUTO_CONFLICT[@]} -gt 0 ]; then printf '%s\n' "${MERGED_AUTO_CONFLICT[@]}" | sed 's/^/- /'; else echo '_（无）_'; fi)

## ⏭ 跳过的分支

$(if [ ${#SKIPPED_INFO[@]} -gt 0 ]; then printf '%s\n' "${SKIPPED_INFO[@]}" | sed 's/^/- /'; else echo '_（无）_'; fi)

## ❌ 需人工处理的分支

$(
  if [ ${#MERGED_MANUAL_NEEDED[@]} -gt 0 ]; then
    for b in "${MERGED_MANUAL_NEEDED[@]}"; do
      echo "- **$b**"
      # 找出原因
      echo "  - 涉及禁止自动合文件 / 共享文件 / 未知归属文件"
    done
  else
    echo '_（无）_'
  fi
)

---

## 🤖 自动合并策略

本项目为 **4 人分工明确** 的前后端分离架构，冲突处理遵循以下规则：

### 四人分工 → 冲突时保留负责人版本

| 成员 | 领域 | 冲突策略 |
|------|------|----------|
| **A** | 语音交互 + 数据分析 + 大屏 | \`analytics/\` \`routes/chat.ts\` \`services/asr/tts/\` \`Dashboard.vue\` 等冲突 → 保留 A 的代码 |
| **B** | 导航代理 + 中间件 + 日志 | \`routes/navigation.ts\` \`middleware/operationLog.ts\` \`middleware/rateLimit.ts\` \`mask.ts\` 冲突 → 保留 B 的代码 |
| **C** | 知识库 + 鉴权 + RBAC + SSO + 设计系统 | \`routes/kb.ts\` \`routes/auth.ts\` \`middleware/auth.ts\` \`tokens.css\` 冲突 → 保留 C 的代码 |
| **D** | 移动端 + 日志审计 + 客服聊天 + 前端地基 | \`routes/lostFound.ts\` \`routes/logs.ts\` \`ws/\` \`router/\` \`stores/\` 冲突 → 保留 D 的代码 |

### 禁止自动合的文件（必须人工处理）

| 文件 | 原因 |
|------|------|
| \`package-lock.json\` | D 专属维护（禁止事项） |
| \`backend/sql/\` | 历史脚本禁止修改（禁止事项） |
| \`.env\` / \`.env.*\` | 含密钥，禁止提交 |
| \`vite.config.ts\` | 临时联调用，禁止提交 |
| 共享文件（\`app.ts\` / \`config.ts\` / \`common/\` / \`main.ts\` 等） | 多人可能同时修改，需人工合并两边 |

---

## 📌 明天早上别忘了

1. **所有人 pull main** → 保证代码同步：\`git pull origin main\`
2. 检查**需人工处理**的分支，按分工手动合并
3. 如果 main 有 push 失败（可能 token 过期），请更新 GITHUB_TOKEN

---

*由每日自动合并脚本生成 · $TIME_STR*
EOF

git add "MERGE-REPORT-${DATE_STR}.md"
git commit -m "📝 每日合并报告 - $(date '+%Y-%m-%d')

✅ 成功: $TOTAL_SUCCESS
🛠 自动解决冲突: ${#MERGED_AUTO_CONFLICT[@]}
⏭ 跳过: $TOTAL_SKIPPED
❌ 需人工: $TOTAL_FAILED
📅 生成于 $TIME_STR" 2>&1 | tee -a "$LOG_FILE"

set +e
git push origin "$REPORT_BRANCH" 2>&1 | tee -a "$LOG_FILE"
REPORT_PUSH_EXIT=${PIPESTATUS[0]}
set -e

[ $REPORT_PUSH_EXIT -eq 0 ] && info "  ✅ 报告分支推送成功: $REPORT_BRANCH" || warn "  ⚠️ 报告分支推送失败"

git checkout "$MAIN_BRANCH" 2>&1 | tee -a "$LOG_FILE"

#------ 完成 ------
log ""
log "=================================================="
log "  ✅ 任务完成 - $(date '+%Y-%m-%d %H:%M:%S')"
log "=================================================="
log ""
info "📁 日志: $LOG_FILE"
info "🔀 main 合并: $TOTAL_SUCCESS 个分支 (无冲突: ${#MERGED_OK[@]}, 自动解冲突: ${#MERGED_AUTO_CONFLICT[@]})"
info "❌ 需人工: ${#MERGED_MANUAL_NEEDED[@]} 个分支"
info "📝 报告分支: $REPORT_BRANCH"
info "📄 报告文件: MERGE-REPORT-${DATE_STR}.md"
