<script setup lang="ts">
/**
 * @file 游玩攻略详情页（成员D · 扩展：加"开始导航"按钮 + 景点可点击跳导航 + 样式修正）
 * @description 路线信息 + 途经 POI 步骤链 + 每个 POI 的停留时长与简介 + 底部导航按钮
 * @author 第八组（成员D）
 * @date 2026-11-25
 */
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { fetchRouteDetail, type RouteDetail } from '../../api/guide';
import { trackAutoBind, trackClick } from '../../utils/track';
import Avatar from '../../components/common/Avatar.vue';

const route = useRoute();
const router = useRouter();
const detail = ref<RouteDetail | null>(null);
const loading = ref(true);

const themeMap: Record<string, string> = {
  history: '历史文化',
  nature: '自然风光',
  family: '亲子出游',
  food: '美食寻味',
  general: '通用',
};

const categoryMap: Record<string, string> = {
  attraction: '景点',
  facility: '服务设施',
  landmark: '地标',
  food: '餐饮',
  other: '其他',
};

const totalTime = computed(() => detail.value?.steps.reduce((sum, s) => sum + s.stay_minutes, 0) ?? 0);

async function load() {
  showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
  try {
    const id = Number(route.params.id);
    detail.value = await fetchRouteDetail(id);
  } catch (err) {
    showToast((err as Error).message || '路线详情加载失败');
  } finally {
    closeToast();
    loading.value = false;
  }
}

/** 点击景点 → 跳到导航 */
function goNavigateToPoi(poiName: string) {
  trackClick('guide-detail-navigate-poi', 'guide-detail', { poiName });
  router.push({ path: '/navigate', query: { target: poiName } });
}

/** 开始整条路线的导航：起点=第一个景点，终点=最后一个景点 */
function startFullNavigation() {
  if (!detail.value || detail.value.steps.length === 0) return;
  trackClick('guide-detail-start-navigate', 'guide-detail', { routeId: detail.value.id });
  const first = detail.value.steps[0].name;
  const last = detail.value.steps[detail.value.steps.length - 1].name;
  router.push({ path: '/navigate', query: { start: first, end: last, routeId: String(detail.value.id) } });
}

onMounted(() => { load(); trackAutoBind(); });
</script>

<template>
  <div v-if="detail" class="guide-detail">
    <!-- 数字人导览员（成员A 公用 Avatar） -->
    <div class="guide-detail__avatar-bar">
      <Avatar mode="breathing" size="sm" />
      <div class="guide-detail__avatar-info">
        <span class="guide-detail__avatar-name">小导 · 数字人</span>
        <span class="guide-detail__avatar-tip">正在查看路线：{{ detail.name }}</span>
      </div>
    </div>

    <!-- 路线头部 -->
    <div class="route-header">
      <h1>{{ detail.name }}</h1>
      <div class="route-tags">
        <van-tag type="primary" size="medium">{{ themeMap[detail.theme] ?? detail.theme }}</van-tag>
        <span class="route-time"><van-icon name="clock-o" /> 约{{ detail.estimated_minutes }}分钟</span>
        <span class="route-pois"><van-icon name="location-o" /> {{ detail.poi_count }}个景点</span>
      </div>
      <p class="route-desc" v-if="detail.description">{{ detail.description }}</p>
    </div>

    <!-- 路线步骤 -->
    <van-cell-group inset class="steps-group">
      <template #title>
        <div class="steps-title">
          游览步骤（实际停留 {{ totalTime }} 分钟）
        </div>
      </template>
      <div v-if="detail.steps.length === 0" class="no-steps">
        <van-empty description="暂无途经景点" />
      </div>
      <div
        v-for="step in detail.steps"
        :key="step.poi_id"
        class="step-item"
        :data-track="`poi-step:${step.poi_id}`"
        @click="goNavigateToPoi(step.name)"
      >
        <div class="step-seq">{{ step.seq }}</div>
        <div class="step-body">
          <div class="step-head">
            <span class="step-name">{{ step.name }}</span>
            <van-tag plain size="medium" type="success" v-if="step.stay_minutes">{{ step.stay_minutes }}分钟</van-tag>
          </div>
          <div class="step-cat">{{ categoryMap[step.category] ?? step.category }}</div>
          <div class="step-desc" v-if="step.description">{{ step.description }}</div>
          <div class="step-loc" v-if="step.location">
            <van-icon name="location-o" /> {{ step.location }}
          </div>
        </div>
        <van-icon name="arrow" class="step-arrow" />
      </div>
    </van-cell-group>

    <!-- 底部"开始导航"按钮（串起路线→导航→AI） -->
    <div class="nav-bar">
      <van-button
        type="primary"
        block
        round
        icon="location-o"
        :disabled="detail.steps.length === 0"
        @click="startFullNavigation"
      >
        开始整条路线导航
      </van-button>
      <p class="nav-hint">也可点击上方任一景点，单独导航前往</p>
    </div>
  </div>
</template>

<style scoped>
.guide-detail {
  padding-bottom: 140px;
}

/* 西湖墨绿主题统一（替换旧蓝色） */
.route-header {
  background: linear-gradient(135deg, #526F61 0%, #8AA094 100%);
  color: #fff;
  padding: 24px 16px 20px;
}
.route-header h1 {
  margin: 0 0 10px;
  font-size: 20px;
}
.route-tags {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.route-tags .van-tag {
  background: rgba(255, 255, 255, 0.25);
  border: none;
  color: #fff;
}
.route-tags .van-icon {
  margin-right: 2px;
}
.route-desc {
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.9;
  margin: 0;
}

.steps-group {
  margin-top: 12px;
}
.steps-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #303A35);
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--color-border, #E8E8E2);
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
}
.step-item:active { background: rgba(82, 111, 97, 0.05); }
.step-seq {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary, #526F61);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step-body { flex: 1; min-width: 0; }
.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.step-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #303A35);
}
.step-cat { font-size: 12px; color: var(--color-text-2, #7B827D); margin-top: 2px; }
.step-desc {
  font-size: 13px;
  color: var(--color-text-2, #7B827D);
  margin-top: 6px;
  line-height: 1.5;
}
.step-loc {
  font-size: 12px;
  color: var(--color-text-2, #7B827D);
  margin-top: 4px;
}
.step-loc .van-icon { margin-right: 2px; }
.step-arrow { color: var(--color-text-3, #A5AAA5); flex-shrink: 0; }

.no-steps { padding: 16px 0; }

/* 数字人导览员横条 */
.guide-detail__avatar-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin: 12px 12px 4px;
  border-radius: 14px;
  background: linear-gradient(135deg, #E9EFEA 0%, #F3F7F4 100%);
  border: 1px solid #D6E1D9;
}
.guide-detail__avatar-bar :deep(.avatar) { flex-shrink: 0; }
.guide-detail__avatar-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.guide-detail__avatar-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, #526F61);
}
.guide-detail__avatar-tip {
  font-size: 12px;
  color: #8AA094;
}

/* 底部导航按钮栏 */
.nav-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 10;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: #FFFFFF;
  border-top: 1px solid var(--color-border, #E8E8E2);
}
.nav-bar .van-button {
  background: var(--color-primary, #526F61);
  border-color: var(--color-primary, #526F61);
}
.nav-hint {
  font-size: 11px;
  color: var(--color-text-3, #A5AAA5);
  text-align: center;
  margin: 6px 0 0;
}
</style>
