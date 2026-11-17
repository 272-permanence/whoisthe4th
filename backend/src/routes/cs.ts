/**
 * @file 客服聊天 REST 路由（供 HTTP GET 接口使用）
 * @author 第八组
 * @date 2026-11-17
 * @description 客服工作台页面刷新时，通过 REST 拉取初始数据；
 *              实时消息收发仍走 Socket.IO namespace /cs。
 */
import { Router, type Request, type Response } from 'express';
import { getAllOnlineUserList, getConversationHistory } from '../ws/index.js';
import { createLogger } from '../common/logger.js';

const router = Router();
const log = createLogger('cs-rest');

/**
 * GET /api/v1/cs/users
 * 客服工作台：获取当前在线用户列表（含未读数）
 */
router.get('/users', (_req: Request, res: Response) => {
  const list = getAllOnlineUserList();
  res.json({ code: 0, message: 'ok', data: list });
});

/**
 * GET /api/v1/cs/history/:userId
 * 客服工作台：拉取某用户的完整会话历史
 */
router.get('/history/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!userId) {
    res.status(400).json({ code: 4001, message: '缺少 userId 参数', data: null });
    return;
  }
  const history = getConversationHistory(userId);
  log.INFO(`拉取会话历史 userId=${userId} count=${history.length}`);
  res.json({ code: 0, message: 'ok', data: history });
});

export default router;
