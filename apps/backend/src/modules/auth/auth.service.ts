import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from './decorators/current-user.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: string;
  private readonly refreshTokenTtlMs: number;
  private readonly resetTokenTtlMs: number;
  private readonly invitationTtlMs: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.accessTokenTtl = configService.get<string>('JWT_ACCESS_TTL', '15m');
    // On autorise: nombre (ms), string numérique, ou forme humaine ("30d", "12h", "15m", "45s").
    const DEFAULT_REFRESH_MS = 1000 * 60 * 60 * 24 * 90; // 90 jours
    const rawRefreshTtl: unknown = configService.get(
      'JWT_REFRESH_TTL_MS',
      DEFAULT_REFRESH_MS,
    );
    this.refreshTokenTtlMs = this.parseDurationMs(
      rawRefreshTtl,
      DEFAULT_REFRESH_MS,
    );
    this.resetTokenTtlMs = configService.get<number>(
      'RESET_TOKEN_TTL_MS',
      1000 * 60 * 60,
    ); // 1h
    this.invitationTtlMs = configService.get<number>(
      'INVITATION_TTL_MS',
      1000 * 60 * 60 * 24 * 7,
    ); // 7 jours
  }

  /**
   * Parse un TTL fourni sous forme:
   *  - number (ms déjà)
   *  - string numérique ("3600000")
   *  - string avec suffixe: d (jours), h (heures), m (minutes), s (secondes)
   *  - string composite non supportée => fallback
   */
  private parseDurationMs(input: unknown, fallback: number): number {
    if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
      return input;
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (/^\d+$/.test(trimmed)) {
        const n = Number(trimmed);
        if (Number.isFinite(n) && n > 0) return n;
      }
      const match = trimmed.match(/^(\d+)([dhms])$/i);
      if (match) {
        const value = Number(match[1]);
        if (!Number.isFinite(value) || value <= 0) return fallback;
        const unit = match[2].toLowerCase();
        const mul: Record<string, number> = {
          d: 1000 * 60 * 60 * 24,
          h: 1000 * 60 * 60,
          m: 1000 * 60,
          s: 1000,
        };
        return value * mul[unit];
      }
    }
    return fallback;
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    return {
      id: user.id,
      email: user.email,
    };
  }

  private async issueTokens(user: AuthenticatedUser): Promise<TokenBundle> {
    await this.cleanupRefreshTokens(user.id);

    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.accessTokenTtl,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const refreshHash = this.hashToken(refreshToken);
    const refreshExpiresAtMs = Date.now() + this.refreshTokenTtlMs;
    // Sécurise: si dépassement ou NaN => fallback 90 jours.
    const MAX_TS = 8.64e15; // limite Date
    const DEFAULT_REFRESH_MS = 1000 * 60 * 60 * 24 * 90;
    const safeMs =
      !Number.isFinite(refreshExpiresAtMs) || refreshExpiresAtMs > MAX_TS
        ? Date.now() + DEFAULT_REFRESH_MS
        : refreshExpiresAtMs;
    const refreshExpiresAt = new Date(safeMs);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
    };
  }

  private cleanupRefreshTokens(userId: string) {
    return this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const tokens = await this.issueTokens(user);

    const profile = await this.usersService.findById(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: profile?.displayName ?? user.email,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const hashed = this.hashToken(dto.refreshToken);
    const refresh = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hashed, revokedAt: null },
    });

    if (!refresh || refresh.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    await this.prisma.refreshToken.update({
      where: { id: refresh.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findById(refresh.userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.issueTokens({ id: user.id, email: user.email });
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException(
        'Un utilisateur avec cet email existe déjà',
      );
    }

    // Hasher le mot de passe
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Créer l'utilisateur
    const displayName = dto.displayName ?? email.split('@')[0];
    const user = await this.usersService.createUser({
      email,
      displayName,
      locale: 'fr-FR',
      passwordHash,
    });

    // Générer les tokens
    const tokens = await this.issueTokens({ id: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    };
  }

  async logout(dto: LogoutDto) {
    const hashed = this.hashToken(dto.refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashed, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmail(email.toLowerCase());
    if (!user) {
      // ne pas reveler qu'il n'existe pas
      return { success: true };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.resetTokenTtlMs);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // En production, on enverrait un email. Ici on retourne le token pour dev.
    return {
      resetToken: token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async resetPassword(token: string, password: string) {
    const hashed = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashed },
    });

    if (!record || record.expiresAt < new Date() || record.usedAt) {
      throw new BadRequestException('Token de reinitialisation invalide');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.usersService.updatePassword(record.userId, passwordHash);

    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  async createInvitation(inviterId: string, dto: CreateInvitationDto) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: inviterId,
        teamId: dto.teamId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Vous ne pouvez pas inviter sur cette equipe',
      );
    }

    const email = dto.email.toLowerCase();
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.invitationTtlMs);

    await this.prisma.invitation.create({
      data: {
        email,
        teamId: dto.teamId,
        invitedById: inviterId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      invitationToken: token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async acceptInvitation(body: AcceptInvitationDto) {
    const tokenHash = this.hashToken(body.token);
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation || invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation invalide');
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED', respondedAt: new Date() },
      });
      throw new BadRequestException('Invitation expiree');
    }

    const email = invitation.email.toLowerCase();
    let user = await this.usersService.findByEmail(email);

    const passwordHash = await bcrypt.hash(body.password, 10);

    if (!user) {
      const displayName = body.displayName ?? email.split('@')[0];
      user = await this.usersService.createUser({
        email,
        displayName,
        locale: 'en-US',
        passwordHash,
      } as Prisma.UserCreateInput);
    } else {
      await this.usersService.updatePassword(user.id, passwordHash);
    }

    await this.prisma.membership.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: invitation.teamId,
        },
      },
      update: {
        status: MembershipStatus.ACTIVE,
      },
      create: {
        userId: user.id,
        teamId: invitation.teamId,
        status: MembershipStatus.ACTIVE,
      },
    });

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });

    const tokens = await this.issueTokens({ id: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    };
  }
}
