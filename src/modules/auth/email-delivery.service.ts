import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailDeliveryService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('EMAIL_FROM')?.trim();
    const url = this.config.get<string>('EMAIL_VERIFICATION_URL')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    return Boolean(host && from && url && Boolean(user) === Boolean(pass));
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('SMTP email delivery is not configured');
    const host = this.config.get<string>('SMTP_HOST')!.trim();
    const port = this.positiveInteger('SMTP_PORT', 587);
    const secure = this.config.get<string>('SMTP_SECURE', 'false') === 'true';
    const from = this.config.get<string>('EMAIL_FROM')!.trim();
    const url = new URL(this.config.get<string>('EMAIL_VERIFICATION_URL')!);
    url.searchParams.set('token', token);
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    const transport = nodemailer.createTransport({
      host, port, secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    const link = url.toString();
    await transport.sendMail({
      from, to: email, subject: 'Verify your NEXIRA email',
      text: ['Welcome to NEXIRA.','Verify your email address by opening this link:',link,'','If you did not create this account, you can ignore this email.'].join('\n'),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Welcome to NEXIRA</h2><p>Confirm your email address to secure your account.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#6A2BE2;color:#fff;text-decoration:none;border-radius:8px">Verify email</a></p><p>If the button does not work, open this link:</p><p><a href="${link}">${link}</a></p><p>If you did not create this account, you can ignore this email.</p></div>`,
    });
  }

  private positiveInteger(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
  }
}
