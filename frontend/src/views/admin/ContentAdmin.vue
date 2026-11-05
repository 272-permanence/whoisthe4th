<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listAllContent, createContent, updateContent, deleteContent, togglePublishContent, uploadImage, resolveImageUrl, type ContentItem, type ContentType } from '../../api/content';

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
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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

function triggerUpload() {
  fileInput.value?.click();
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  // 前端粗校验：类型 + 大小（5MB）
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
    input.value = ''; // 允许连续选同一文件
  }
}

onMounted(loadList);
</script>

<template>
  <div class="content-admin">
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
        <label>
          图片
          <div class="image-field">
            <input v-model="form.image_url" placeholder="/uploads/xxx.jpg 或 https://..." />
            <button type="button" class="upload-btn" :disabled="uploading" @click="triggerUpload">
              {{ uploading ? '上传中...' : '上传图片' }}
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style="display: none"
              @change="handleFileChange"
            />
          </div>
        </label>
        <div v-if="form.image_url" class="image-preview">
          <img :src="resolveImageUrl(form.image_url)" alt="预览" />
          <button type="button" class="clear-btn" @click="form.image_url = ''">移除</button>
        </div>
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
  </div>
</template>

<style scoped>
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
.image-field { display: flex; gap: 8px; margin-top: 4px; }
.image-field input { flex: 1; margin-top: 0; }
.upload-btn { padding: 0 14px; border: 1px solid #667eea; background: #fff; color: #667eea; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.upload-btn:hover:not(:disabled) { background: #667eea; color: #fff; }
.upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.image-preview { margin: -6px 0 12px; display: flex; align-items: center; gap: 10px; }
.image-preview img { max-width: 200px; max-height: 100px; border-radius: 6px; border: 1px solid #eee; object-fit: cover; }
.clear-btn { padding: 4px 10px; border: 1px solid #ff8a8a; color: #d33; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.clear-btn:hover { background: #fff0f0; }
</style>
