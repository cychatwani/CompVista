import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  async send(message: MailMessage): Promise<string> {
    const apiKey = this.config.get<string>('RESEND_API_KEY') ?? this.config.get<string>('RESEND_EMAIL_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM') ?? this.config.get<string>('RESEND_FROM_EMAIL');
    if (!apiKey || !from) throw new Error('RESEND_API_KEY and EMAIL_FROM are required to send mail');

    const { data, error } = await new Resend(apiKey).emails.send({ from, ...message });
    if (error || !data) throw new Error(`Mail delivery failed: ${error?.message ?? 'unknown Resend error'}`);
    return data.id;
  }
}
