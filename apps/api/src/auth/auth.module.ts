import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionGuard } from './session.guard';
import { TokenService } from './token.service';
import { AuthGuard } from './auth.guard';

// PrismaModule and RedisModule are @Global, so their services are injectable here.
@Module({
  imports: [
    // P1-01: access-token JWTs. HS256 with JWT_SECRET (new env; see .env.example).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, TokenService, AuthGuard],
  exports: [AuthService, SessionGuard, TokenService, AuthGuard],
})
export class AuthModule {}
