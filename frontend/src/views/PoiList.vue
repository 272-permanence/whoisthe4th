<script setup lang="ts">
/**
 * @file 景点导览列表页
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description 从 /api/v1/poi/list 动态读取景点数据，支持分类筛选、关键词搜索与详情弹窗。
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { listPois, type Poi } from '../api/poi';

const router = useRouter();

/** 分类筛选项，value 与 poi.category 对应 */
const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'landmark', label: '地标' },
  { value: 'attraction', label: '景点' },
  { value: 'facility', label: '服务设施' },
  { value: 'food', label: '美食' }
];

/** 分类中文名，用于卡片角标 */
const CATEGORY_LABELS: Record<string, string> = {
  landmark: '地标',
  attraction: '景点',
  facility: '服务设施',
  food: '美食',
  other: '其他'
};

const pois = ref<Poi[]>([]);
const keyword = ref('');
const activeCategory = ref('');
const loading = ref(false);
const errorMsg = ref('');
const selected = ref<Poi | null>(null);

/**
 * 拉取景点列表
 * @returns Promise<void>
 */
async function loadPois(): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  try {
    pois.value = await listPois({
      category: activeCategory.value || undefined,
      keyword: keyword.value.trim() || undefined
    });
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : '景点加载失败';
  } finally {
    loading.value = false;
  }
}

/**
 * 切换分类后立即重新加载
 * @param value 分类值
 */
function selectCategory(value: string): void {
  if (activeCategory.value === value) return;
  activeCategory.value = value;
  void loadPois();
}

/**
 * 坐标展示
 * @param poi 景点
 * @returns 格式化后的坐标文本
 */
function formatCoordinate(poi: Poi): string {
  if (poi.longitude === null || poi.latitude === null) return '暂无坐标';
  return `${poi.longitude.toFixed(5)}, ${poi.latitude.toFixed(5)}`;
}

/**
 * 跳转到导航页并带上终点
 * @param poi 景点
 */
function goNavigate(poi: Poi): void {
  selected.value = null;
  void router.push({ path: '/navigate', query: { dest: String(poi.id) } });
}

onMounted(() => {
  void loadPois();
});
</script>

<template>
  <div class="poi-page">
    <header class="page-header">
      <div>
        <h1>景点导览</h1>
        <p>西湖景区 POI 由后台统一维护，内容实时生效</p>
      </div>
      <button class="ghost-btn" @click="router.push('/')">返回首页</button>
    </header>

    <div class="toolbar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索景点名称或简介"
          @keyup.enter="loadPois"
        />
        <button class="search-btn" @click="loadPois">搜索</button>
      </div>
      <div class="chips">
        <button
          v-for="item in CATEGORIES"
          :key="item.value"
          :class="['chip', { active: activeCategory === item.value }]"
          @click="selectCategory(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="state error">{{ errorMsg }}</p>
    <p v-else-if="loading" class="state">正在加载景点…</p>
    <p v-else-if="pois.length === 0" class="state">没有匹配的景点，换个关键词试试</p>

    <div v-else class="poi-grid">
      <article
        v-for="poi in pois"
        :key="poi.id"
        class="poi-card"
        @click="selected = poi"
      >
        <div class="card-top">
          <span class="badge">{{ CATEGORY_LABELS[poi.category] ?? poi.category }}</span>
          <span class="coord">{{ formatCoordinate(poi) }}</span>
        </div>
        <h2>{{ poi.name }}</h2>
        <p class="desc">{{ poi.description || '暂无简介' }}</p>
        <p class="location" v-if="poi.location">📍 {{ poi.location }}</p>
        <span class="more">查看详情 →</span>
      </article>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="selected" class="modal-mask" @click.self="selected = null">
      <div class="modal">
        <button class="close-btn" aria-label="关闭" @click="selected = null">✕</button>
        <span class="badge">{{ CATEGORY_LABELS[selected.category] ?? selected.category }}</span>
        <h2>{{ selected.name }}</h2>
        <p class="modal-desc">{{ selected.description || '暂无简介' }}</p>
        <dl class="meta">
          <div>
            <dt>位置</dt>
            <dd>{{ selected.location || '暂无' }}</dd>
          </div>
          <div>
            <dt>坐标</dt>
            <dd>{{ formatCoordinate(selected) }}</dd>
          </div>
        </dl>
        <div class="modal-actions">
          <button class="ghost-btn" @click="selected = null">关闭</button>
          <button
            class="primary-btn"
            :disabled="selected.longitude === null || selected.latitude === null"
            @click="goNavigate(selected)"
          >
            导航前往
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.poi-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 60px;
  color: #e8f3ff;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
}

.page-header p {
  margin: 0;
  color: #8fa9c6;
  font-size: 13px;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 22px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(18, 41, 74, 0.7);
  border: 1px solid rgba(120, 170, 255, 0.18);
  border-radius: 12px;
  padding: 8px 12px;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e8f3ff;
  font-size: 14px;
}

.search-icon {
  opacity: 0.7;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(120, 170, 255, 0.25);
  background: transparent;
  color: #a8c4e6;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.chip.active {
  background: rgba(79, 195, 247, 0.18);
  border-color: #4fc3f7;
  color: #4fc3f7;
}

.search-btn,
.primary-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #1976d2, #4fc3f7);
  color: #04101f;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ghost-btn {
  border: 1px solid rgba(120, 170, 255, 0.3);
  border-radius: 8px;
  padding: 7px 14px;
  background: transparent;
  color: #a8c4e6;
  cursor: pointer;
}

.state {
  padding: 40px 0;
  text-align: center;
  color: #8fa9c6;
}

.state.error {
  color: #ff8a80;
}

.poi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.poi-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 14px;
  background: rgba(15, 33, 58, 0.75);
  border: 1px solid rgba(120, 170, 255, 0.15);
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.poi-card:hover {
  transform: translateY(-2px);
  border-color: rgba(79, 195, 247, 0.5);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #4fc3f7;
  background: rgba(79, 195, 247, 0.12);
}

.coord {
  font-size: 11px;
  color: #6f88a6;
}

.poi-card h2 {
  margin: 0;
  font-size: 18px;
}

.desc {
  margin: 0;
  color: #9fb6d1;
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.location {
  margin: 0;
  font-size: 12px;
  color: #7f97b4;
}

.more {
  margin-top: 4px;
  font-size: 12px;
  color: #4fc3f7;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(3, 8, 16, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}

.modal {
  position: relative;
  width: 100%;
  max-width: 520px;
  padding: 26px;
  border-radius: 16px;
  background: #0d1d33;
  border: 1px solid rgba(120, 170, 255, 0.25);
}

.modal h2 {
  margin: 10px 0 12px;
  font-size: 20px;
}

.modal-desc {
  margin: 0 0 16px;
  color: #9fb6d1;
  font-size: 14px;
  line-height: 1.7;
}

.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 0 0 20px;
}

.meta dt {
  font-size: 12px;
  color: #6f88a6;
}

.meta dd {
  margin: 4px 0 0;
  font-size: 13px;
  color: #cfe3ff;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: transparent;
  color: #7f97b4;
  font-size: 18px;
  cursor: pointer;
}

@media (max-width: 640px) {
  .poi-page {
    padding: 20px 14px 48px;
  }
  .page-header h1 {
    font-size: 22px;
  }
  .poi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
