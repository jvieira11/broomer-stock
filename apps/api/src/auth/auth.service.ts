import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { hashPassword, verifyPassword } from './password';

// Hash fictício (formato válido, nenhuma senha corresponde a ele), usado só
// para gastar o mesmo tempo no login quando o e-mail não existe.
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

const RESET_TTL_MINUTES = 60;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  organization: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        ...publicUser,
        passwordHash: true,
        active: true,
        sessionVersion: true,
      },
    });

    // Mesma mensagem e mesmo tempo de resposta para e-mail inexistente e
    // senha errada, para não revelar quais e-mails têm conta.
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !user.active || !valid) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    return this.session(user.id, user.sessionVersion, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
    });
  }

  // Gera um link de uso único e manda por e-mail. Não diz se a conta existe.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!user?.active) return;

    const token = randomBytes(32).toString('base64url');
    const reset = await this.prisma.$transaction(async (tx) => {
      // Só o link mais recente vale.
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
        },
      });
    });

    const webUrl =
      this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    const link = `${webUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    const message = passwordResetEmail({
      name: user.name,
      link,
      expiresInMinutes: RESET_TTL_MINUTES,
    });

    // Sem await: o tempo de resposta não pode denunciar que a conta existe.
    this.mail
      .send({
        to: user.email,
        ...message,
        idempotencyKey: `password-reset/${reset.id}`,
      })
      .catch((error: unknown) =>
        this.logger.error('E-mail de redefinição não enviado', error),
      );
  }

  async resetPassword(token: string, password: string) {
    const passwordHash = await hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      // Marca como usado na mesma operação que confere: dois cliques no
      // mesmo link não trocam a senha duas vezes.
      const claimed = await tx.passwordResetToken.updateManyAndReturn({
        where: {
          tokenHash: hashToken(token),
          usedAt: null,
          expiresAt: { gt: new Date() },
          user: { active: true },
        },
        data: { usedAt: new Date() },
        select: { userId: true },
      });
      if (claimed.length === 0) {
        throw new BadRequestException(
          'Este link é inválido ou expirou. Peça um novo.',
        );
      }

      await tx.user.update({
        where: { id: claimed[0].userId },
        // Derruba as sessões abertas: quem tinha a senha antiga sai.
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
    });
  }

  async changePassword(current: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const updated = await this.prisma.user.update({
      where: { id: current.id },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        sessionVersion: { increment: 1 },
      },
      select: { sessionVersion: true },
    });
    const payload: JwtPayload = {
      sub: current.id,
      ver: updated.sessionVersion,
    };
    return { token: await this.jwt.signAsync(payload) };
  }

  me(user: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: publicUser,
    });
  }

  private async session<T>(userId: string, sessionVersion: number, user: T) {
    const payload: JwtPayload = { sub: userId, ver: sessionVersion };
    return { token: await this.jwt.signAsync(payload), user };
  }
}
