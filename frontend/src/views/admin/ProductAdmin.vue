<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  listProductsApi,
  createProductApi,
  updateProductApi,
  deleteProductApi,
  type Product
} from '../../api/product';

const products = ref<Product[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editing = ref<Product | null>(null);
const errorMsg = ref('');
/** 表单内联错误（替代原生 alert） */
const formError = ref('');
/** 待确认删除的商品（替代原生 confirm） */
const pendingDelete = ref<Product | null>(null);
const deleting = ref(false);

const form = ref({
  name: '',
  description: '',
  price: 0,
  stock: 0,
  category: '',
  image_url: ''
});

async function loadList() {
  loading.value = true;
  errorMsg.value = '';
  try {
    products.value = await listProductsApi();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function openNew() {
  editing.value = null;
  formError.value = '';
  form.value = { name: '', description: '', price: 0, stock: 0, category: '', image_url: '' };
  showForm.value = true;
}

function openEdit(p: Product) {
  editing.value = p;
  formError.value = '';
  form.value = {
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    stock: p.stock,
    category: p.category ?? '',
    image_url: p.image_url ?? ''
  };
  showForm.value = true;
}

async function handleSave() {
  formError.value = '';
  if (!form.value.name.trim()) {
    formError.value = '商品名称必填';
    return;
  }
  try {
    if (editing.value) {
      await updateProductApi(editing.value.id, form.value);
    } else {
      await createProductApi(form.value);
    }
    showForm.value = false;
    await loadList();
  } catch (err: unknown) {
    formError.value = err instanceof Error ? err.message : '保存失败';
  }
}

/** 打开删除二次确认弹窗 */
function askDelete(p: Product) {
  pendingDelete.value = p;
}

/** 确认删除 */
async function confirmDelete() {
  if (!pendingDelete.value || deleting.value) return;
  deleting.value = true;
  errorMsg.value = '';
  try {
    await deleteProductApi(pendingDelete.value.id);
    pendingDelete.value = null;
    await loadList();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '删除失败';
    pendingDelete.value = null;
  } finally {
    deleting.value = false;
  }
}

onMounted(() => { loadList(); });
</script>

<template>
  <div class="product-admin">
    <div class="page-head">
      <div>
        <h1 class="page-title">商品管理</h1>
        <p class="page-sub">商品的创建、编辑与下架，保存后用户端实时生效</p>
      </div>
      <button class="btn btn-primary" @click="openNew">+ 新建商品</button>
    </div>

    <p v-if="errorMsg" class="error-bar page-error">{{ errorMsg }}</p>

    <div class="table-wrap">
      <div v-if="loading" class="empty-state">加载中...</div>

      <table v-else-if="products.length" class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>分类</th>
            <th>价格</th>
            <th>库存</th>
            <th>库存状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in products" :key="p.id">
            <td class="nums">{{ p.id }}</td>
            <td>
              <div class="name">{{ p.name }}</div>
              <div v-if="p.description" class="desc">{{ p.description }}</div>
            </td>
            <td>{{ p.category || '-' }}</td>
            <td class="nums">¥{{ p.price.toFixed(2) }}</td>
            <td class="nums">{{ p.stock }}</td>
            <td>
              <span v-if="p.stock === 0" class="tag tag-danger">售罄</span>
              <span v-else-if="p.stock < 10" class="tag tag-warn">库存预警</span>
              <span v-else class="tag tag-ok">充足</span>
            </td>
            <td class="nums meta">{{ p.updated_at }}</td>
            <td class="actions">
              <button class="btn btn-text" @click="openEdit(p)">编辑</button>
              <button class="btn btn-danger-text" @click="askDelete(p)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else-if="!loading" class="empty-state">
        暂无商品，点击右上角「新建商品」创建第一个。
      </div>
    </div>

    <!-- 新建/编辑弹窗 -->
    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal">
        <h3 class="modal-title">{{ editing ? '编辑商品' : '新建商品' }}</h3>

        <div class="form-row">
          <label class="label" for="p-name">商品名称 *</label>
          <input id="p-name" v-model="form.name" class="input" type="text" />
        </div>
        <div class="form-row">
          <label class="label" for="p-desc">描述</label>
          <textarea id="p-desc" v-model="form.description" class="input" rows="2"></textarea>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="label" for="p-price">价格（元）*</label>
            <input id="p-price" v-model.number="form.price" class="input" type="number" step="0.01" min="0" />
          </div>
          <div class="form-row">
            <label class="label" for="p-stock">库存 *</label>
            <input id="p-stock" v-model.number="form.stock" class="input" type="number" min="0" />
          </div>
        </div>
        <div class="form-row">
          <label class="label" for="p-category">分类</label>
          <input id="p-category" v-model="form.category" class="input" type="text" placeholder="如：纪念品/门票" />
        </div>
        <div class="form-row">
          <label class="label" for="p-image">图片 URL</label>
          <input id="p-image" v-model="form.image_url" class="input" type="text" placeholder="可选" />
        </div>

        <p v-if="formError" class="error-bar form-error">{{ formError }}</p>

        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showForm = false">取消</button>
          <button class="btn btn-primary" :disabled="loading" @click="handleSave">
            {{ editing ? '保存修改' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除二次确认弹窗 -->
    <div v-if="pendingDelete" class="modal-mask" @click.self="pendingDelete = null">
      <div class="modal confirm-modal">
        <h3 class="modal-title">删除商品</h3>
        <p class="confirm-text">
          确定删除「{{ pendingDelete.name }}」吗？删除后用户端将立即不可见。
        </p>
        <div class="modal-actions">
          <button class="btn btn-secondary" :disabled="deleting" @click="pendingDelete = null">取消</button>
          <button class="btn btn-danger" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 内容页：外壳已提供顶栏与用户区，这里只负责自身内容 */
.product-admin {
  color: var(--color-text);
  font-family: var(--font-sans);
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.page-title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-title);
  font-weight: 600;
}

.page-sub {
  margin: var(--space-1) 0 0;
  font-size: var(--text-caption);
  color: var(--color-text-2);
}

.page-error {
  margin-bottom: var(--space-4);
}

.name {
  font-weight: 500;
}

.desc {
  font-size: var(--text-meta);
  color: var(--color-text-2);
  margin-top: var(--space-1);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: var(--text-meta);
  color: var(--color-text-2);
}

/* 库存状态标签：语义色只用于状态 */
.tag {
  display: inline-block;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-meta);
  line-height: 1.5;
}
.tag-ok {
  background: #e6f4ef;
  color: var(--color-success);
}
.tag-warn {
  background: #faf1e2;
  color: var(--color-warning);
}
.tag-danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.actions {
  white-space: nowrap;
}

/* 弹窗表单 */
.form-row {
  margin-bottom: var(--space-4);
}

.form-error {
  margin-bottom: var(--space-4);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.confirm-modal {
  width: min(400px, 100%);
}

.confirm-text {
  margin: 0;
  font-size: var(--text-body);
  color: var(--color-text-2);
  line-height: 1.6;
}

/* 移动端：表单弹窗单列 */
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .page-head {
    flex-direction: column;
  }
}
</style>
