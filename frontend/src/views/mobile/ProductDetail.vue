<script setup lang="ts">
/**
 * @file 商品详情页（成员C 用户端）
 * @description 走 /api/v1/products/:id，展示名称/价格/库存/描述/图片
 * @date 2026-11-25
 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast } from 'vant';
import { getProductApi, type Product } from '../../api/product';

const route = useRoute();
const router = useRouter();
const product = ref<Product | null>(null);
const loading = ref(true);

async function load() {
  showLoadingToast({ message: '加载中...', forbidClick: true, duration: 0 });
  try {
    const id = Number(route.params.id);
    product.value = await getProductApi(id);
  } catch (err) {
    showToast((err as Error).message || '商品加载失败');
  } finally {
    closeToast();
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="product-detail" v-if="product?.name">
    <!-- 返回按钮 -->
    <button class="back-btn" type="button" @click="router.back()">
      <van-icon name="arrow-left" /> 返回
    </button>

    <!-- 商品图 -->
    <div class="product-image">
      <img
        v-if="product.image_url"
        :src="product.image_url"
        :alt="product.name"
        loading="lazy"
      />
      <div v-else class="product-image__placeholder">🎁</div>
    </div>

    <!-- 商品信息 -->
    <div class="product-info">
      <h1 class="product-name">{{ product.name }}</h1>
      <div class="product-meta">
        <van-tag v-if="product.category" type="primary" plain size="medium">{{ product.category }}</van-tag>
        <span class="product-stock" v-if="product.stock !== undefined">库存 {{ product.stock }}</span>
      </div>
      <p class="product-desc" v-if="product.description">{{ product.description }}</p>
    </div>

    <!-- 价格 -->
    <div class="product-price-row">
      <div class="product-price">¥{{ product.price.toFixed(2) }}</div>
    </div>

    <!-- 底部操作栏：点赞 / 收藏 / 分享（预留静态按钮，埋点由成员B接入） -->
    <footer class="product-footer">
      <button class="footer-btn" type="button">
        <van-icon name="good-job-o" />
        <span>{{ product.like_count ?? 0 }}</span>
        <small>点赞</small>
      </button>

      <button class="footer-btn" type="button">
        <van-icon name="star-o" />
        <span>{{ product.favorite_count ?? 0 }}</span>
        <small>收藏</small>
      </button>

      <button class="footer-btn" type="button">
        <van-icon name="share-o" />
        <small>分享</small>
      </button>

      <div class="footer-buy">
        <van-button type="primary" block :disabled="!product.stock || product.stock <= 0">
          立即购买
        </van-button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.product-detail {
  padding-bottom: 80px;
  min-height: 100vh;
  background: var(--color-bg, #F7F6F2);
}

.back-btn {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  width: fit-content;
  background: transparent;
  border: none;
  color: var(--color-primary, #526F61);
  font-size: 14px;
  cursor: pointer;
}

.product-image {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #F0EFEA;
  overflow: hidden;
}
.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-image__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80px;
}

.product-info {
  padding: 16px;
}
.product-name {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, #303A35);
}
.product-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.product-stock {
  font-size: 13px;
  color: var(--color-text-2, #7B827D);
}
.product-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-2, #7B827D);
  margin: 0;
  white-space: pre-wrap;
}

.product-price-row {
  padding: 0 16px 12px;
}
.product-price {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-danger, #C45F55);
}

/* 底部操作栏 */
.product-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: #FFFFFF;
  border-top: 1px solid var(--color-border, #E8E8E2);
}
.footer-btn {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 56px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  color: var(--color-text-2, #7B827D);
  font-size: 18px;
  cursor: pointer;
  transition: color 0.2s;
}
.footer-btn span {
  font-size: 12px;
  font-weight: 600;
}
.footer-btn small {
  font-size: 10px;
}
.footer-btn--active {
  color: var(--color-primary, #526F61);
}
.footer-buy {
  flex: 1;
}
</style>
