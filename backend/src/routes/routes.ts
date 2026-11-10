/**
 * @file 游览路线查询接口
 * @author 第八组（成员B）
 * @date 2026-11-03
 * @description GET /api/v1/routes 路线列表、GET /api/v1/routes/:id 路线详情。
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { listRoutes, getRouteById } from '../services/poiService.js';
import { HttpError } from '../utils/httpError.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

/** GET /api/v1/routes?theme= */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const theme = typeof req.query.theme === 'string' ? req.query.theme : undefined;
    const data = await listRoutes(theme);
    res.json({ code: 0, message: '获取成功', data });
  } catch (error) {
    next(error);
  }
});

/** GET /api/v1/routes/:id */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, ErrorCodeEnum.INVALID_PARAM, '路线 ID 必须为正整数');
    }
    const data = await getRouteById(id);
    res.json({ code: 0, message: '获取成功', data });
  } catch (error) {
    next(error);
  }
});

export default router;
