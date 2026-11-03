<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { logout, getCachedUser } from '../../api/auth';
import {
  listProductsApi,
  createProductApi,
  updateProductApi,
  deleteProductApi,
  type Product
} from '../../api/product';

const router = useRouter();
const user = computed(() => getCachedUser());

const products = ref<Product[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editing = ref<Product | null>(null);
const errorMsg = ref('');

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
  form.value = { name: '', description: '', price: 0, stock: 0, category: '', image_url: '' };
  showForm.value = true;
}

function openEdit(p: Product) {
  editing.value = p;
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
  errorMsg.value = '';
  if (!form.value.name.trim()) {
    errorMsg.value = '商品名称必填';
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
    errorMsg.value = err instanceof Error ? err.message : '保存失败';
  }
}

async function handleDelete(p: Product) {
  if (!confirm(`确认删除商品「${p.name}」？`)) return;
  errorMsg.value = '';
  try {
    await deleteProductApi(p.id);
    await loadList();
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '删除失败';
  }
}

function handleLogout() {
  logout();
  router.replace('/login');
}

onMounted(() => { loadList(); });
</script>

<template>
  <div class="admin-page">
    <header class="top-bar">
      <h1>商品管理</h1>
      <div class="user-info">
        <span v-if="user">{{ user.username }}（{{ user.role }}）</span>
        <button @click="handleLogout">退出登录</button>
      </div>
    </header>

    <div class="toolbar">
      <button class="primary" @click="openNew">+ 新建商品</button>
      <button @click="loadList" :disabled="loading">
        {{ loading ? '加载中...' : '刷新' }}
      </button>
    </div>

    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

    <table v-if="products.length" class="product-table">
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
          <td>{{ p.id }}</td>
          <td>
            <div class="name">{{ p.name }}</div>
            <div v-if="p.description" class="desc">{{ p.description }}</div>
          </td>
          <td>{{ p.category || '-' }}</td>
          <td>¥{{ p.price.toFixed(2) }}</td>
          <td>{{ p.stock }}</td>
          <td>
            <span v-if="p.stock === 0" class="tag danger">售罄</span>
            <span v-else-if="p.stock < 10" class="tag warn">库存预警</span>
            <span v-else class="tag ok">充足</span>
          </td>
          <td>{{ p.updated_at }}</td>
          <td>
            <button @click="openEdit(p)">编辑</button>
            <button class="danger" @click="handleDelete(p)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">暂无商品，点「新建商品」创建第一个吧</p>

    <!-- 新建/编辑弹窗 -->
    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal">
        <h3>{{ editing ? '编辑商品' : '新建商品' }}</h3>
        <label>商品名称 <input v-model="form.name" /></label>
        <label>描述 <textarea v-model="form.description" rows="2"></textarea></label>
        <div class="row">
          <label>价格(元) <input type="number" step="0.01" v-model.number="form.price" /></label>
          <label>库存 <input type="number" v-model.number="form.stock" /></label>
        </div>
        <label>分类 <input v-model="form.category" placeholder="如：纪念品/门票" /></label>
        <label>图片URL <input v-model="form.image_url" placeholder="可选" /></label>
        <div class="modal-actions">
          <button @click="showForm = false">取消</button>
          <button class="primary" :disabled="loading" @click="handleSave">
            {{ editing ? '保存修改' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, 'Segoe UI', sans-serif;
}
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #eee;
  padding-bottom: 14px;
  margin-bottom: 20px;
}
.top-bar h1 { margin: 0; font-size: 22px; color: #333; }
.user-info { display: flex; gap: 12px; align-items: center; font-size: 13px; color: #666; }
.user-info button { padding: 6px 12px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
.user-info button:hover { background: #f5f5f5; }
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; }
.toolbar button { padding: 8px 16px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
.toolbar .primary, .modal-actions .primary { background: #667eea; color: #fff; border-color: #667eea; }
.toolbar .primary:hover, .modal-actions .primary:hover { background: #5568d3; }
.error { background: #fff0f0; color: #d33; padding: 8px 12px; border-radius: 4px; margin: 10px 0; font-size: 13px; }
.product-table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.product-table th, .product-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.product-table th { background: #fafafa; color: #555; font-weight: 600; }
.product-table button { padding: 4px 10px; border: 1px solid #ddd; background: #fff; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 4px; }
.product-table button.danger { border-color: #ff8a8a; color: #d33; }
.product-table button.danger:hover { background: #fff0f0; }
.name { font-weight: 600; color: #333; }
.desc { font-size: 12px; color: #888; margin-top: 2px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.tag.ok { background: #e6f7e6; color: #2a7; }
.tag.warn { background: #fff7e6; color: #e90; }
.tag.danger { background: #ffe6e6; color: #d33; }
.empty { text-align: center; color: #aaa; padding: 40px 0; }

/* 弹窗 */
.modal-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  background: #fff; border-radius: 10px; padding: 24px;
  width: 480px; max-width: 92vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.modal h3 { margin: 0 0 16px 0; color: #333; }
.modal label { display: block; margin-bottom: 12px; font-size: 13px; color: #555; }
.modal input, .modal textarea {
  width: 100%; padding: 8px 10px; margin-top: 4px;
  border: 1px solid #ddd; border-radius: 5px; font-size: 14px; box-sizing: border-box;
}
.modal .row { display: flex; gap: 12px; }
.modal .row label { flex: 1; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.modal-actions button { padding: 8px 18px; border: 1px solid #ddd; background: #fff; border-radius: 5px; cursor: pointer; }
</style>
