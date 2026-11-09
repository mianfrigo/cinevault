import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BlockListService } from './blocklist.service';
import { EmailTokensService } from './email-tokens.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

@Module({
  // Secret and algorithm are passed per call in TokensService (from ENV).
  imports: [JwtModule.register({}), MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokensService,
    EmailTokensService,
    SessionsService,
    BlockListService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokensService,
    EmailTokensService,
    SessionsService,
    BlockListService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
