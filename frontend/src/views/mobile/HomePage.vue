<script setup lang="ts">
/**
 * @file 移动端首页（成员D · 扩展：Banner 有图用图 + 商品接 MySQL + 快捷入口导航/商品）
 * @author 第八组（成员D）
 * @date 2026-11-25
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
  const knownPaths = [
    '/home', '/interaction', '/lost-found', '/profile', '/admin/kb',
    '/qa', '/dashboard', '/routes', '/pois', '/navigate', '/products',
  ];
  if (knownPaths.includes(path)) {
    router.push(path);
  } else {
    showToast(`${path} 页面待实现`);
  }
}

function goProduct(id: number) {
  router.push(`/products/${id}`);
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
    <!-- Banner（有图用图，无图用渐变兜底） -->
    <van-swipe v-if="banners.length" class="home-banner" :autoplay="3000" show-indicator>
      <van-swipe-item v-for="b in banners" :key="b.id">
        <div
          v-if="b.image"
          class="banner-card banner-card--img"
          :style="{ backgroundImage: `url(${b.image})` }"
        >
          <h2>{{ b.title }}</h2>
        </div>
        <div
          v-else
          class="banner-card banner-card--color"
          :style="{ background: b.color || 'linear-gradient(135deg, #526F61, #8AA094)' }"
        >
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

    <!-- 快捷入口网格（6 个：AI导览/景色/攻略/导航/失物招领/商品） -->
    <van-grid column-num="6" :border="false" class="quick-grid">
      <van-grid-item
        v-for="q in quickEntries"
        :key="q.path"
        @click="go(q.path)"
      >
        <template #icon>
          <van-icon :name="q.icon" :color="q.color" size="26" />
        </template>
        <template #text>{{ q.label }}</template>
      </van-grid-item>
    </van-grid>

    <!-- 商品推荐（接 MySQL 商品 + 点击进详情） -->
    <van-cell-group inset class="section">
      <van-cell title="特色商品" is-link @click="router.push('/products')">
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <div v-if="hotProducts.length" class="product-grid">
        <div
          v-for="p in hotProducts"
          :key="p.id"
          class="product-card"
          @click="goProduct(p.id)"
        >
          <div class="product-img">
            <img v-if="p.image_url" :src="p.image_url" :alt="p.name" loading="lazy" />
            <span v-else>🎁</span>
          </div>
          <div class="product-name">{{ p.name }}</div>
          <div class="product-bottom">
            <div class="product-price">¥{{ p.price.toFixed(2) }}</div>
            <span class="product-like" v-if="p.like_count">❤️ {{ p.like_count }}</span>
          </div>
        </div>
      </div>
      <van-empty v-else description="暂无商品" />
    </van-cell-group>

    <!-- 推荐路线 -->
    <van-cell-group inset class="section" v-if="recommendedRoutes.length">
      <van-cell title="推荐路线" is-link @click="router.push('/routes')">
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <van-cell
        v-for="r in recommendedRoutes"
        :key="r.id"
        :title="r.name"
        :label="`${r.theme} · 约${r.estimated_minutes}分钟`"
        is-link
        @click="router.push(`/routes/${r.id}`)"
      />
    </van-cell-group>

    <!-- 热门景点 -->
    <van-cell-group inset class="section" v-if="hotPois.length">
      <van-cell title="热门景点" is-link @click="router.push('/pois')">
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <van-cell
        v-for="poi in hotPois"
        :key="poi.id"
        :title="poi.name"
        :label="categoryLabel(poi.category)"
        is-link
        @click="router.push('/pois')"
      />
    </van-cell-group>
  </div>
</template>

<style scoped>
.home-page { padding-bottom: 20px; }

.home-banner { height: 180px; }
.banner-card {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background-size: cover;
  background-position: center;
  position: relative;
}
.banner-card--img::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.45) 100%);
}
.banner-card h2 {
  font-size: 20px;
  font-weight: 600;
  text-shadow: 0 2px 6px rgba(0,0,0,0.4);
  position: relative;
  z-index: 1;
  padding: 0 16px;
  text-align: center;
}

.stats-bar {
  margin-top: 8px;
  display: flex;
  align-items: center;
  padding: 12px 0;
}
.stats-item { flex: 1; text-align: center; }
.stats-num { font-size: 20px; font-weight: 700; color: var(--color-primary, #526F61); }
.stats-label { font-size: 12px; color: var(--color-text-2, #7B827D); margin-top: 2px; }
.stats-divider { width: 1px; height: 28px; background: var(--color-border, #E8E8E2); }

.quick-grid { margin-top: 8px; background: #fff; }

.section { margin-top: 12px; }

.product-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 0 12px 12px;
}
.product-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border, #E8E8E2);
  cursor: pointer;
}
.product-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #F0EFEA;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  overflow: hidden;
}
.product-img img { width: 100%; height: 100%; object-fit: cover; }
.product-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text, #303A35);
  padding: 6px 8px 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px 8px;
}
.product-price { font-size: 14px; font-weight: 700; color: var(--color-danger, #C45F55); }
.product-like { font-size: 11px; color: var(--color-text-2, #7B827D); }

.section-more { color: var(--color-text-2, #7B827D); font-size: 13px; }
</style>
