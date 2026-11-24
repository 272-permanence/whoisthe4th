<script setup lang="ts">
/**
 * @file 景点导览列表页
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description 从 /api/v1/poi/list 动态读取景点数据，支持分类筛选、关键词搜索与详情弹窗。
 *              视觉遵循成员D 的《统一 UI 设计规范》：暖白底、墨绿主色、轻边框卡片。
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
      <div class="search-row">
        <div class="search-box">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索景点名称或简介"
            @keyup.enter="loadPois"
          />
        </div>
        <button class="primary-btn" @click="loadPois">搜索</button>
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
        <p class="location" v-if="poi.location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{{ poi.location }}</span>
        </p>
        <span class="more">查看详情 →</span>
      </article>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="selected" class="modal-mask" @click.self="selected = null">
      <div class="modal">
        <button class="close-btn" aria-label="关闭" @click="selected = null">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
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
  min-height: 100vh;
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 60px;
  color: var(--color-text);
  background: var(--color-bg);
  font-family: var(--font-sans);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 6px;
  font-size: 24px;
  color: var(--color-text);
}

.page-header p {
  margin: 0;
  color: var(--color-text-2);
  font-size: 13px;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  height: 36px;
  padding: 0 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s;
}

.search-box:focus-within {
  border-color: var(--color-primary);
}

.search-icon {
  flex: none;
  color: var(--color-text-3);
}

.search-box input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: 14px;
}

.search-box input::placeholder {
  color: var(--color-text-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-2);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.chip.active {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 500;
}

.primary-btn {
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.primary-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ghost-btn {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-2);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.ghost-btn:hover {
  background: var(--color-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.state {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-2);
  font-size: 14px;
}

.state.error {
  color: var(--color-danger);
}

.poi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.poi-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: border-color 0.15s;
}

.poi-card:hover {
  border-color: var(--color-primary);
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
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.coord {
  font-size: 11px;
  color: var(--color-text-3);
}

.poi-card h2 {
  margin: 0;
  font-size: 16px;
  color: var(--color-text);
}

.desc {
  margin: 0;
  color: var(--color-text-2);
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.location {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  color: var(--color-text-3);
}

.location svg {
  flex: none;
}

.more {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-primary);
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 20, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: var(--z-modal-mask, 40);
}

.modal {
  position: relative;
  width: 100%;
  max-width: 520px;
  padding: 24px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
}

.modal h2 {
  margin: 10px 0 12px;
  font-size: 20px;
  color: var(--color-text);
}

.modal-desc {
  margin: 0 0 16px;
  color: var(--color-text-2);
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
  color: var(--color-text-3);
}

.meta dd {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
}

.close-btn:hover {
  color: var(--color-text);
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
