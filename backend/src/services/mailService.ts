/**
 * @file 邮件发送服务（SMTP，基于 nodemailer）
 * @author 第八组（成员C）
 * @date 2026-11-10
 * @description 统一身份认证的邮箱验证码发信通道。
 *              - QQ 邮箱：SMTP_HOST=smtp.qq.com，端口 465（SSL），密码填「授权码」
 *              - 163 邮箱：SMTP_HOST=smtp.163.com，端口 465（SSL），密码填「授权码」
 *              - 企业邮箱 / 学校邮箱：按运维给的 host / port / 是否 SSL 填写
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

let transporter: Transporter | null = null;

/**
 * 懒加载 SMTP 连接池：只有真正发信时才校验配置，mock 模式不受影响
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;

  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = config.unified.email;
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error(
      'SMTP 未配置完整：请在后端 .env 填写 SMTP_HOST / SMTP_USER / SMTP_PASS（QQ 邮箱需填授权码）'
    );
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass }
  });
  return transporter;
}

/**
 * 发送登录验证码邮件
 * @param to 收件邮箱
 * @param code 6 位验证码
 * @param ttlMinutes 有效期（分钟）
 */
export async function sendLoginCodeMail(to: string, code: string, ttlMinutes: number): Promise<void> {
  const from = config.unified.email.from;

  await getTransporter().sendMail({
    from: `"西湖文化 AI 导览" <${from}>`,
    to,
    subject: `【西湖文化 AI 导览】登录验证码 ${code}`,
    text: `您的登录验证码是 ${code}，${ttlMinutes} 分钟内有效。如非本人操作请忽略本邮件。`,
    html: `
      <div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1a2420;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#0f766e;">西湖文化 AI 导览</h2>
        <p style="margin:0 0 12px;font-size:14px;color:#55605b;">您正在登录导览系统，本次验证码为：</p>
        <p style="margin:0 0 16px;font-size:28px;font-weight:600;letter-spacing:8px;color:#0f766e;">${code}</p>
        <p style="margin:0;font-size:13px;color:#6b7470;">验证码 ${ttlMinutes} 分钟内有效，请勿泄露给他人。如非本人操作，请忽略本邮件。</p>
      </div>
    `
  });
}
