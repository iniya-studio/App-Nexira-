import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { EmailDeliveryService } from './email-delivery.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('EmailDeliveryService', () => {
  const values: Record<string, string> = {};
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'mail-1' });
  let service: EmailDeliveryService;
  beforeEach(() => {
    Object.keys(values).forEach((key) => delete values[key]);
    Object.assign(values, {
      SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false',
      EMAIL_FROM: 'NEXIRA <no-reply@example.test>',
      EMAIL_VERIFICATION_URL: 'https://app.example.test/verify-email',
    });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockClear();
    service = new EmailDeliveryService({ get: (key: string) => values[key] } as ConfigService);
  });
  it('sends a message containing the verification URL and token', async () => {
    await service.sendVerificationEmail('player@example.test', 'token-value');
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.test', port: 587, secure: false }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'player@example.test', text: expect.stringContaining('token=token-value') }));
  });
  it('requires host, sender, URL, and paired SMTP credentials', () => {
    delete values.SMTP_HOST;
    expect(service.isConfigured()).toBe(false);
    values.SMTP_HOST = 'smtp.example.test';
    values.SMTP_USER = 'username';
    expect(service.isConfigured()).toBe(false);
  });
});
