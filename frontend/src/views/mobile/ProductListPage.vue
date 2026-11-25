<script setup lang="ts">
/**
 * @file 商品列表页（成员D · 新建）
 * @description 特色商品列表网格 + 分类筛选 + 点击进详情
 * @date 2026-11-25
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showLoadingToast, closeToast, showToast } from 'vant';
import { fetchHomeProducts, type HomeProduct } from '../../api/home';
import { listProductsApi, type Product } from '../../api/product';

const router = useRouter();
const list = ref<(HomeProduct | Product)[]>([]);
const loading = ref(true);
const categories = ['全部', '文创', '纪念', '食品', '票券'];
const activeCat = ref('全部');

async function load() {
  showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
  try {
    // 先试 home 聚合（MySQL），MySQL 没跑自动降级 product API（SQLite）
    const cat = activeCat.value === '全部' ? undefined : activeCat.value;
    try {
      list.value = await fetchHomeProducts(cat);
    } catch {
      // home 挂了 → 降级 product API（SQLite seed 数据恒可用）
      list.value = await listProductsApi(cat);
    }
  } catch (err) {
    showToast((err as Error).message || '商品加载失败');
  } finally {
    closeToast();
    loading.value = false;
  }
}

function goDetail(id: number) {
  router.push(`/products/${id}`);
}

onMounted(load);
</script>

<template>
  <div class="product-list-page">
    <!-- 顶部分类筛选 -->
    <div class="cat-bar">
      <button
        v-for="c in categories"
        :key="c"
        :class="['cat-chip', { 'cat-chip--active': c === activeCat }]"
        type="button"
        @click="activeCat = c; load()"
      >{{ c }}</button>
    </div>

    <!-- 商品网格 -->
    <div v-if="list.length" class="product-grid">
      <div
        v-for="p in list"
        :key="p.id"
        class="product-card"
        @click="goDetail(p.id)"
      >
        <div class="product-card__img">
          <img v-if="p.image_url" :src="p.image_url" :alt="p.name" loading="lazy" />
          <div v-else>🎁</div>
        </div>
        <div class="product-card__body">
          <div class="product-card__name">{{ p.name }}</div>
          <div class="product-card__bottom">
            <span class="product-card__price">¥{{ p.price.toFixed(2) }}</span>
            <span class="product-card__stats" v-if="p.like_count">❤️ {{ p.like_count }}</span>
          </div>
        </div>
      </div>
    </div>
    <van-empty v-else-if="!loading" description="暂无商品" />
  </div>
</template>

<style scoped>
.product-list-page {
  padding: 12px 12px 32px;
  background: var(--color-bg, #F7F6F2);
  min-height: 100vh;
}
.cat-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 12px;
}
.cat-chip {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #E8E8E2);
  background: #FFFFFF;
  color: var(--color-text-2, #7B827D);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-chip--active {
  border-color: var(--color-primary, #526F61);
  background: var(--color-primary, #526F61);
  color: #FFFFFF;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.product-card {
  background: #FFFFFF;
  border: 1px solid var(--color-border, #E8E8E2);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
}
.product-card__img {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #F0EFEA;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  overflow: hidden;
}
.product-card__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-card__body {
  padding: 10px;
}
.product-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #303A35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}
.product-card__bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.product-card__price {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-danger, #C45F55);
}
.product-card__stats {
  font-size: 12px;
  color: var(--color-text-2, #7B827D);
}
</style>
