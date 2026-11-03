<script setup lang="ts">
/**
 * @file 移动端首页（成员D · 接入真实聚合接口）
 * @description Banner / 快捷入口 / 运营统计 / 热门景点 / 推荐路线 / 商品网格（等成员C）
 * @author 第八组（成员D）
 * @date 2026-11-03
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { fetchHome, type HomeResponse } from '../../api/home';

const router = useRouter();

const loading = ref(true);
const banners = ref<HomeResponse['banners']>([]);
const quickEntries = ref<HomeResponse['quickEntries']>([]);
const hotPois = ref<HomeResponse['hotPois']>([]);
const recommendedRoutes = ref<HomeResponse['recommendedRoutes']>([]);
const hotProducts = ref<HomeResponse['hotProducts']>([]);
const stats = ref<HomeResponse['stats']>({
  totalInteractions: 0,
  todayInteractions: 0,
  positiveRate: 0,
});

async function loadHome() {
  showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
  try {
    const data = await fetchHome();
    banners.value = data.banners ?? [];
    quickEntries.value = data.quickEntries ?? [];
    hotPois.value = data.hotPois ?? [];
    recommendedRoutes.value = data.recommendedRoutes ?? [];
    hotProducts.value = data.hotProducts ?? [];
    stats.value = data.stats ?? stats.value;
  } catch (err) {
    showToast((err as Error).message || '首页加载失败');
  } finally {
    closeToast();
    loading.value = false;
  }
}

function go(path: string) {
  // 只允许已注册的路由跳转；其余（/poi /routes）等成员B页面落地后放开
  const knownPaths = ['/home', '/interaction', '/lost-found', '/profile', '/admin/kb', '/qa', '/dashboard', '/routes'];
  if (knownPaths.includes(path)) {
    router.push(path);
  } else {
    showToast(`${path} 页面待队友实现`);
  }
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    landmark: '地标',
    attraction: '景点',
    facility: '服务',
    food: '美食',
    other: '其他',
  };
  return map[cat] ?? cat;
}

onMounted(loadHome);
</script>

<template>
  <div class="home-page">
    <!-- Banner -->
    <van-swipe v-if="banners.length" class="home-banner" :autoplay="3000" show-indicator>
      <van-swipe-item v-for="b in banners" :key="b.id">
        <div class="banner-card" :style="{ background: b.color }">
          <h2>{{ b.title }}</h2>
        </div>
      </van-swipe-item>
    </van-swipe>

    <!-- 运营统计条 -->
    <van-cell-group inset class="stats-bar">
      <div class="stats-item">
        <div class="stats-num">{{ stats.totalInteractions }}</div>
        <div class="stats-label">累计交互</div>
      </div>
      <div class="stats-divider" />
      <div class="stats-item">
        <div class="stats-num">{{ stats.todayInteractions }}</div>
        <div class="stats-label">今日人次</div>
      </div>
      <div class="stats-divider" />
      <div class="stats-item">
        <div class="stats-num">{{ (stats.positiveRate * 100).toFixed(0) }}%</div>
        <div class="stats-label">好评率</div>
      </div>
    </van-cell-group>

    <!-- 快捷入口网格 -->
    <van-grid column-num="4" :border="false" class="quick-grid">
      <van-grid-item
        v-for="q in quickEntries"
        :key="q.path"
        @click="go(q.path)"
      >
        <template #icon>
          <van-icon :name="q.icon" :color="q.color" size="28" />
        </template>
        <template #text>{{ q.label }}</template>
      </van-grid-item>
    </van-grid>

    <!-- 商品推荐 -->
    <van-cell-group inset class="section" v-if="hotProducts.length">
      <van-cell title="商品推荐" is-link>
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <div class="product-grid">
        <div v-for="p in hotProducts" :key="p.id" class="product-card">
          <div class="product-img">🎁</div>
          <div class="product-name">{{ p.name }}</div>
          <div class="product-price">¥{{ p.price }}</div>
        </div>
      </div>
    </van-cell-group>
    <van-cell-group inset class="section" v-else>
      <van-cell title="商品推荐" is-link @click="showToast('商品模块待成员C落地')">
        <template #right-icon><span class="section-more">敬请期待 ›</span></template>
      </van-cell>
    </van-cell-group>

    <!-- 推荐路线 -->
    <van-cell-group inset class="section" v-if="recommendedRoutes.length">
      <van-cell title="推荐路线" is-link>
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <van-cell
        v-for="r in recommendedRoutes"
        :key="r.id"
        :title="r.name"
        :label="`${r.theme} · 约${r.estimated_minutes}分钟`"
        is-link
        @click="showToast('路线详情页待成员B落地')"
      />
    </van-cell-group>

    <!-- 热门景点 -->
    <van-cell-group inset class="section" v-if="hotPois.length">
      <van-cell title="热门景点" is-link>
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <van-cell
        v-for="poi in hotPois"
        :key="poi.id"
        :title="poi.name"
        :label="categoryLabel(poi.category)"
        is-link
        @click="showToast('景点详情页待成员B落地')"
      />
    </van-cell-group>
  </div>
</template>

<style scoped>
.home-page {
  padding-bottom: 20px;
}

.home-banner {
  height: 160px;
}
.banner-card {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.banner-card h2 {
  font-size: 20px;
  font-weight: 600;
}

.stats-bar {
  margin-top: 8px;
  display: flex;
  align-items: center;
  padding: 12px 0;
}
.stats-item {
  flex: 1;
  text-align: center;
}
.stats-num {
  font-size: 20px;
  font-weight: 700;
  color: #1989fa;
}
.stats-label {
  font-size: 12px;
  color: #969799;
  margin-top: 2px;
}
.stats-divider {
  width: 1px;
  height: 28px;
  background: #ebedf0;
}

.quick-grid {
  margin-top: 8px;
  background: #fff;
}

.section {
  margin-top: 12px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 0 12px 12px;
}
.product-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  border: 1px solid #f2f3f5;
}
.product-img {
  font-size: 36px;
  margin-bottom: 6px;
}
.product-name {
  font-size: 13px;
  color: #323233;
  margin-bottom: 4px;
}
.product-price {
  font-size: 14px;
  color: #ee0a24;
  font-weight: 600;
}

.section-more {
  color: #969799;
  font-size: 13px;
}
</style>
