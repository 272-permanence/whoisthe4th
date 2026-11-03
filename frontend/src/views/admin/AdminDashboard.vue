<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listAllContent } from '../../api/content';
import { listProductsApi } from '../../api/product';
import { getCachedUser } from '../../api/auth';

const user = getCachedUser();
const stats = ref({ content: 0, product: 0, published: 0 });
const recentAnnouncements = ref<string[]>([]);

onMounted(async () => {
  try {
    const [contents, products] = await Promise.all([
      listAllContent(),
      listProductsApi().catch(() => [])
    ]);
    stats.value.content = contents.length;
    stats.value.published = contents.filter(c => c.published).length;
    stats.value.product = products.length;
    recentAnnouncements.value = contents
      .filter(c => c.type === 'announcement' && c.published)
      .slice(0, 3)
      .map(c => c.title);
  } catch { /* ignore */ }
});
</script>

<template>
  <div class="dashboard">
    <h1>控制台</h1>
    <p class="welcome">欢迎回来，{{ user?.nickname || user?.username }}！</p>

    <div class="stat-cards">
      <div class="card">
        <div class="card-icon">📝</div>
        <div class="card-info">
          <div class="num">{{ stats.content }}</div>
          <div class="label">总内容数（{{ stats.published }} 已发布）</div>
        </div>
      </div>
      <div class="card">
        <div class="card-icon">🛍️</div>
        <div class="card-info">
          <div class="num">{{ stats.product }}</div>
          <div class="label">商品数</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>最新公告</h2>
      <ul v-if="recentAnnouncements.length" class="announcement-list">
        <li v-for="(a, i) in recentAnnouncements" :key="i">{{ a }}</li>
      </ul>
      <p v-else class="empty">暂无公告</p>
    </div>
  </div>
</template>

<style scoped>
.dashboard h1 { margin: 0 0 4px; font-size: 20px; color: #333; }
.welcome { color: #888; margin: 0 0 20px; font-size: 14px; }
.stat-cards { display: flex; gap: 16px; margin-bottom: 24px; }
.card {
  flex: 1; background: #fff; border-radius: 8px; padding: 20px;
  display: flex; align-items: center; gap: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.card-icon { font-size: 36px; }
.card .num { font-size: 28px; font-weight: 700; color: #667eea; }
.card .label { font-size: 13px; color: #888; margin-top: 2px; }
.section { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.section h2 { margin: 0 0 12px; font-size: 15px; color: #333; }
.announcement-list { margin: 0; padding-left: 18px; }
.announcement-list li { padding: 6px 0; font-size: 14px; color: #555; }
.empty { color: #aaa; font-size: 14px; }
</style>
