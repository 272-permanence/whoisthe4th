<script setup lang="ts">
/**
 * @file 用户端商品列表页 —— 移动端商城
 * @description 拉公开 GET /api/v1/products，按分类 Tab 切换，点击卡片进详情
 * @author 第八组（成员C）
 * @date 2026-11-25
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { listProductsApi, type Product } from '../../api/product';

const router = useRouter();

const loading = ref(false);
const products = ref<Product[]>([]);
const categories = ref<string[]>([]);
const activeCat = ref<string>('全部');

async function loadProducts(cat?: string) {
  loading.value = true;
  try {
    if (!categories.value.length) {
      showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
    }
    const data = await listProductsApi(cat && cat !== '全部' ? cat : undefined);
    products.value = data;

    // 第一次加载时提取所有分类
    if (!categories.value.length) {
      const cats = new Set<string>();
      for (const p of data) if (p.category) cats.add(p.category);
      categories.value = ['全部', ...Array.from(cats)];
    }
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
    closeToast();
  }
}

function goDetail(id: number) {
  router.push(`/products/${id}`);
}

function formatPrice(p: number) {
  return '¥' + p.toFixed(2);
}

function placeholderImg(name: string) {
  // 商品无图片时用 emoji + 渐变占位
  const emojis: Record<string, string> = {
    文创: '🎨',
    纪念: '🎁',
    食品: '🍬',
    票券: '🎫',
    默认: '🏞️',
  };
  return emojis[name.slice(0, 2)] || emojis['默认'];
}

onMounted(() => loadProducts());
</script>

<template>
  <div class="product-page">
    <!-- 顶部 Banner -->
    <div class="hero-banner">
      <div class="hero-bg"></div>
      <div class="hero-content">
        <h2>景区文创商城</h2>
        <p>把风景带回家 · 正品周边 · 支持学生优惠</p>
      </div>
    </div>

    <!-- 分类 Tab -->
    <div v-if="categories.length" class="cat-tabs">
      <van-tabs v-model:active="activeCat" sticky shrink offset-top="46" @change="loadProducts($event)">
        <van-tab v-for="cat in categories" :key="cat" :title="cat" :name="cat" />
      </van-tabs>
    </div>

    <!-- 商品网格 -->
    <div v-if="!loading && products.length" class="product-grid">
      <div
        v-for="p in products"
        :key="p.id"
        class="product-card"
        @click="goDetail(p.id)"
      >
        <div class="card-img">
          <img
            v-if="p.image_url"
            :src="p.image_url"
            :alt="p.name"
            loading="lazy"
          />
          <template v-else>
            <div class="img-placeholder">{{ placeholderImg(p.category || p.name) }}</div>
          </template>
          <van-tag v-if="p.stock === 0" type="danger" size="medium" round class="soldout-tag">
            售罄
          </van-tag>
        </div>
        <div class="card-body">
          <div class="card-title">{{ p.name }}</div>
          <div class="card-desc" v-if="p.description">{{ p.description }}</div>
          <div class="card-foot">
            <span class="price">{{ formatPrice(p.price) }}</span>
            <span class="stock" v-if="p.stock > 0">库存 {{ p.stock }}</span>
            <span class="stock sold" v-else>已售完</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <van-empty v-else-if="!loading" description="暂无商品" />
  </div>
</template>

<style scoped>
.product-page {
  padding-bottom: 20px;
  min-height: 100%;
  background: #f5f6f8;
}

/* ============ Banner ============ */
.hero-banner {
  position: relative;
  height: 140px;
  overflow: hidden;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%);
}
.hero-content {
  position: relative;
  z-index: 1;
  padding: 32px 20px 0;
  color: #fff;
}
.hero-content h2 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.hero-content p {
  font-size: 12px;
  opacity: 0.9;
}

/* ============ 商品网格 ============ */
.product-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
}
.product-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s;
}
.product-card:active {
  transform: scale(0.97);
}
.card-img {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: #f0f2f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.img-placeholder {
  font-size: 52px;
  background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.soldout-tag {
  position: absolute;
  top: 8px;
  right: 8px;
}
.card-body {
  padding: 10px 12px 12px;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a2420;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-desc {
  font-size: 12px;
  color: #969799;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.price {
  font-size: 16px;
  font-weight: 700;
  color: #ff4d4f;
}
.stock {
  font-size: 11px;
  color: #969799;
}
.stock.sold {
  color: #ff4d4f;
}
</style>
