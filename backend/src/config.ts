import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // DashScope 配置（OpenAI 兼容模式）
  dashscope: {
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
    // OpenAI 兼容端点（中国区）
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  },
};
