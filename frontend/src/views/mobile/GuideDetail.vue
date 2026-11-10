<script setup lang="ts">
/**
 * @file 游玩攻略详情页（成员D）
 * @description 路线信息 + 途经 POI 步骤链 + 每个 POI 的停留时长与简介
 * @author 第八组（成员D）
 * @date 2026-11-03
 */
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { fetchRouteDetail, type RouteDetail } from '../../api/guide';
import { trackAutoBind } from '../../utils/track';

const route = useRoute();
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

onMounted(() => {
  load();
  trackAutoBind();
});
</script>

<template>
  <div v-if="detail" class="guide-detail">
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
      </div>
    </van-cell-group>
  </div>
</template>

<style scoped>
.guide-detail {
  padding-bottom: 32px;
}
.route-header {
  background: linear-gradient(135deg, #1989fa, #4db8ff);
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
}

.step-item {
  display: flex;
  gap: 12px;
  padding: 14px 12px;
  border-bottom: 1px solid #f2f3f5;
  position: relative;
}
.step-seq {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #1989fa;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step-body {
  flex: 1;
  min-width: 0;
}
.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.step-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}
.step-cat {
  font-size: 12px;
  color: #969799;
  margin-top: 2px;
}
.step-desc {
  font-size: 13px;
  color: #646566;
  margin-top: 6px;
  line-height: 1.5;
}
.step-loc {
  font-size: 12px;
  color: #969799;
  margin-top: 4px;
}
.step-loc .van-icon {
  margin-right: 2px;
}

.no-steps {
  padding: 16px 0;
}
</style>
