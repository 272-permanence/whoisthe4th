<script setup lang="ts">
/**
 * @file 游玩攻略列表页（成员D）
 * @description 路线卡片列表，按 theme 筛选，点击进详情
 * @author 第八组（成员D）
 * @date 2026-11-03
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { fetchRoutes, type RouteSummary } from '../../api/guide';

const router = useRouter();
const routes = ref<RouteSummary[]>([]);
const loading = ref(true);

const themeMap: Record<string, string> = {
  history: '历史文化',
  nature: '自然风光',
  family: '亲子出游',
  food: '美食寻味',
  general: '通用',
};

async function load() {
  showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
  try {
    routes.value = await fetchRoutes();
  } catch (err) {
    showToast((err as Error).message || '路线加载失败');
  } finally {
    closeToast();
    loading.value = false;
  }
}

function goDetail(id: number) {
  router.push(`/routes/${id}`);
}

onMounted(load);
</script>

<template>
  <div class="guide-list">
    <van-empty v-if="!loading && routes.length === 0" description="暂无路线" />

    <van-cell-group inset class="route-group" v-else>
      <div
        v-for="r in routes"
        :key="r.id"
        class="route-card"
        @click="goDetail(r.id)"
      >
        <div class="route-head">
          <span class="route-name">{{ r.name }}</span>
          <van-tag type="primary" plain size="medium">{{ themeMap[r.theme] ?? r.theme }}</van-tag>
        </div>
        <div class="route-desc" v-if="r.description">{{ r.description }}</div>
        <div class="route-meta">
          <span><van-icon name="clock-o" /> 约{{ r.estimated_minutes }}分钟</span>
          <span><van-icon name="location-o" /> {{ r.poi_count }}个景点</span>
          <span class="route-arrow">查看详情 ›</span>
        </div>
      </div>
    </van-cell-group>
  </div>
</template>

<style scoped>
.guide-list {
  padding: 8px 0 24px;
}
.route-group {
  background: transparent;
}
.route-card {
  background: #fff;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.route-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.route-name {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}
.route-desc {
  font-size: 13px;
  color: #646566;
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.route-meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #969799;
  align-items: center;
}
.route-meta .van-icon {
  margin-right: 2px;
}
.route-arrow {
  margin-left: auto;
  color: #1989fa;
  font-size: 13px;
}
</style>
