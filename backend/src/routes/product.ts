/**
 * @file 商品管理 CRUD 路由
 * @author 第八组（成员C）
 * @date 2026-11-03
 * @description 前缀：/api/v1/products，所有写操作需要 admin 权限
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listProducts,
  findProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  type ProductInput
} from '../services/authDb.js';
import { ErrorCodeEnum } from '../constants/errorCodes.js';

const router = Router();

/** 公开：商品列表（可选 category 过滤） */
router.get('/', (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json({ code: 0, message: 'ok', data: listProducts(category) });
});

/** 公开：商品详情 */
router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'id 非法' });
    return;
  }
  const product = findProductById(id);
  if (!product) {
    res.status(404).json({ code: 404, message: '商品不存在' });
    return;
  }
  res.json({ code: 0, message: 'ok', data: product });
});

/** 创建商品（需要 admin） */
router.post('/', requireRole('admin'), (req: Request, res: Response) => {
  const body = (req.body ?? {}) as ProductInput;
  if (!body.name || body.price === undefined || body.stock === undefined) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'name / price / stock 必填' });
    return;
  }
  if (body.price < 0 || body.stock < 0) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'price / stock 不能为负' });
    return;
  }
  const id = createProduct({
    name: body.name,
    description: body.description,
    price: body.price,
    stock: body.stock,
    category: body.category,
    imageUrl: body.imageUrl
  });
  res.status(201).json({ code: 0, message: '创建成功', data: { id } });
});

/** 更新商品（需要 admin） */
router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'id 非法' });
    return;
  }
  const body = (req.body ?? {}) as Partial<ProductInput>;
  const changed = updateProduct(id, body);
  if (changed === 0) {
    res.status(404).json({ code: 404, message: '商品不存在' });
    return;
  }
  res.json({ code: 0, message: '更新成功' });
});

/** 删除商品（需要 admin） */
router.delete('/:id', requireRole('admin'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ code: ErrorCodeEnum.INVALID_PARAM, message: 'id 非法' });
    return;
  }
  const changed = deleteProduct(id);
  if (changed === 0) {
    res.status(404).json({ code: 404, message: '商品不存在' });
    return;
  }
  res.json({ code: 0, message: '删除成功' });
});

export default router;
