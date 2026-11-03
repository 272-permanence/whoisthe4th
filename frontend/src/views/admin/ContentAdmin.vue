<script setup lang="ts">
/**
 * @file 内容管理后台（成员D · 代搭）
 * @description 管理 POI 和 路线：列表 / 新增 / 编辑 / 上下架 / 删除
 *              当前不校验 JWT（等成员C auth 中间件落地后套上），用 mockLogin('admin') 即可进入
 * @author 第八组（成员D）
 * @date 2026-11-03
 */
import { ref, onMounted } from 'vue';
import { showToast, showConfirmDialog } from 'vant';
import { fetchPois, createPoi, updatePoi, deletePoi, type PoiItem } from '../../api/poi';
import { fetchRoutesAdmin, createRoute, updateRoute, deleteRoute, type RouteAdminItem } from '../../api/routeAdmin';

const activeTab = ref<'poi' | 'route'>('poi');

// ========== POI ==========
const poiList = ref<PoiItem[]>([]);
const showAllPoi = ref(true);
const poiDialog = ref(false);
const editingPoi = ref<PoiItem | null>(null);
const poiForm = ref<Partial<PoiItem>>({ name: '', category: 'attraction', description: '', location: '', status: 1 });

const CATEGORY_OPTIONS: { text: string; value: string }[] = [
  { text: '景点', value: 'attraction' },
  { text: '地标', value: 'landmark' },
  { text: '服务设施', value: 'facility' },
  { text: '餐饮', value: 'food' },
  { text: '其他', value: 'other' },
];

async function loadPois() {
  try { poiList.value = await fetchPois(showAllPoi.value); } catch (err) { showToast((err as Error).message); }
}
function openNewPoi() {
  editingPoi.value = null;
  poiForm.value = { name: '', category: 'attraction', description: '', location: '', status: 1 };
  poiDialog.value = true;
}
function openEditPoi(p: PoiItem) {
  editingPoi.value = p;
  poiForm.value = { ...p };
  poiDialog.value = true;
}
async function savePoi() {
  if (!poiForm.value.name?.trim()) { showToast('名称必填'); return; }
  try {
    if (editingPoi.value) {
      await updatePoi(editingPoi.value.id, poiForm.value);
      showToast('保存成功');
    } else {
      await createPoi(poiForm.value);
      showToast('新增成功');
    }
    poiDialog.value = false;
    await loadPois();
  } catch (err) { showToast((err as Error).message); }
}
async function togglePoiStatus(p: PoiItem) {
  const newStatus = p.status === 1 ? 0 : 1;
  try { await updatePoi(p.id, { status: newStatus }); await loadPois(); } catch (err) { showToast((err as Error).message); }
}
async function removePoi(p: PoiItem) {
  try { await showConfirmDialog({ title: '确认', message: `确定删除"${p.name}"？（软删除）` }); } catch { return; }
  try { await deletePoi(p.id); showToast('已删除'); await loadPois(); } catch (err) { showToast((err as Error).message); }
}

// ========== Route ==========
const routeList = ref<RouteAdminItem[]>([]);
const showAllRoute = ref(true);
const routeDialog = ref(false);
const editingRoute = ref<RouteAdminItem | null>(null);
const routeForm = ref<Partial<RouteAdminItem>>({ name: '', theme: 'general', description: '', estimated_minutes: 60, status: 1 });

// THEME_OPTIONS reserved for future use (currently free text input)
// const THEME_OPTIONS = ...;

async function loadRoutes() {
  try { routeList.value = await fetchRoutesAdmin(showAllRoute.value); } catch (err) { showToast((err as Error).message); }
}
function openNewRoute() {
  editingRoute.value = null;
  routeForm.value = { name: '', theme: 'general', description: '', estimated_minutes: 60, status: 1 };
  routeDialog.value = true;
}
function openEditRoute(r: RouteAdminItem) {
  editingRoute.value = r;
  routeForm.value = { ...r };
  routeDialog.value = true;
}
async function saveRoute() {
  if (!routeForm.value.name?.trim()) { showToast('名称必填'); return; }
  try {
    if (editingRoute.value) {
      await updateRoute(editingRoute.value.id, routeForm.value);
      showToast('保存成功');
    } else {
      await createRoute(routeForm.value);
      showToast('新增成功');
    }
    routeDialog.value = false;
    await loadRoutes();
  } catch (err) { showToast((err as Error).message); }
}
async function toggleRouteStatus(r: RouteAdminItem) {
  const newStatus = r.status === 1 ? 0 : 1;
  try { await updateRoute(r.id, { status: newStatus }); await loadRoutes(); } catch (err) { showToast((err as Error).message); }
}
async function removeRoute(r: RouteAdminItem) {
  try { await showConfirmDialog({ title: '确认', message: `确定删除"${r.name}"？（软删除）` }); } catch { return; }
  try { await deleteRoute(r.id); showToast('已删除'); await loadRoutes(); } catch (err) { showToast((err as Error).message); }
}

