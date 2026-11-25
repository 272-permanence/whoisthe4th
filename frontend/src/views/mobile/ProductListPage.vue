<script setup lang="ts">
/**
 * @file 商品列表页（成员C 用户端）
 * @description 走 /api/v1/products，展示图片/名称/价格/库存/分类，支持分类筛选
 * @date 2026-11-25
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showLoadingToast, closeToast, showToast } from 'vant';
import { listProductsApi, type Product } from '../../api/product';

const router = useRouter();
const list = ref<Product[]>([]);
const loading = ref(true);
const categories = ['全部', '文创', '纪念', '食品', '票券'];
const activeCat = ref('全部');

async function load() {
  loading.value = true;
  showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
  try {
    const cat = activeCat.value === '全部' ? undefined : activeCat.value;
    list.value = await listProductsApi(cat);
  } catch (err) {
    showToast((err as Error).message || '商品加载失败');
  } finally {
    closeToast();
    loading.value = false;
  }
}

function goDetail(id: number) {
  router.push(`/shop/${id}`);
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
          <div class="product-card__meta">
            <span class="product-card__cat" v-if="p.category">{{ p.category }}</span>
            <span class="product-card__stock">库存 {{ p.stock }}</span>
          </div>
          <div class="product-card__bottom">
            <span class="product-card__price">¥{{ p.price.toFixed(2) }}</span>
          </div>
          <!-- 互动按钮区（预留，埋点由成员B接入；@click.stop 防止触发卡片跳转） -->
          <div class="product-card__actions" @click.stop>
            <button class="act-btn" type="button"><van-icon name="good-job-o" /><span>点赞</span></button>
            <button class="act-btn" type="button"><van-icon name="star-o" /><span>收藏</span></button>
            <button class="act-btn" type="button"><van-icon name="share-o" /><span>分享</span></button>
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
.product-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.product-card__cat {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(82, 111, 97, 0.1);
  color: var(--color-primary, #526F61);
}
.product-card__stock {
  font-size: 11px;
  color: var(--color-text-2, #7B827D);
}
/* 互动按钮区（预留，埋点由成员B接入） */
.product-card__actions {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, #E8E8E2);
}
.act-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 0;
  background: transparent;
  border: none;
  color: var(--color-text-2, #7B827D);
  font-size: 12px;
  cursor: pointer;
}
</style>
