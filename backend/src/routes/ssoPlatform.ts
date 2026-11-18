/**
 * @file SSO 模拟平台路由：独立 HTML 登录页 + 票据颁发 + 消费
 * @path  /sso-platform/
 * @note 这个路由组不走 /api/v1/auth/*，因为它要返回 HTML 页面 + 302 重定向（CAS 风格）
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import { authenticate, issueTicket, consumeTicket, listAccounts } from '../services/ssoPlatform.js';

const router = Router();

// SSO 平台同时支持浏览器原生表单（urlencoded）和 fetch JSON 提交
router.use(express.urlencoded({ extended: true }));
router.use(express.json({ type: ['application/json', 'text/plain'] }));

function loginPageHtml(service: string, error?: string): string {
  const accounts = listAccounts();
  const options = accounts.map(a => `<option value="${a.sid}">${a.sid} · ${a.nickname}（${a.org ?? ''}）</option>`).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🔐 学校统一身份认证平台</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
         background: linear-gradient(135deg, #0d9488 0%, #0e7490 100%);
         min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { background: #fff; border-radius: 16px; padding: 40px; width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.25); }
  h1 { font-size: 22px; color: #134e4a; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  label { display: block; font-size: 13px; color: #475569; margin-bottom: 6px; font-weight: 500; }
  input, select { width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;
                  font-size: 14px; margin-bottom: 16px; outline: none; transition: border-color .2s; }
  input:focus, select:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,.1); }
  button { width: 100%; padding: 12px; background: #0d9488; color: #fff; border: none; border-radius: 8px;
           font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s; }
  button:hover { background: #0f766e; }
  .error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 8px;
           font-size: 13px; margin-bottom: 16px; border: 1px solid #fecaca; }
  .demo { background: #f0fdfa; border: 1px dashed #5eead4; border-radius: 8px; padding: 12px;
          margin-top: 20px; font-size: 12px; color: #115e59; }
  .demo strong { color: #0d9488; }
  .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 16px; }
  .service-info { font-size: 11px; color: #94a3b8; word-break: break-all; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="card">
  <h1>🏛️ 学校统一身份认证</h1>
  <p class="subtitle">SSO · Single Sign-On 统一登录平台</p>
  ${error ? `<div class="error">❌ ${error}</div>` : ''}
  <div class="service-info">目标系统：${service}</div>
  <form method="POST" action="/sso-platform/login">
    <input type="hidden" name="service" value="${service.replace(/"/g, '&quot;')}">
    <label>学号 / 工号</label>
    <select name="sid" required>
      <option value="">— 请选择 —</option>
      ${options}
    </select>
    <label>密码</label>
    <input type="password" name="password" placeholder="默认密码 Abc@1234" value="Abc@1234" required>
    <button type="submit">登录统一认证</button>
  </form>
  <div class="demo">
    <strong>💡 演示账号（下拉可选）：</strong><br>
    sso_20260001 · 张三 · 计算机学院<br>
    sso_20260002 · 李四 · 外国语学院<br>
    sso_20260003 · 王五 · 经济管理学院<br>
    密码统一 <code>Abc@1234</code>
  </div>
  <p class="footer">© 2026 景区导览 AI · SSO 模拟平台 v1.0</p>
</div>
</body>
</html>`;
}

/** GET /sso-platform/login?service=xxx */
router.get('/login', (req: Request, res: Response) => {
  const service = String(req.query.service ?? '');
  if (!service) {
    res.status(400).send('缺少 service 参数');
    return;
  }
  res.type('html').send(loginPageHtml(service));
});

/** POST /sso-platform/login（表单提交 → 颁发 ticket → 302 跳回 service） */
router.post('/login', (req: Request, res: Response) => {
  // 支持 urlencoded + JSON 两种（表单提交是 urlencoded，fetch 可能是 JSON）
  const body = req.body ?? {};
  const sid = (body.sid ?? body.username ?? '').toString().trim();
  const password = (body.password ?? '').toString();
  const service = (body.service ?? req.query.service ?? '').toString();

  if (!sid || !password || !service) {
    res.type('html').status(400).send(loginPageHtml(service, '参数不完整'));
    return;
  }

  const acc = authenticate(sid, password);
  if (!acc) {
    // 登录失败 → 回登录页（不是 CAS 标准，但 demo 友好）
    res.type('html').status(401).send(loginPageHtml(service, '学号或密码错误'));
    return;
  }

  // 登录成功 → 颁发 ticket → 302 跳回 service
  const entry = issueTicket(service, acc.sid);
  const sep = service.includes('?') ? '&' : '?';
  res.redirect(302, `${service}${sep}ticket=${entry.ticket}`);
});

/** GET /sso-platform/consume?ticket=xxx（主系统内部调，消费票据换 uid） */
router.get('/consume', (req: Request, res: Response) => {
  const ticket = String(req.query.ticket ?? '');
  if (!ticket) { res.status(400).json({ ok: false, error: 'ticket 缺失' }); return; }
  const entry = consumeTicket(ticket);
  if (!entry) { res.status(404).json({ ok: false, error: 'ticket 无效或已过期' }); return; }
  res.json({ ok: true, ...entry });
});

export default router;
