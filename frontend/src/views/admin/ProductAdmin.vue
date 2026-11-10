<!--
  @file 商品管理后台
  @author 第八组（成员C）
  @date 2026-11-03
-->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  listProductsApi,
  createProductApi,
  updateProductApi,
  deleteProductApi,
  type Product
} from '../../api/product';

const router = useRouter();

const products = ref<Product[]>([]);
const loading = ref(false);
const errorMsg = ref('');
const showForm = ref(false);
const editing = ref<Product | null>(null);

const token = computed(() => localStorage.getItem('auth_token') ?? '');

const form = ref({
  name: '',
  description: '',
  price: 0,
  stock: 0,
  category: '',
  imageUrl: ''
});

async function loadProducts() {
  loading.value = true;
  errorMsg.value = '';
  try {
    products.value = await listProductsApi();
  } catch (err) {
    errorMsg.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', description: '', price: 0, stock: 0, category: '', imageUrl: '' };
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
    imageUrl: p.image_url ?? ''
  };
  showForm.value = true;
}

async function submitForm() {
  if (!form.value.name || form.value.price < 0 || form.value.stock < 0) {
    alert('请检查必填项（名称、价格、库存）');
    return;
  }
  try {
    if (editing.value) {
      await updateProductApi(token.value, editing.value.id, {
        name: form.value.name,
        description: form.value.description,
        price: form.value.price,
        stock: form.value.stock,
        category: form.value.category,
        imageUrl: form.value.imageUrl
      });
    } else {
      await createProductApi(token.value, {
        name: form.value.name,
        description: form.value.description,
        price: form.value.price,
        stock: form.value.stock,
        category: form.value.category,
        imageUrl: form.value.imageUrl
      });
    }
    showForm.value = false;
    await loadProducts();
  } catch (err) {
    alert((err as Error).message);
  }
}

async function removeProduct(id: number) {
  if (!confirm('确定删除这个商品吗？')) return;
  try {
    await deleteProductApi(token.value, id);
    await loadProducts();
  } catch (err) {
    alert((err as Error).message);
  }
}

function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  router.replace('/login');
}

onMounted(loadProducts);
</script>

<template>
  <div class="product-admin">
    <header class="admin-header">
      <h1>商品管理后台</h1>
      <button class="logout-btn" @click="logout">退出登录</button>
    </header>

    <div v-if="errorMsg" class="error-bar">{{ errorMsg }}</div>

    <div class="toolbar">
      <button class="primary-btn" @click="openCreate">+ 新增商品</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <table v-else-if="products.length" class="product-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>名称</th>
          <th>分类</th>
          <th>价格</th>
          <th>库存</th>
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
          <td>{{ p.category ?? '-' }}</td>
          <td>¥{{ p.price.toFixed(2) }}</td>
          <td :class="{ low: p.stock < 10 }">{{ p.stock }}</td>
          <td>
            <button class="link-btn" @click="openEdit(p)">编辑</button>
            <button class="link-btn danger" @click="removeProduct(p.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty">暂无商品，点击上方「新增商品」创建第一个。</div>

    <!-- 表单弹层 -->
    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal">
        <h3>{{ editing ? '编辑商品' : '新增商品' }}</h3>
        <div class="form-row">
          <label>名称 *</label>
          <input v-model="form.name" type="text" />
        </div>
        <div class="form-row">
          <label>描述</label>
          <textarea v-model="form.description" rows="3"></textarea>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label>价格 *</label>
            <input v-model.number="form.price" type="number" min="0" step="0.01" />
          </div>
          <div class="form-row">
            <label>库存 *</label>
            <input v-model.number="form.stock" type="number" min="0" step="1" />
          </div>
        </div>
        <div class="form-row">
          <label>分类</label>
          <input v-model="form.category" type="text" placeholder="如：文创/食品/门票" />
        </div>
        <div class="form-row">
          <label>图片 URL</label>
          <input v-model="form.imageUrl" type="text" />
        </div>

        <div class="modal-actions">
          <button class="secondary-btn" @click="showForm = false">取消</button>
          <button class="primary-btn" @click="submitForm">
            {{ editing ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.product-admin {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.admin-header h1 {
  margin: 0;
  color: #333;
}

.logout-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  color: #666;
}

.logout-btn:hover {
  background: #f5f5f5;
}

.toolbar {
  margin-bottom: 16px;
}

.primary-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.primary-btn:hover {
  opacity: 0.9;
}

.secondary-btn {
  padding: 10px 20px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
}

.error-bar {
  background: #fdecea;
  color: #e74c3c;
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 14px;
}

.loading,
.empty {
  text-align: center;
  padding: 40px;
  color: #888;
}

.product-table {
  width: 100%;
  background: #fff;
  border-collapse: collapse;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.product-table th,
.product-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.product-table th {
  background: #fafafa;
  font-weight: 600;
  color: #555;
  font-size: 13px;
}

.product-table tr:hover {
  background: #fafbff;
}

.name {
  font-weight: 500;
  color: #333;
}

.desc {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

td.low {
  color: #e67e22;
  font-weight: 600;
}

.link-btn {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 13px;
}

.link-btn.danger {
  color: #e74c3c;
}

.link-btn:hover {
  text-decoration: underline;
}

/* 弹层 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 12px;
  padding: 28px;
  width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 20px;
  color: #333;
}

.form-row {
  margin-bottom: 14px;
}

.form-row label {
  display: block;
  font-size: 13px;
  color: #555;
  margin-bottom: 6px;
}

.form-row input,
.form-row textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  font-family: inherit;
}

.form-row input:focus,
.form-row textarea:focus {
  border-color: #667eea;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
</style>
