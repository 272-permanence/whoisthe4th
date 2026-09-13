import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 8000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};