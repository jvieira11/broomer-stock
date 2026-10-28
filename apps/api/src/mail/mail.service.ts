import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { Resend } from 'resend';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Reenviar com a mesma chave não manda o e-mail duas vezes.
  idempotencyKey: string;
}

// Remetente de teste do Resend: só entrega para o e-mail dono da conta.
// Troque MAIL_FROM quando o domínio próprio estiver verificado.
const DEFAULT_FROM = 'Broomer Estoque <onboarding@resend.dev>';
const RETRIES = 3;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = config.get<string>('MAIL_FROM') ?? DEFAULT_FROM;
    this.isProduction = config.get('NODE_ENV') === 'production';
    if (!this.resend && this.isProduction) {
      this.logger.warn(
        'RESEND_API_KEY não definida: nenhum e-mail será enviado',
      );
    }
  }

  async send(message: MailMessage) {
    if (!this.resend) {
      // Sem chave no desenvolvimento, o e-mail aparece no terminal da API.
      // Em produção nunca registramos o conteúdo: ele pode ter links de acesso.
      if (!this.isProduction) {
        this.logger.log(
          `E-mail (não enviado, sem RESEND_API_KEY) para ${message.to}: ${message.subject}\n${message.text}`,
        );
      }
      return;
    }

    for (let attempt = 1; ; attempt++) {
      const { data, error } = await this.resend.emails.send(
        {
          from: this.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        { idempotencyKey: message.idempotencyKey },
      );
      if (!error) {
        this.logger.log(`E-mail ${data.id} enviado: ${message.subject}`);
        return;
      }

      // Limite de envio ou falha do lado do Resend: vale tentar de novo.
      const retryable =
        error.statusCode === null ||
        error.statusCode === 429 ||
        error.statusCode >= 500;
      if (!retryable || attempt >= RETRIES) {
        const failure = new Error(
          `Falha ao enviar e-mail (${error.name}): ${error.message}`,
        );
        Sentry.captureException(failure);
        throw failure;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}
