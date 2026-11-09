import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailTokensService } from './email-tokens.service';
import { PasswordService } from './password.service';
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
  ],
  exports: [
    AuthService,
    PasswordService,
    TokensService,
    EmailTokensService,
    SessionsService,
  ],
})
export class AuthModule {}
