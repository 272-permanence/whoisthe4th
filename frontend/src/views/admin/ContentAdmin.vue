<script setup lang="ts">
/**
 * @file 内容管理后台（成员C · 代搭，合并成员D 的 POI/路线 CRUD）
 * @description
 *   Tab 1：内容管理（C）—— 首页轮播、公告、景点文案、路线推荐文案、关于我们
 *   Tab 2：POI/路线（D）—— 景点坐标/描述 CRUD、路线途经点 CRUD
 *   图片上传走 C 的 /api/v1/admin/upload（静态托管 /uploads）
 * @author 第八组
 * @date 2026-11-10
 */
import { ref, onMounted } from 'vue';

// ===== 成员C：内容管理（api/content）=====
import {
  listAllContent, createContent, updateContent, deleteContent,
  togglePublishContent, uploadImage, resolveImageUrl,
  type ContentItem, type ContentType
} from '../../api/content';

// ===== 成员D：POI / 路线 CRUD（api/poi + api/routeAdmin）=====
import { showToast, showConfirmDialog } from 'vant';
import { fetchPois, createPoi, updatePoi, deletePoi, type PoiItem } from '../../api/poi';
import { fetchRoutesAdmin, createRoute, updateRoute, deleteRoute, type RouteAdminItem } from '../../api/routeAdmin';

// ================== 顶层：两个大 tab ==================
type TopTab = 'content' | 'poi';
const topTab = ref<TopTab>('content');

