import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { TeamsModule } from '../teams/teams.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    TeamsModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const raw = configService.get<unknown>('JWT_ACCESS_TTL', '15m');
        let seconds = 15 * 60; // default 15 minutes
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
          // raw is milliseconds
          seconds = Math.floor(raw / 1000);
        } else if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (/^\d+$/.test(trimmed)) {
            seconds = Math.floor(Number(trimmed) / 1000);
          } else {
            const m = trimmed.match(/^(\d+)([dhms])$/i);
            if (m) {
              const v = Number(m[1]);
              const u = m[2].toLowerCase();
              const mul: Record<string, number> = {
                d: 86400,
                h: 3600,
                m: 60,
                s: 1,
              };
              seconds = v * (mul[u] ?? 60);
            }
          }
        }
        return {
          secret: configService.get('JWT_SECRET', 'dev-secret'),
          signOptions: { expiresIn: seconds },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
