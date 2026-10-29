import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

// /health confere o banco: para monitores de disponibilidade (uptime).
// /health/live só diz que a API está no ar, sem consultar o banco: é o que o
// Docker chama a cada poucos segundos. Assim um banco gerenciado que desliga
// quando ocioso (Neon) não fica acordado o tempo todo por causa disso.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
      });
    }
    return { status: 'ok', database: 'ok' };
  }

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}