// ================== Tab 1：内容管理（成员C）==================
const CONTENT_TABS: { key: ContentType; label: string }[] = [
  { key: 'carousel', label: '首页轮播' },
  { key: 'announcement', label: '公告' },
  { key: 'scenic', label: '景点文案' },
  { key: 'route', label: '路线文案' },
  { key: 'about', label: '关于我们' },
];
const activeContentTab = ref<ContentType>('carousel');
const list = ref<ContentItem[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editing = ref<ContentItem | null>(null);
const errorMsg = ref('');
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const form = ref({
  title: '', subtitle: '', content: '', image_url: '',
  extra_json: '', sort_order: 0, published: true
});

async function loadList() {
  loading.value = true; errorMsg.value = '';
  try {
    list.value = await listAllContent(activeContentTab.value);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '加载失败';
  } finally { loading.value = false; }
}

function switchTab(tab: ContentType) {
  activeContentTab.value = tab;
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
      type: activeContentTab.value, title: form.value.title,
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

function triggerUpload() { fileInput.value?.click(); }

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    errorMsg.value = `不支持的图片类型：${file.type}`;
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    errorMsg.value = '图片不能超过 5MB';
    input.value = '';
    return;
  }
  uploading.value = true;
  errorMsg.value = '';
  try {
    const result = await uploadImage(file);
    form.value.image_url = result.url;
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '上传失败';
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

// ================== Tab 2：POI / 路线 CRUD（成员D）==================
type AdminTab = 'poi' | 'route';
const adminTab = ref<AdminTab>('poi');

// --- POI ---
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

// --- Route ---
const routeList = ref<RouteAdminItem[]>([]);
const showAllRoute = ref(true);
const routeDialog = ref(false);
const editingRoute = ref<RouteAdminItem | null>(null);
const routeForm = ref<Partial<RouteAdminItem>>({ name: '', theme: 'general', description: '', estimated_minutes: 60, status: 1 });

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

onMounted(async () => {
  await loadList();    // C 的内容管理
  await loadPois();    // D 的 POI
  await loadRoutes();  // D 的路线
});
</script>

<template>
  <div class="content-admin">
    <!-- 顶层：两个大 tab -->
    <div class="top-tabs">
      <button :class="{ active: topTab === 'content' }" @click="topTab = 'content'">📰 内容管理</button>
      <button :class="{ active: topTab === 'poi' }" @click="topTab = 'poi'">🗺️ POI / 路线</button>
    </div>

    <!-- ============ Tab 1：内容管理（成员C）============ -->
    <section v-if="topTab === 'content'">
      <div class="sub-tabs">
        <button
          v-for="t in CONTENT_TABS" :key="t.key"
          :class="{ active: activeContentTab === t.key }"
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
            <th>ID</th><th>标题</th><th>排序</th><th>状态</th><th>更新时间</th><th>操作</th>
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
      <p v-else-if="!loading" class="empty">暂无 {{ CONTENT_TABS.find(t => t.key === activeContentTab)?.label }} 内容</p>

      <!-- 弹窗 -->
      <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
        <div class="modal">
          <h3>{{ editing ? '编辑' : '新增' }}「{{ CONTENT_TABS.find(t => t.key === activeContentTab)?.label }}」</h3>
          <label>标题 * <input v-model="form.title" /></label>
          <label>副标题 <input v-model="form.subtitle" /></label>
          <label>主内容 <textarea v-model="form.content" rows="3"></textarea></label>
          <label>
            图片
            <div class="image-field">
              <input v-model="form.image_url" placeholder="/uploads/xxx.jpg 或 https://..." />
              <button type="button" class="upload-btn" :disabled="uploading" @click="triggerUpload">
                {{ uploading ? '上传中...' : '上传图片' }}
              </button>
              <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" style="display: none" @change="handleFileChange" />
            </div>
          </label>
          <div v-if="form.image_url" class="image-preview">
            <img :src="resolveImageUrl(form.image_url)" alt="预览" />
            <button type="button" class="clear-btn" @click="form.image_url = ''">移除</button>
          </div>
          <div class="row">
            <label>排序值 <input type="number" v-model.number="form.sort_order" /></label>
            <label class="check"><input type="checkbox" v-model="form.published" /> 发布</label>
          </div>
          <label>扩展字段 (JSON 可选)<textarea v-model="form.extra_json" rows="2" placeholder='{"key":"val"}'></textarea></label>
          <div class="modal-actions">
            <button @click="showForm = false">取消</button>
            <button class="primary" @click="handleSave">保存</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ Tab 2：POI / 路线 CRUD（成员D）============ -->
    <section v-if="topTab === 'poi'" class="poi-section">
      <div class="sub-tabs">
        <button :class="{ active: adminTab === 'poi' }" @click="adminTab = 'poi'">景点 POI</button>
        <button :class="{ active: adminTab === 'route' }" @click="adminTab = 'route'">游览路线</button>
      </div>

      <!-- POI -->
      <div v-if="adminTab === 'poi'" class="list-wrap">
        <div class="toolbar">
          <button class="primary" @click="openNewPoi">+ 新增景点</button>
          <label class="check"><input type="checkbox" v-model="showAllPoi" @change="loadPois" /> 显示已禁用</label>
          <button @click="loadPois">刷新</button>
        </div>
        <table v-if="poiList.length" class="content-table">
          <thead><tr><th>ID</th><th>名称</th><th>分类</th><th>位置</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="p in poiList" :key="p.id">
              <td>{{ p.id }}</td>
              <td>{{ p.name }}</td>
              <td>{{ p.category }}</td>
              <td>{{ p.location || '-' }}</td>
              <td><span :class="p.status === 1 ? 'tag ok' : 'tag off'">{{ p.status === 1 ? '启用' : '禁用' }}</span></td>
              <td>
                <button @click="openEditPoi(p)">编辑</button>
                <button @click="togglePoiStatus(p)">{{ p.status === 1 ? '禁用' : '启用' }}</button>
                <button class="danger" @click="removePoi(p)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">暂无 POI 数据</p>

        <!-- POI 弹窗 -->
        <div v-if="poiDialog" class="modal-mask" @click.self="poiDialog = false">
          <div class="modal">
            <h3>{{ editingPoi ? '编辑' : '新增' }}景点</h3>
            <label>名称 * <input v-model="poiForm.name" /></label>
            <label>分类
              <select v-model="poiForm.category">
                <option v-for="o in CATEGORY_OPTIONS" :key="o.value" :value="o.value">{{ o.text }}</option>
              </select>
            </label>
            <label>位置 <input v-model="(poiForm.location ?? '') as string" placeholder="如：西湖区龙井路1号" /></label>
            <label>简介 <textarea v-model="(poiForm.description ?? '') as string" rows="3"></textarea></label>
            <div class="modal-actions">
              <button @click="poiDialog = false">取消</button>
              <button class="primary" @click="savePoi">保存</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Route -->
      <div v-if="adminTab === 'route'" class="list-wrap">
        <div class="toolbar">
          <button class="primary" @click="openNewRoute">+ 新增路线</button>
          <label class="check"><input type="checkbox" v-model="showAllRoute" @change="loadRoutes" /> 显示已禁用</label>
          <button @click="loadRoutes">刷新</button>
        </div>
        <table v-if="routeList.length" class="content-table">
          <thead><tr><th>ID</th><th>名称</th><th>主题</th><th>时长</th><th>POI 数</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="r in routeList" :key="r.id">
              <td>{{ r.id }}</td>
              <td>{{ r.name }}</td>
              <td>{{ r.theme }}</td>
              <td>{{ r.estimated_minutes }} 分钟</td>
              <td>{{ r.poi_count ?? 0 }}</td>
              <td><span :class="r.status === 1 ? 'tag ok' : 'tag off'">{{ r.status === 1 ? '启用' : '禁用' }}</span></td>
              <td>
                <button @click="openEditRoute(r)">编辑</button>
                <button @click="toggleRouteStatus(r)">{{ r.status === 1 ? '禁用' : '启用' }}</button>
                <button class="danger" @click="removeRoute(r)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">暂无路线数据</p>

        <!-- Route 弹窗 -->
        <div v-if="routeDialog" class="modal-mask" @click.self="routeDialog = false">
          <div class="modal">
            <h3>{{ editingRoute ? '编辑' : '新增' }}路线</h3>
            <label>名称 * <input v-model="routeForm.name" /></label>
            <label>主题 <input v-model="routeForm.theme" /></label>
            <label>预计分钟数 <input type="number" v-model.number="routeForm.estimated_minutes" /></label>
            <label>简介 <textarea v-model="(routeForm.description ?? '') as string" rows="2"></textarea></label>
            <div class="modal-actions">
              <button @click="routeDialog = false">取消</button>
              <button class="primary" @click="saveRoute">保存</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ========== 顶层 tab ========== */
.top-tabs { display: flex; gap: 0; border-bottom: 2px solid #eee; margin-bottom: 16px; }
.top-tabs button {
  padding: 12px 24px; background: none; border: none; cursor: pointer;
  font-size: 15px; color: #888; border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.top-tabs button.active { color: #667eea; border-bottom-color: #667eea; font-weight: 600; }

/* ========== C 的子 tab ========== */
.sub-tabs { display: flex; gap: 4px; border-bottom: 1px solid #eee; margin-bottom: 16px; flex-wrap: wrap; }
.sub-tabs button {
  padding: 8px 16px; background: none; border: none; cursor: pointer;
  font-size: 13px; color: #888; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.sub-tabs button.active { color: #667eea; border-bottom-color: #667eea; font-weight: 500; }

/* ========== 通用 ========== */
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; }
.toolbar button { padding: 7px 16px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
.toolbar .primary { background: #667eea; color: #fff; border-color: #667eea; }
.toolbar .check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #666; cursor: pointer; }
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

/* ========== 弹窗 ========== */
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 10px; padding: 24px; width: 520px; max-width: 92vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-height: 88vh; overflow-y: auto; }
.modal h3 { margin: 0 0 16px; }
.modal label { display: block; margin-bottom: 12px; font-size: 13px; color: #555; }
.modal input, .modal select, .modal textarea { width: 100%; padding: 8px 10px; margin-top: 4px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; box-sizing: border-box; }
.modal .row { display: flex; gap: 12px; }
.modal .row label { flex: 1; }
.modal .check { display: flex; align-items: center; gap: 6px; margin-top: 22px; }
.modal .check input { width: auto; margin-top: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.modal-actions button { padding: 8px 18px; border: 1px solid #ddd; background: #fff; border-radius: 5px; cursor: pointer; }
.modal-actions .primary { background: #667eea; color: #fff; border-color: #667eea; }

/* ========== 图片上传（C 新增）========== */
.image-field { display: flex; gap: 8px; margin-top: 4px; }
.image-field input { flex: 1; margin-top: 0; }
.upload-btn { padding: 0 14px; border: 1px solid #667eea; background: #fff; color: #667eea; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.upload-btn:hover:not(:disabled) { background: #667eea; color: #fff; }
.upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.image-preview { margin: -6px 0 12px; display: flex; align-items: center; gap: 10px; }
.image-preview img { max-width: 200px; max-height: 100px; border-radius: 6px; border: 1px solid #eee; object-fit: cover; }
.clear-btn { padding: 4px 10px; border: 1px solid #ff8a8a; color: #d33; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.clear-btn:hover { background: #fff0f0; }

.poi-section .list-wrap { padding-top: 8px; }
</style>
