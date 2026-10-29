<script setup lang="ts">
/**
 * @file 移动端首页（成员D · 占位骨架）
 * @description Banner / 快捷入口 / 商品网格 / 热门景点
 *              TODO: 等成员C的商品表 + 成员B的 POI 接口出来后，调 /api/v1/home 聚合接口
 *                    当前先用静态占位数据让 TabBar 能正常跳转
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';

const router = useRouter();

// ============ 静态占位数据 ============
const banners = ref([
  { id: 1, title: '欢迎来到西湖景区 AI 导览', color: 'linear-gradient(135deg, #1989fa, #4db8ff)' },
  { id: 2, title: '智慧导览 · 沉浸式体验', color: 'linear-gradient(135deg, #07c160, #65d67c)' },
  { id: 3, title: '语音交互 · 数字人陪伴', color: 'linear-gradient(135deg, #ff976a, #ffc77a)' },
]);

const quickEntries = ref([
  { icon: 'service-o', label: 'AI 导览', path: '/interaction', color: '#1989fa' },
  { icon: 'location-o', label: '景色推荐', path: '/poi', color: '#07c160' },
  { icon: 'guide-o', label: '游玩攻略', path: '/routes', color: '#ff976a' },
  { icon: 'goods-o', label: '失物招领', path: '/lost-found', color: '#7232dd' },
]);

const hotProducts = ref([
  { id: 1, name: '西湖主题文创书签', price: 18 },
  { id: 2, name: '龙井茶叶礼盒装', price: 168 },
  { id: 3, name: '雷峰塔纪念章', price: 28 },
  { id: 4, name: '定制丝巾周边', price: 88 },
]);

const hotPois = ref([
  { id: 1, name: '雷峰塔', category: 'landmark' },
  { id: 2, name: '苏堤春晓', category: 'attraction' },
  { id: 3, name: '白堤断桥', category: 'attraction' },
  { id: 4, name: '灵隐寺', category: 'landmark' },
]);

function go(path: string) {
  // 检查路径是否已注册（routes 里有 /home /interaction /lost-found /profile）
  const knownPaths = ['/home', '/interaction', '/lost-found', '/profile'];
  if (knownPaths.includes(path)) {
    router.push(path);
  } else {
    showToast(`${path} 页面待队友实现`);
  }
}

function productComingSoon() {
  showToast('商品列表待成员C的商品接口');
}

function poiComingSoon() {
  showToast('景点列表待成员B的 POI 接口');
}
</script>

<template>
  <div class="home-page">
    <!-- Banner -->
    <van-swipe class="home-banner" :autoplay="3000" show-indicator>
      <van-swipe-item v-for="b in banners" :key="b.id">
        <div class="banner-card" :style="{ background: b.color }">
          <h2>{{ b.title }}</h2>
        </div>
      </van-swipe-item>
    </van-swipe>

    <!-- 快捷入口网格 -->
    <van-grid column-num="4" :border="false" class="quick-grid">
      <van-grid-item
        v-for="q in quickEntries"
        :key="q.path"
        :icon="q.icon"
        :badge="null"
        @click="go(q.path)"
      >
        <template #icon>
          <van-icon :name="q.icon" :color="q.color" size="28" />
        </template>
        <template #text>{{ q.label }}</template>
      </van-grid-item>
    </van-grid>

    <!-- 商品推荐 -->
    <van-cell-group inset class="section">
      <van-cell title="商品推荐" is-link @click="productComingSoon">
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <div class="product-grid">
        <div v-for="p in hotProducts" :key="p.id" class="product-card" @click="productComingSoon">
          <div class="product-img">🎁</div>
          <div class="product-name">{{ p.name }}</div>
          <div class="product-price">¥{{ p.price }}</div>
        </div>
      </div>
    </van-cell-group>

    <!-- 热门景点 -->
    <van-cell-group inset class="section">
      <van-cell title="热门景点" is-link @click="poiComingSoon">
        <template #right-icon><span class="section-more">更多 ›</span></template>
      </van-cell>
      <van-cell
        v-for="poi in hotPois"
        :key="poi.id"
        :title="poi.name"
        :label="poi.category === 'landmark' ? '地标' : '景点'"
        is-link
        @click="poiComingSoon"
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
