<script setup lang="ts">
/**
 * @file 失物招领列表页（成员D）
 * @description 遗失/招领 Tab 切换、多条件筛选、卡片列表、上拉加载更多、发布入口
 *              数据来源：后端 /api/v1/lost-found（已完成 CRUD）
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant';
import { getLostFoundList, updateLostFoundStatus, deleteLostFound, type LostFoundItem } from '../../api';

const router = useRouter();

// 当前选中的类型
const activeType = ref<'lost' | 'found' | ''>('');
// 筛选条件
const filters = ref({
  category: '',
  status: '',
  keyword: '',
});

const categoryOptions = [
  { text: '全部', value: '' },
  { text: '证件', value: 'card' },
  { text: '电子设备', value: 'electronics' },
  { text: '钱包', value: 'wallet' },
  { text: '行李', value: 'bag' },
  { text: '其他', value: 'other' },
];

const statusOptions = [
  { text: '全部', value: '' },
  { text: '进行中', value: 'open' },
  { text: '已解决', value: 'resolved' },
];

// 列表数据
const list = ref<LostFoundItem[]>([]);
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const loading = ref(false);
const finished = ref(false);
const showSearch = ref(false);
const searchKeyword = ref('');

// 构建筛选参数
const queryParams = computed(() => {
  const p: Record<string, unknown> = {
    page: page.value,
    size: pageSize,
  };
  if (activeType.value) p.type = activeType.value;
  if (filters.value.category) p.category = filters.value.category;
  if (filters.value.status) p.status = filters.value.status;
  if (filters.value.keyword.trim()) p.keyword = filters.value.keyword.trim();
  return p;
});

// 拉取列表
async function loadList(reset = false) {
  if (loading.value) return;
  loading.value = true;

  if (reset) {
    page.value = 1;
    list.value = [];
    finished.value = false;
  }

  try {
    const res = await getLostFoundList(queryParams.value);
    const newItems = res.list;
    total.value = res.pagination.total;

    if (reset) {
      list.value = newItems;
    } else {
      list.value.push(...newItems);
    }

    if (list.value.length >= total.value) {
      finished.value = true;
    } else {
      page.value += 1;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '加载失败';
    showToast(msg);
  } finally {
    loading.value = false;
  }
}

// Tab 切换
function onTypeChange(type: string | number) {
  activeType.value = (type as string) || '';
  loadList(true);
}

// 重置筛选
function resetFilters() {
  filters.value = { category: '', status: '', keyword: '' };
  loadList(true);
}

// 搜索
function doSearch() {
  filters.value.keyword = searchKeyword.value;
  showSearch.value = false;
  loadList(true);
}

// 发布 → 跳转
function goPublish() {
  router.push('/lost-found/publish');
}

// 详情 / 状态操作
async function markResolved(item: LostFoundItem) {
  try {
    await showConfirmDialog({
      title: '确认',
      message: `确认将 "${item.title}" 标记为已解决？`,
    });
    await updateLostFoundStatus(item.id, 'resolved');
    showToast('已标记为解决');
    loadList(true);
  } catch (_) {
    // 用户取消
  }
}

async function doDelete(item: LostFoundItem) {
  try {
    await showConfirmDialog({
      title: '确认',
      message: `确认删除 "${item.title}"？此操作不可恢复。`,
    });
    await deleteLostFound(item.id);
    showToast('已删除');
    loadList(true);
  } catch (_) {
    // 用户取消
  }
}

function formatTime(t?: string) {
  if (!t) return '';
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

onMounted(() => {
  loadList(true);
});
</script>

<template>
  <div class="lost-found-list">
    <!-- 顶部类型切换 -->
    <van-tabs v-model:active="activeType" sticky offset-top="0" line-width="40">
      <van-tab title="全部" name="" @click="onTypeChange('')" />
      <van-tab title="遗失启事" name="lost" @click="onTypeChange('lost')" />
      <van-tab title="招领启事" name="found" @click="onTypeChange('found')" />
    </van-tabs>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <van-dropdown-menu>
        <van-dropdown-item v-model="filters.category" :options="categoryOptions" title="分类" @change="loadList(true)" />
        <van-dropdown-item v-model="filters.status" :options="statusOptions" title="状态" @change="loadList(true)" />
      </van-dropdown-menu>
      <van-icon name="search" class="search-icon" @click="showSearch = true" />
    </div>

    <!-- 搜索面板 -->
    <van-popup v-model:show="showSearch" position="top" :style="{ height: '100%' }">
      <div class="search-panel">
        <van-search
          v-model="searchKeyword"
          shape="round"
          placeholder="搜索标题/描述/地点"
          autofocus
          @search="doSearch"
        />
      </div>
    </van-popup>

    <!-- 列表 -->
    <van-pull-refresh v-model="refreshing" @refresh="loadList(true)">
      <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="loadList">
        <van-cell-group inset>
          <van-swipe-cell v-for="item in list" :key="item.id">
            <!-- 卡片 -->
            <div class="lf-card" @click="$emit('detail', item)">
              <div v-if="item.image_url" class="lf-card__img">
                <img :src="item.image_url" alt="" />
              </div>
              <div class="lf-card__body">
                <div class="lf-card__title">
                  <van-tag v-if="item.type === 'found'" type="primary" size="medium">招领</van-tag>
                  <van-tag v-else type="danger" size="medium">遗失</van-tag>
                  {{ item.title }}
                </div>
                <div v-if="item.description" class="lf-card__desc">{{ item.description }}</div>
                <div class="lf-card__meta">
                  <span v-if="item.location"><van-icon name="location-o" />{{ item.location }}</span>
                  <span><van-icon name="clock-o" />{{ formatTime(item.created_at) }}</span>
                </div>
                <div v-if="item.status !== 'open'" class="lf-card__status">
                  <van-tag :type="item.status === 'resolved' ? 'success' : 'default'" size="medium">
                    {{ item.status === 'resolved' ? '已解决' : '已过期' }}
                  </van-tag>
                </div>
              </div>
            </div>

            <!-- 右侧滑动操作 -->
            <template #right>
              <van-button
                v-if="item.status === 'open'"
                square
                type="success"
                text="标记解决"
                @click.stop="markResolved(item)"
              />
              <van-button
                square
                type="danger"
                text="删除"
                @click.stop="doDelete(item)"
              />
            </template>
          </van-swipe-cell>
        </van-cell-group>

        <!-- 空状态 -->
        <div v-if="!loading && list.length === 0" class="empty-state">
          <van-empty description="暂无相关失物招领" />
        </div>
      </van-list>
    </van-pull-refresh>

    <!-- 悬浮发布按钮 -->
    <van-button class="publish-fab" round type="primary" icon="plus" @click="goPublish">发布</van-button>
  </div>
</template>

<style scoped>
.lost-found-list {
  padding-bottom: 70px;
}

.publish-fab {
  position: fixed;
  right: 16px;
  bottom: 70px; /* 底部 tabbar(50px) 上方 */
  z-index: 99;
  box-shadow: 0 4px 12px rgba(25, 137, 250, 0.4);
}

.filter-bar {
  display: flex;
  align-items: center;
  background: #fff;
  padding-right: 12px;
  border-bottom: 1px solid #f2f3f5;
}
.filter-bar .search-icon {
  margin-left: auto;
  font-size: 20px;
  color: #646566;
  cursor: pointer;
}

.search-panel {
  padding: 12px;
  background: #f7f8fa;
}

.lf-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
}
.lf-card__img {
  width: 90px;
  height: 90px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f2f3f5;
}
.lf-card__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.lf-card__body {
  flex: 1;
  min-width: 0;
}
.lf-card__title {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lf-card__desc {
  font-size: 13px;
  color: #646566;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lf-card__meta {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #969799;
}
.lf-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.lf-card__status {
  margin-top: 4px;
}

.empty-state {
  padding: 60px 0;
}
</style>
