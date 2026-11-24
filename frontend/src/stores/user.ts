/**
 * @file 用户状态管理（Pinia）—— 成员D
 * @description 管理登录态、token、用户信息、角色
 *              TODO: 等成员C的登录接口出来后，setToken 改为登录成功后调用
 *                    现在先提供占位的 mockLogin/logout 方便联调
 * @author 第八组（成员D）
 * @date 2026-10-27
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type UserRole = 'admin' | 'operator' | 'visitor';

export interface UserInfo {
  id: string;
  username: string;
  displayName?: string;
  role: UserRole;
}

const TOKEN_KEY = 'whoisthe4th_token';
const USER_KEY = 'whoisthe4th_user';

/**
 * 恢复登录用户：兼容模拟登录（whoisthe4th_user）与真实登录（user）
 * 真实登录写入的是 { id, username, nickname, role }，需要转换成 UserInfo
 */
function readStoredUser(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY) || localStorage.getItem('user');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.id === undefined || parsed.username === undefined) return null;
    const role: UserRole = parsed.role === 'admin' || parsed.role === 'operator' ? parsed.role : 'visitor';
    return {
      id: String(parsed.id),
      username: String(parsed.username),
      displayName: typeof parsed.nickname === 'string' ? parsed.nickname : String(parsed.username),
      role,
    };
  } catch {
    return null;
  }
}

export const useUserStore = defineStore('user', () => {
  // 从 localStorage 恢复登录态
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token') || '');
  const userInfo = ref<UserInfo | null>(readStoredUser());

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => userInfo.value?.role === 'admin' || userInfo.value?.role === 'operator');

  /** 设置 token（登录成功后调用） */
  function setToken(t: string) {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
  }

  /** 设置用户信息 */
  function setUserInfo(info: UserInfo) {
    userInfo.value = info;
    localStorage.setItem(USER_KEY, JSON.stringify(info));
  }

  /** 清除登录态 */
  function clearToken() {
    token.value = '';
    userInfo.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /**
   * 占位 mock 登录 —— 等成员C的 /auth/login 出来后替换为真实调用
   * 用法：mockLogin('admin') 模拟管理员登录
   */
  function mockLogin(role: UserRole = 'visitor') {
    const mockUsers: Record<UserRole, UserInfo> = {
      admin: { id: '1', username: 'admin', displayName: '管理员', role: 'admin' },
      operator: { id: '2', username: 'operator', displayName: '运营', role: 'operator' },
      visitor: { id: '3', username: 'visitor', displayName: '游客', role: 'visitor' },
    };
    setToken(`mock-token-${role}-${Date.now()}`);
    setUserInfo(mockUsers[role]);
  }

  function logout() {
    clearToken();
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    isAdmin,
    setToken,
    setUserInfo,
    clearToken,
    mockLogin,
    logout,
  };
});
