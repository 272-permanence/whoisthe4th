import dotenv from 'dotenv';
import { KB_EMBEDDING_DIMENSION } from './constants/kbConstants.js';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  /** Qdrant 服务地址，留空则使用进程内内存向量库 */
  qdrantUrl: process.env.QDRANT_URL || '',
  /** 向量服务地址（OpenAI 兼容接口），留空则使用本地确定性伪向量 */
  embeddingApiUrl: process.env.EMBEDDING_API_URL || '',
  /** 向量服务访问凭证 */
  embeddingApiKey: process.env.EMBEDDING_API_KEY || '',
  /** 向量模型名，需与成员B 的 RAG 链路保持一致 */
  embeddingModel: process.env.EMBEDDING_MODEL || 'bge-m3',
  /** 向量维度，需与成员B 的 RAG 链路保持一致 */
  embeddingDimension: Number(process.env.EMBEDDING_DIMENSION) || KB_EMBEDDING_DIMENSION
};
