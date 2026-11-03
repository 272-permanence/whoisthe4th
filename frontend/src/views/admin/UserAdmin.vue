<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listAdminUsers, createAdminUser, updateAdminUser, resetAdminUserPassword, type AdminUser } from '../../api/content';

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const errorMsg = ref('');
const showUserForm = ref(false);
const showPwdForm = ref(false);
const editingUser = ref<AdminUser | null>(null);
const pwdTarget = ref<AdminUser | null>(null);

const userForm = ref({ username: '', password: '', role: 'user' as 'admin' | 'user', nickname: '' });
const pwdForm = ref({ password: '' });

async function loadList() {
  loading.value = true; errorMsg.value = '';
  try { users.value = await listAdminUsers(); }
  catch (err: unknown) { errorMsg.value = err instanceof Error ? err.message : '加载失败'; }
  finally { loading.value = false; }
}

function openNew() {
  editingUser.value = null;
  userForm.value = { username: '', password: '', role: 'user', nickname: '' };
  showUserForm.value = true;
}

function openEdit(u: AdminUser) {
  editingUser.value = u;
  userForm.value = { username: u.username, password: '', role: u.role, nickname: u.nickname ?? '' };
  showUserForm.value = true;
}

async function handleSaveUser() {
  errorMsg.value = '';
  if (!userForm.value.username.trim() || (!editingUser.value && !userForm.value.password)) {
    errorMsg.value = editingUser.value ? '用户名必填' : '用户名和密码必填'; return;
  }
  if (userForm.value.password && userForm.value.password.length < 6) {
    errorMsg.value = '密码至少 6 位'; return;
  }
  try {
    if (editingUser.value) {
      await updateAdminUser(editingUser.value.id, {
        nickname: userForm.value.nickname || undefined,
        role: userForm.value.role
      });
    } else {
      await createAdminUser(userForm.value);
    }
    showUserForm.value = false;
    await loadList();
  } catch (err: unknown) { errorMsg.value = err instanceof Error ? err.message : '保存失败'; }
}

async function handleToggleStatus(u: AdminUser) {
  const next = u.status === 'active' ? 'disabled' : 'active';
  if (next === 'disabled' && !confirm(`禁用用户「${u.username}」？`)) return;
  errorMsg.value = '';
  try { await updateAdminUser(u.id, { status: next }); await loadList(); }
  catch (err: unknown) { errorMsg.value = err instanceof Error ? err.message : '操作失败'; }
}

function openResetPwd(u: AdminUser) {
  pwdTarget.value = u;
  pwdForm.value = { password: '' };
  showPwdForm.value = true;
}

async function handleResetPwd() {
  if (!pwdTarget.value) return;
  if (pwdForm.value.password.length < 6) { errorMsg.value = '密码至少 6 位'; return; }
  errorMsg.value = '';
  try { await resetAdminUserPassword(pwdTarget.value.id, pwdForm.value.password); showPwdForm.value = false; }
  catch (err: unknown) { errorMsg.value = err instanceof Error ? err.message : '重置失败'; }
}

onMounted(loadList);
</script>

<template>
  <div class="user-admin">
    <h1>用户管理</h1>
    <div class="toolbar">
      <button class="primary" @click="openNew">+ 新增账号</button>
      <button @click="loadList" :disabled="loading">{{ loading ? '加载中...' : '刷新' }}</button>
    </div>
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

    <table v-if="users.length" class="user-table">
      <thead>
        <tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.id }}</td>
          <td class="name">{{ u.username }}</td>
          <td>{{ u.nickname || '-' }}</td>
          <td><span :class="'tag ' + (u.role === 'admin' ? 'admin' : 'user')">{{ u.role }}</span></td>
          <td><span :class="'tag ' + (u.status === 'active' ? 'ok' : 'off')">{{ u.status === 'active' ? '启用' : '禁用' }}</span></td>
          <td>{{ u.created_at }}</td>
          <td>
            <button @click="openEdit(u)">编辑</button>
            <button @click="handleToggleStatus(u)">{{ u.status === 'active' ? '禁用' : '启用' }}</button>
            <button @click="openResetPwd(u)">重置密码</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="empty">暂无账号</p>

    <!-- 新增/编辑弹窗 -->
    <div v-if="showUserForm" class="modal-mask" @click.self="showUserForm = false">
      <div class="modal">
        <h3>{{ editingUser ? '编辑账号' : '新增账号' }}</h3>
        <label>用户名 <input v-model="userForm.username" :disabled="!!editingUser" /></label>
        <label>密码 <input v-model="userForm.password" type="password" :placeholder="editingUser ? '留空不改' : '至少 6 位'" /></label>
        <label>昵称 <input v-model="userForm.nickname" /></label>
        <label>角色
          <select v-model="userForm.role">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <div class="modal-actions"><button @click="showUserForm = false">取消</button><button class="primary" @click="handleSaveUser">保存</button></div>
      </div>
    </div>

    <!-- 重置密码弹窗 -->
    <div v-if="showPwdForm" class="modal-mask" @click.self="showPwdForm = false">
      <div class="modal">
        <h3>重置「{{ pwdTarget?.username }}」的密码</h3>
        <label>新密码 <input v-model="pwdForm.password" type="password" placeholder="至少 6 位" /></label>
        <div class="modal-actions"><button @click="showPwdForm = false">取消</button><button class="primary" @click="handleResetPwd">确认重置</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-admin h1 { margin: 0 0 16px; font-size: 20px; color: #333; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
.toolbar button { padding: 7px 16px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
.toolbar .primary { background: #667eea; color: #fff; border-color: #667eea; }
.error { background: #fff0f0; color: #d33; padding: 8px 12px; border-radius: 4px; font-size: 13px; margin: 8px 0; }
.user-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; }
.user-table th, .user-table td { padding: 11px 14px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.user-table th { background: #fafafa; color: #555; }
.user-table .name { font-weight: 600; color: #333; }
.user-table button { padding: 4px 10px; border: 1px solid #ddd; background: #fff; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 4px; }
.tag { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.tag.admin { background: #fff3cd; color: #b7791f; }
.tag.user { background: #e6f7f7; color: #2a7; }
.tag.ok { background: #e6f7e6; color: #2a7; }
.tag.off { background: #f5f5f5; color: #999; }
.empty { text-align: center; color: #aaa; padding: 40px 0; }
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: #fff; border-radius: 10px; padding: 24px; width: 420px; max-width: 92vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
.modal h3 { margin: 0 0 16px; }
.modal label { display: block; margin-bottom: 12px; font-size: 13px; color: #555; }
.modal input, .modal select { width: 100%; padding: 8px 10px; margin-top: 4px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.modal-actions button { padding: 8px 18px; border: 1px solid #ddd; background: #fff; border-radius: 5px; cursor: pointer; }
.modal-actions .primary { background: #667eea; color: #fff; border-color: #667eea; }
</style>
