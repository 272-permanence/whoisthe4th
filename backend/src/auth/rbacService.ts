/**
 * @file RBAC 权限服务：授权聚合、角色/权限管理、进程内权限缓存
 * @author 第八组（成员C）
 * @date 2026-10-27
 * @description 落地禅道（ZenTao）权限模型：
 *              - authorize()   对应禅道 userModel::authorize()：
 *                              一次 JOIN 把用户所有角色的权限点聚合并集，缓存起来；
 *              - checkPriv()   对应禅道 commonModel::hasPriv()：
 *                              管理员短路 + 内存查表，不打数据库；
 *              - 权限变更函数（updateRolePrivs / assignRole / unassignRole / deleteRole）
 *                              对应禅道 groupModel 的 updatePrivByGroup / updateUser / remove，
 *                              变更后调用 invalidate() 使缓存失效（禅道是重算 session，
 *                              Express 无 session，改为带 TTL 的进程内缓存）。
 *              表结构见 backend/sql/rbac.sql。
 */
import { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { getDbPool } from '../utils/db.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('rbac');

/** 权限缓存 TTL：禅道靠 session 持有权限直到下次变更重算，这里用短 TTL 兜底 */
const CACHE_TTL_MS = 60_000;

/** 权限点，module:method 粒度（对应禅道 zt_grouppriv 的一行） */
export interface PrivPoint {
  module: string;
  method: string;
}

/** 单个账号的授权上下文（对应禅道 authorize() 返回的 rights + admin 标记） */
export interface AuthContext {
  account: string;
  /** 是否超级管理员：true 时所有 hasPriv 直接放行（对应禅道 $app->user->admin） */
  admin: boolean;
  /** rights[module][method] === true 表示有权限，键全小写（禅道同款规范） */
  rights: Record<string, Record<string, true>>;
}

interface PrivRow extends RowDataPacket {
  is_admin: number;
  module: string | null;
  method: string | null;
}

/** 进程内权限缓存：account -> { ctx, expireAt } */
const cache = new Map<string, { ctx: AuthContext; expireAt: number }>();

/**
 * 授权聚合：查出账号的全部权限点并缓存（对应禅道 userModel::authorize 的 JOIN 聚合）
 * SQL 逻辑与禅道一致：user_role JOIN role JOIN role_priv，权限取多角色并集
 * @param account 用户账号
 * @returns 授权上下文（含 admin 标记与权限并集）
 */
export async function authorize(account: string): Promise<AuthContext> {
  const cached = cache.get(account);
  if (cached && cached.expireAt > Date.now()) return cached.ctx;

  const [rows] = await getDbPool().query<PrivRow[]>(
    `SELECT r.is_admin, p.module, p.method
       FROM t_user_role ur
       JOIN t_role r        ON r.id = ur.role_id
       LEFT JOIN t_role_priv p ON p.role_id = r.id
      WHERE ur.account = ?`,
    [account]
  );

  const ctx: AuthContext = { account, admin: false, rights: {} };
  for (const row of rows) {
    if (row.is_admin === 1) ctx.admin = true;
    if (row.module && row.method) {
      const mod = row.module.toLowerCase();
      (ctx.rights[mod] ??= {})[row.method.toLowerCase()] = true;
    }
  }

  cache.set(account, { ctx, expireAt: Date.now() + CACHE_TTL_MS });
  return ctx;
}

/**
 * 权限校验：管理员短路 + 内存查表（对应禅道 commonModel::hasPriv）
 * @param ctx    authorize() 返回的授权上下文
 * @param module 模块名，如 'kb'
 * @param method 操作名，如 'upload'
 */
export function checkPriv(ctx: AuthContext, module: string, method: string): boolean {
  if (ctx.admin) return true; // 超管短路（禅道：strpos(admins, account) !== false 直接放行）
  const mod = ctx.rights[module.toLowerCase()];
  if (!mod) return false;
  return mod['*'] === true || mod[method.toLowerCase()] === true; // '*' = 该模块全部操作
}

/** 使指定账号的权限缓存失效；不传 account 则全量失效（角色权限变更时调用） */
export function invalidate(account?: string): void {
  if (account === undefined) cache.clear();
  else cache.delete(account);
}

// ========================== 角色管理（对应禅道 group 模块） ==========================

/**
 * 创建角色
 * @returns 新角色 id
 */
export async function createRole(code: string, name: string, description = '', isAdmin = false): Promise<number> {
  const [res] = await getDbPool().execute<ResultSetHeader>(
    'INSERT INTO t_role (code, name, description, is_admin) VALUES (?, ?, ?, ?)',
    [code, name, description, isAdmin ? 1 : 0]
  );
  invalidate();
  log.INFO(`角色已创建 id=${res.insertId} code=${code}`);
  return res.insertId;
}

/**
 * 删除角色：连带清理用户关联与权限点（对应禅道 groupModel::remove 的连带删除；
 * 外键 ON DELETE CASCADE 兜底，这里显式删是为了语义清晰）
 */
export async function deleteRole(roleId: number): Promise<void> {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM t_user_role WHERE role_id = ?', [roleId]);
    await conn.execute('DELETE FROM t_role_priv WHERE role_id = ?', [roleId]);
    await conn.execute('DELETE FROM t_role WHERE id = ?', [roleId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  invalidate();
  log.INFO(`角色已删除 id=${roleId}`);
}

/**
 * 全量重设角色权限点：先删后插（对应禅道 groupModel::updatePrivByGroup 的
 * DELETE 旧权限 -> 逐条 INSERT 的流程，这里合并为一次批量插入）
 * @param roleId 角色 id
 * @param privs  权限点列表
 */
export async function updateRolePrivs(roleId: number, privs: PrivPoint[]): Promise<void> {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM t_role_priv WHERE role_id = ?', [roleId]);
    if (privs.length > 0) {
      const values = privs.map((p) => [roleId, p.module.toLowerCase(), p.method.toLowerCase()]);
      await conn.query('INSERT INTO t_role_priv (role_id, module, method) VALUES ?', [values]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  invalidate(); // 角色权限变化影响该角色下所有用户，全量失效
  log.INFO(`角色权限已重设 roleId=${roleId} 共 ${privs.length} 个权限点`);
}

/**
 * 给用户授权角色（对应禅道 groupModel::updateUser 中的 INSERT zt_usergroup）
 * 重复授权由 UNIQUE(account, role_id) 兜底忽略
 */
export async function assignRole(account: string, roleId: number): Promise<void> {
  await getDbPool().execute(
    'INSERT IGNORE INTO t_user_role (account, role_id) VALUES (?, ?)',
    [account, roleId]
  );
  invalidate(account); // 对应禅道对受影响用户重跑 authorize()
}

/** 移除用户的某个角色（对应禅道 updateUser 中的 DELETE zt_usergroup） */
export async function unassignRole(account: string, roleId: number): Promise<void> {
  await getDbPool().execute('DELETE FROM t_user_role WHERE account = ? AND role_id = ?', [account, roleId]);
  invalidate(account);
}

// ========================== 查询接口（管理后台用） ==========================

export interface RoleRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  description: string;
  is_admin: number;
}

/** 列出全部角色 */
export async function listRoles(): Promise<RoleRow[]> {
  const [rows] = await getDbPool().query<RoleRow[]>(
    'SELECT id, code, name, description, is_admin FROM t_role ORDER BY id'
  );
  return rows;
}

/** 列出某角色的权限点 */
export async function listRolePrivs(roleId: number): Promise<PrivPoint[]> {
  const [rows] = await getDbPool().query<(RowDataPacket & PrivPoint)[]>(
    'SELECT module, method FROM t_role_priv WHERE role_id = ? ORDER BY module, method',
    [roleId]
  );
  return rows.map((r) => ({ module: r.module, method: r.method }));
}

/** 列出某账号的角色 id 列表 */
export async function listUserRoleIds(account: string): Promise<number[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    'SELECT role_id FROM t_user_role WHERE account = ?',
    [account]
  );
  return rows.map((r) => Number(r.role_id));
}

// ========================== 对象级 ACL（对应禅道 zt_acl） ==========================

/**
 * 写入对象级 ACL（同对象重复写入时更新类型，对应禅道 zt_acl 的 replace 语义）
 * @param aclType whitelist=仅名单内可见；blacklist=名单内不可见
 */
export async function grantAcl(
  account: string,
  objectType: string,
  objectId: string,
  aclType: 'whitelist' | 'blacklist' = 'whitelist'
): Promise<void> {
  await getDbPool().execute(
    `INSERT INTO t_user_acl (account, object_type, object_id, acl_type) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE acl_type = VALUES(acl_type)`,
    [account, objectType, objectId, aclType]
  );
}

/** 移除一条对象级 ACL */
export async function revokeAcl(account: string, objectType: string, objectId: string): Promise<void> {
  await getDbPool().execute(
    'DELETE FROM t_user_acl WHERE account = ? AND object_type = ? AND object_id = ?',
    [account, objectType, objectId]
  );
}

/**
 * 对象级可见性校验：白名单命中放行；黑名单命中拒绝；无记录默认放行
 * （禅道 zt_acl 的语义：只对配了 ACL 的对象做限制）
 */
export async function checkObjectAcl(account: string, objectType: string, objectId: string): Promise<boolean> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    'SELECT acl_type FROM t_user_acl WHERE account = ? AND object_type = ? AND object_id = ?',
    [account, objectType, objectId]
  );
  if (rows.length === 0) return true;
  return rows[0].acl_type === 'whitelist';
}