// refresh 函数预留，暂未调用

onMounted(async () => { await loadPois(); await loadRoutes(); });
</script>

<template>
  <div class="content-admin">
    <van-sticky>
      <van-tabs v-model:active="activeTab" sticky>
        <van-tab title="景点 POI" name="poi" />
        <van-tab title="游览路线" name="route" />
      </van-tabs>
    </van-sticky>

    <!-- ============ POI 列表 ============ -->
    <div v-if="activeTab === 'poi'" class="list-wrap">
      <div class="toolbar">
        <van-button size="small" type="primary" @click="openNewPoi">+ 新增景点</van-button>
        <van-checkbox v-model="showAllPoi" shape="square" @change="loadPois">显示已禁用</van-checkbox>
        <van-button size="small" plain @click="loadPois">刷新</van-button>
      </div>
      <van-cell-group inset>
        <van-cell v-for="p in poiList" :key="p.id" :title="p.name" :label="`${p.category}${p.location ? ' · ' + p.location : ''}`">
          <template #right-icon>
            <div class="row-actions">
              <van-tag :type="p.status === 1 ? 'success' : 'default'" size="medium">{{ p.status === 1 ? '启用' : '禁用' }}</van-tag>
              <van-button size="mini" type="primary" plain @click="openEditPoi(p)">编辑</van-button>
              <van-button size="mini" :type="p.status === 1 ? 'warning' : 'success'" plain @click="togglePoiStatus(p)">{{ p.status === 1 ? '禁用' : '启用' }}</van-button>
              <van-button size="mini" type="danger" plain @click="removePoi(p)">删除</van-button>
            </div>
          </template>
        </van-cell>
        <van-empty v-if="poiList.length === 0" description="暂无数据，点左上角新增" />
      </van-cell-group>
    </div>

    <!-- ============ 路线列表 ============ -->
    <div v-if="activeTab === 'route'" class="list-wrap">
      <div class="toolbar">
        <van-button size="small" type="primary" @click="openNewRoute">+ 新增路线</van-button>
        <van-checkbox v-model="showAllRoute" shape="square" @change="loadRoutes">显示已禁用</van-checkbox>
        <van-button size="small" plain @click="loadRoutes">刷新</van-button>
      </div>
      <van-cell-group inset>
        <van-cell v-for="r in routeList" :key="r.id" :title="r.name" :label="`${r.theme} · ${r.estimated_minutes}分钟 · ${r.poi_count}个景点`">
          <template #right-icon>
            <div class="row-actions">
              <van-tag :type="r.status === 1 ? 'success' : 'default'" size="medium">{{ r.status === 1 ? '启用' : '禁用' }}</van-tag>
              <van-button size="mini" type="primary" plain @click="openEditRoute(r)">编辑</van-button>
              <van-button size="mini" :type="r.status === 1 ? 'warning' : 'success'" plain @click="toggleRouteStatus(r)">{{ r.status === 1 ? '禁用' : '启用' }}</van-button>
              <van-button size="mini" type="danger" plain @click="removeRoute(r)">删除</van-button>
            </div>
          </template>
        </van-cell>
        <van-empty v-if="routeList.length === 0" description="暂无数据，点左上角新增" />
      </van-cell-group>
    </div>

    <!-- ============ POI 编辑弹窗 ============ -->
    <van-dialog v-model:show="poiDialog" title="编辑景点" show-cancel-button @confirm="savePoi">
      <div class="form-grid">
        <van-field v-model="poiForm.name" label="名称" placeholder="必填" />
        <van-field v-model="poiForm.category" label="分类" is-link readonly :placeholder="poiForm.category">
          <template #input>
            <van-picker
              :columns="CATEGORY_OPTIONS"
              :show="false"
              @confirm="(v: { selectedValues: string[] }) => (poiForm.category = v.selectedValues[0])"
            />
          </template>
        </van-field>
        <van-field v-model="(poiForm.location ?? '') as string" label="位置" placeholder="可选" />
        <van-field v-model="(poiForm.description ?? '') as string" label="简介" type="textarea" rows="3" autosize placeholder="可选" />
      </div>
    </van-dialog>

    <!-- ============ 路线编辑弹窗 ============ -->
    <van-dialog v-model:show="routeDialog" title="编辑路线" show-cancel-button @confirm="saveRoute">
      <div class="form-grid">
        <van-field v-model="routeForm.name" label="名称" placeholder="必填" />
        <van-field v-model="routeForm.theme" label="主题" />
        <van-field v-model.number="routeForm.estimated_minutes" label="预计分钟数" type="number" />
        <van-field v-model="(routeForm.description ?? '') as string" label="简介" type="textarea" rows="2" autosize placeholder="可选" />
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.content-admin { padding-bottom: 40px; }
.toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px 8px; background: #fff;
  border-bottom: 1px solid #f2f3f5;
}
.list-wrap { padding-top: 4px; }
.row-actions { display: flex; gap: 4px; align-items: center; }
.form-grid { padding: 8px 0; }
</style>
