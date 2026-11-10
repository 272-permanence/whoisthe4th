<script setup lang="ts">
<<<<<<< HEAD
import { ref, onMounted, computed } from 'vue';
import { listAllContent, createContent, updateContent, deleteContent, togglePublishContent, type ContentItem, type ContentType } from '../../api/content';

const TABS: { key: ContentType; label: string }[] = [
  { key: 'carousel', label: '首页轮播' },
  { key: 'announcement', label: '公告' },
  { key: 'scenic', label: '景点' },
  { key: 'route', label: '推荐路线' },
  { key: 'about', label: '关于我们' }
];

const activeTab = ref<ContentType>('carousel');
const list = ref<ContentItem[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editing = ref<ContentItem | null>(null);
const errorMsg = ref('');

const form = ref({
  title: '', subtitle: '', content: '', image_url: '',
  extra_json: '', sort_order: 0, published: true
});

async function loadList() {
  loading.value = true; errorMsg.value = '';
  try {
    list.value = await listAllContent(activeTab.value);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '加载失败';
  } finally { loading.value = false; }
}

function switchTab(tab: ContentType) {
  activeTab.value = tab;
  showForm.value = false;
  loadList();
}

function openNew() {
  editing.value = null;
  form.value = { title: '', subtitle: '', content: '', image_url: '', extra_json: '', sort_order: (list.value.length + 1) * 10, published: true };
  showForm.value = true;
}

function openEdit(c: ContentItem) {
  editing.value = c;
  form.value = {
    title: c.title, subtitle: c.subtitle ?? '',
    content: c.content ?? '', image_url: c.image_url ?? '',
    extra_json: c.extra_json ?? '',
    sort_order: c.sort_order, published: !!c.published
  };
  showForm.value = true;
}

async function handleSave() {
  errorMsg.value = '';
  if (!form.value.title.trim()) { errorMsg.value = '标题必填'; return; }
  try {
    const body: Record<string, unknown> = {
      type: activeTab.value, title: form.value.title,
      subtitle: form.value.subtitle || null, content: form.value.content || null,
      image_url: form.value.image_url || null, sort_order: Number(form.value.sort_order),
      published: form.value.published ? 1 : 0
    };
    if (form.value.extra_json.trim()) {
      try { body.extra_json = JSON.parse(form.value.extra_json); }
      catch { body.extra_json = form.value.extra_json; }
    }
    if (editing.value) {
      await updateContent(editing.value.id, body);
    } else {
      await createContent(body as any);
    }
    showForm.value = false;
    await loadList();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '保存失败';
  }
}

async function handleToggle(c: ContentItem) {
  errorMsg.value = '';
  try { await togglePublishContent(c.id); await loadList(); }
  catch (err: unknown) { errorMsg.value = err instanceof Error ? err.message : '操作失败'; }
}

async function handleDelete(c: ContentItem) {
  if (!confirm(`确认删除「${c.title}」？（将转为未发布状态，可恢复）`)) return;
  errorMsg.value = '';
  try { await deleteContent(c.id); await loadList(); }
  catch (err: unknown) { errorMsg.value = err instanceof Error ? err.message : '删除失败'; }
}

onMounted(loadList);
=======
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
>>>>>>> origin/feature/analytics
</script>

<template>
  <div class="content-admin">
<<<<<<< HEAD
    <h1>内容管理</h1>
    <div class="tabs">
      <button
        v-for="t in TABS" :key="t.key"
        :class="{ active: activeTab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</button>
    </div>

    <div class="toolbar">
      <button class="primary" @click="openNew">+ 新增</button>
      <button @click="loadList" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
    </div>

    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

    <table v-if="list.length" class="content-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>标题</th>
          <th>排序</th>
          <th>状态</th>
          <th>更新时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in list" :key="c.id">
          <td>{{ c.id }}</td>
          <td>
            <div class="title">{{ c.title }}</div>
            <div v-if="c.subtitle" class="sub">{{ c.subtitle }}</div>
          </td>
          <td>{{ c.sort_order }}</td>
          <td>
            <span :class="c.published ? 'tag ok' : 'tag off'">{{ c.published ? '已发布' : '未发布' }}</span>
          </td>
          <td>{{ c.updated_at }}</td>
          <td>
            <button @click="openEdit(c)">编辑</button>
            <button @click="handleToggle(c)">{{ c.published ? '下架' : '上架' }}</button>
            <button class="danger" @click="handleDelete(c)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">暂无 {{ TABS.find(t => t.key === activeTab)?.label }} 内容，点「+ 新增」创建</p>

    <!-- 弹窗 -->
    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal">
        <h3>{{ editing ? '编辑' : '新增' }}「{{ TABS.find(t => t.key === activeTab)?.label }}」</h3>
        <label>标题 * <input v-model="form.title" /></label>
        <label>副标题 <input v-model="form.subtitle" /></label>
        <label>主内容 <textarea v-model="form.content" rows="3"></textarea></label>
        <label>图片 URL <input v-model="form.image_url" placeholder="可选" /></label>
        <div class="row">
          <label>排序值 <input type="number" v-model.number="form.sort_order" /></label>
          <label class="check">
            <input type="checkbox" v-model="form.published" /> 发布
          </label>
        </div>
        <label>扩展字段 (JSON 可选)
          <textarea v-model="form.extra_json" rows="2" placeholder='{"key":"val"}'></textarea>
        </label>
        <div class="modal-actions">
          <button @click="showForm = false">取消</button>
          <button class="primary" @click="handleSave">保存</button>
        </div>
      </div>
    </div>
=======
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
>>>>>>> origin/feature/analytics
  </div>
</template>

<style scoped>
<<<<<<< HEAD
.content-admin h1 { margin: 0 0 16px; font-size: 20px; color: #333; }
.tabs { display: flex; gap: 4px; border-bottom: 2px solid #eee; margin-bottom: 16px; }
.tabs button {
  padding: 10px 18px; background: none; border: none; cursor: pointer;
  font-size: 14px; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.tabs button.active { color: #667eea; border-bottom-color: #667eea; font-weight: 600; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
.toolbar button { padding: 7px 16px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
.toolbar .primary { background: #667eea; color: #fff; border-color: #667eea; }
.error { background: #fff0f0; color: #d33; padding: 8px 12px; border-radius: 4px; font-size: 13px; margin: 8px 0; }
.content-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; }
.content-table th, .content-table td { padding: 11px 14px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.content-table th { background: #fafafa; color: #555; }
.content-table button { padding: 4px 10px; border: 1px solid #ddd; background: #fff; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 4px; }
.content-table button.danger { border-color: #ff8a8a; color: #d33; }
.content-table button.danger:hover { background: #fff0f0; }
.title { font-weight: 600; color: #333; }
.sub { font-size: 12px; color: #888; margin-top: 2px; }
.tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.tag.ok { background: #e6f7e6; color: #2a7; }
.tag.off { background: #f5f5f5; color: #999; }
.empty { text-align: center; color: #aaa; padding: 40px 0; }
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 10px; padding: 24px; width: 520px; max-width: 92vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-height: 88vh; overflow-y: auto; }
.modal h3 { margin: 0 0 16px; }
.modal label { display: block; margin-bottom: 12px; font-size: 13px; color: #555; }
.modal input, .modal textarea { width: 100%; padding: 8px 10px; margin-top: 4px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; box-sizing: border-box; }
.modal .row { display: flex; gap: 12px; }
.modal .row label { flex: 1; }
.modal .check { display: flex; align-items: center; gap: 6px; margin-top: 22px; }
.modal .check input { width: auto; margin-top: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.modal-actions button { padding: 8px 18px; border: 1px solid #ddd; background: #fff; border-radius: 5px; cursor: pointer; }
.modal-actions .primary { background: #667eea; color: #fff; border-color: #667eea; }
=======
.content-admin { padding-bottom: 40px; }
.toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px 8px; background: #fff;
  border-bottom: 1px solid #f2f3f5;
}
.list-wrap { padding-top: 4px; }
.row-actions { display: flex; gap: 4px; align-items: center; }
.form-grid { padding: 8px 0; }
>>>>>>> origin/feature/analytics
</style>
